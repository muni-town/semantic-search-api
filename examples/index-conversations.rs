use std::collections::HashMap;

use fastembed::{TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use itertools::Itertools;
use qdrant_client::{
    Qdrant,
    qdrant::{
        CreateCollectionBuilder, Distance, PointStruct, QuantizationType, ScalarQuantization,
        UpsertPointsBuilder, Value, VectorParamsBuilder, VectorsConfigBuilder,
        quantization_config::Quantization,
    },
};
use rand::Rng;

#[derive(serde::Deserialize)]
struct Message {
    message: String,
}
#[derive(serde::Deserialize)]
struct Conversation {
    content: Vec<Message>,
}
type Conversations = HashMap<String, Conversation>;

const COLLECTION_NAME: &str = "messages2";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut rng = rand::rng();
    let client = Qdrant::from_url("http://localhost:6334").build()?;

    client.delete_collection(COLLECTION_NAME).await?;
    client
        .create_collection(
            CreateCollectionBuilder::new(COLLECTION_NAME).vectors_config(
                VectorsConfigBuilder::default()
                    .add_vector_params(
                        VectorParamsBuilder::new(384, Distance::Cosine).quantization_config(
                            Quantization::Scalar(ScalarQuantization {
                                r#type: QuantizationType::Int8 as i32,
                                quantile: None,
                                always_ram: None,
                            }),
                        ),
                    )
                    .clone(),
            ),
        )
        .await?;

    // // With default options
    let mut model = TextEmbedding::try_new_from_user_defined(
        UserDefinedEmbeddingModel::new(
            std::fs::read("./model/model.onnx")?,
            TokenizerFiles {
                tokenizer_file: std::fs::read("./model/tokenizer.json")?,
                config_file: std::fs::read("./model/config.json")?,
                special_tokens_map_file: std::fs::read("./model/special_tokens_map.json")?,
                tokenizer_config_file: std::fs::read("./model/tokenizer_config.json")?,
            },
        ),
        Default::default(),
    )?;

    let conversations: Conversations =
        serde_json::from_str(&std::fs::read_to_string("./conversations.json")?)?;
    let chunks = conversations
        .into_values()
        .flat_map(|x| x.content.into_iter().map(|x| x.message))
        .chunks(25);

    for chunk in chunks.into_iter() {
        let chunk = chunk.collect::<Vec<_>>();
        // Generate embeddings with the default batch size, 256
        let embeddings = model.embed(chunk.clone(), None)?;
        let points = chunk
            .into_iter()
            .zip(embeddings.into_iter())
            .map(|(message, vector)| {
                PointStruct::new(
                    rng.random::<u64>(),
                    vector,
                    std::iter::once(("message".to_string(), Value::from(message)))
                        .collect::<HashMap<_, _>>(),
                )
            })
            .collect::<Vec<_>>();
        client
            .upsert_points(UpsertPointsBuilder::new(COLLECTION_NAME, points))
            .await?;
    }

    Ok(())
}
