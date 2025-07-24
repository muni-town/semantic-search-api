use std::sync::Arc;

use anyhow::Context;
use fastembed::{TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use qdrant_client::{
    Qdrant,
    qdrant::{
        CreateCollectionBuilder, Distance, PointStruct, QuantizationType, Query,
        QueryPointsBuilder, ScalarQuantization, UpsertPointsBuilder, VectorParamsBuilder,
        VectorsConfigBuilder, quantization_config::Quantization,
    },
};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use uuid::Uuid;

pub use qdrant_client::Payload;

#[derive(Clone)]
pub struct Engine {
    pub qdrant: Arc<Qdrant>,
    pub qdrant_collection: Arc<str>,
    pub model: Arc<Mutex<TextEmbedding>>,
}

const MODEL_DIMENSION: u64 = 384;
const BATCH_SIZE: usize = 25;

#[derive(Deserialize, Debug, Clone)]
pub struct Item {
    pub id: Uuid,
    pub text: String,
    pub payload: Payload,
}

#[derive(Serialize, Debug, Clone)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
}

impl Engine {
    pub async fn start(qdrant_url: &str, qdrant_collection: &str) -> anyhow::Result<Self> {
        let qdrant = Qdrant::from_url(qdrant_url)
            .build()
            .context("Error starting QDRant client ")?;

        let collection_exists = qdrant.collection_exists(qdrant_collection).await?;
        if !collection_exists {
            qdrant
                .create_collection(
                    CreateCollectionBuilder::new(qdrant_collection).vectors_config(
                        VectorsConfigBuilder::default()
                            .add_vector_params(
                                VectorParamsBuilder::new(MODEL_DIMENSION, Distance::Cosine)
                                    .quantization_config(Quantization::Scalar(
                                        ScalarQuantization {
                                            r#type: QuantizationType::Int8 as i32,
                                            quantile: None,
                                            always_ram: None,
                                        },
                                    )),
                            )
                            .clone(),
                    ),
                )
                .await?;
        }

        let model = TextEmbedding::try_new_from_user_defined(
            UserDefinedEmbeddingModel::new(
                tokio::fs::read("./model/model.onnx").await?,
                TokenizerFiles {
                    tokenizer_file: tokio::fs::read("./model/tokenizer.json").await?,
                    config_file: tokio::fs::read("./model/config.json").await?,
                    special_tokens_map_file: tokio::fs::read("./model/special_tokens_map.json")
                        .await?,
                    tokenizer_config_file: tokio::fs::read("./model/tokenizer_config.json").await?,
                },
            ),
            Default::default(),
        )
        .context("Could not load model")?;

        Ok(Self {
            qdrant: Arc::new(qdrant),
            model: Arc::new(Mutex::new(model)),
            qdrant_collection: Arc::from(qdrant_collection),
        })
    }

    pub async fn index<I: IntoIterator<Item = Item>>(&self, items: I) -> anyhow::Result<()> {
        let items = items.into_iter();
        let mut texts = Vec::new();
        let mut id_payloads = Vec::new();
        items.for_each(|item| {
            texts.push(item.text);
            id_payloads.push((item.id, item.payload));
        });
        let embeddings = self
            .model
            .lock()
            .await
            .embed(texts.clone(), Some(BATCH_SIZE))?;

        let points = id_payloads
            .into_iter()
            .zip(embeddings.into_iter())
            .map(|((id, payload), vector)| PointStruct::new(id.to_string(), vector, payload))
            .collect::<Vec<_>>();
        self.qdrant
            .upsert_points(UpsertPointsBuilder::new(
                self.qdrant_collection.to_string(),
                points,
            ))
            .await?;

        Ok(())
    }

    pub async fn embed_single(&self, text: &str) -> anyhow::Result<Vec<f32>> {
        Ok(self
            .model
            .lock()
            .await
            .embed(vec![text.to_string()], Some(BATCH_SIZE))?
            .into_iter()
            .next()
            .unwrap())
    }

    pub async fn search(
        &self,
        text: &str,
        limit: Option<u64>,
    ) -> anyhow::Result<Vec<SearchResult>> {
        let vector = self.embed_single(text).await?;
        let result = self
            .qdrant
            .query(
                QueryPointsBuilder::new(self.qdrant_collection.to_string())
                    .with_payload(true)
                    .limit(limit.unwrap_or(10))
                    .query(Query::new_nearest(vector)),
            )
            .await?;

        Ok(result
            .result
            .into_iter()
            .filter_map(|x| match x.payload.get("id") {
                Some(v) if v.is_str() => Some(SearchResult {
                    id: v.as_str().unwrap().into(),
                    score: x.score,
                }),
                _ => None,
            })
            .collect())
    }
}
