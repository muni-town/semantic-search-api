use std::{collections::HashMap, sync::Arc};

use anyhow::Context;
use fastembed::{TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use poem::{
    EndpointExt, Route, Server,
    error::ResponseError,
    handler,
    http::StatusCode,
    listener::TcpListener,
    middleware::AddData,
    post,
    web::{Data, Json},
};

use clap::Parser;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

/// A simple service to generate vector embeddings for text using dense models and bm25 sparse
/// models.
///
/// This allows for indexing using a combination of semantic and keyword search when combined with
/// search engines like Qdrant.
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// The HTTP port to listen on
    #[arg(short, long, default_value_t = 3000, env)]
    port: u16,
}

type Result<T, E = Error> = std::result::Result<T, E>;
#[derive(Debug)]
struct Error(anyhow::Error);
impl From<anyhow::Error> for Error {
    fn from(value: anyhow::Error) -> Self {
        Self(value)
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
impl std::error::Error for Error {}
impl ResponseError for Error {
    fn status(&self) -> poem::http::StatusCode {
        StatusCode::INTERNAL_SERVER_ERROR
    }
}

#[derive(Debug, Deserialize)]
struct Bm25Options {
    avgdl: f32,
    #[serde(default = "default_b")]
    b: f32,
    #[serde(default = "default_k1")]
    k1: f32,
}
fn default_k1() -> f32 {
    1.2
}
fn default_b() -> f32 {
    0.75
}

#[derive(Debug, Deserialize)]
struct PostEmbedBody {
    text: String,
    #[serde(default)]
    dense: bool,
    #[serde(default)]
    bm25: Option<Bm25Options>,
}

#[derive(Serialize)]
struct SparseVector {
    indices: Vec<u32>,
    values: Vec<f32>,
}
impl SparseVector {
    fn with_capacity(c: usize) -> Self {
        SparseVector {
            indices: Vec::with_capacity(c),
            values: Vec::with_capacity(c),
        }
    }

    fn push(&mut self, index: u32, value: f32) {
        self.indices.push(index);
        self.values.push(value);
    }
}

#[derive(Serialize)]
struct PostEmbedResult {
    /// The dense vector computed by an embedding model.
    dense: Option<Vec<f32>>,
    /// The bm25 sparse vector embedding. It is a list of `(index, value)` tuples.
    bm25: Option<SparseVector>,
}

type ModelState = Arc<Mutex<TextEmbedding>>;

#[handler]
async fn post_embed(
    Json(PostEmbedBody {
        text,
        dense: enable_dense,
        bm25: bm25_options,
    }): Json<PostEmbedBody>,
    model: Data<&ModelState>,
) -> Result<Json<PostEmbedResult>> {
    let bm25 = if let Some(bm25_options) = bm25_options {
        let embedder = bm25::EmbedderBuilder::<u32>::with_avgdl(bm25_options.avgdl)
            .b(bm25_options.b)
            .k1(bm25_options.k1)
            .build();
        let result = embedder.embed(&text).0;
        let mut vector = SparseVector::with_capacity(result.len());
        result
            .into_iter()
            .map(|x| (x.index, x.value))
            // Collect into an intermediate hash map to make sure indexes are unique
            .collect::<HashMap<_, _>>()
            .into_iter()
            .for_each(|(i, v)| vector.push(i, v));
        Some(vector)
    } else {
        None
    };

    let dense = if enable_dense {
        let model_ = model.clone();
        let vector = tokio::task::spawn_blocking(move || {
            let mut model = model_.blocking_lock();
            model.embed(vec![text], None)
        })
        .await
        .map_err(anyhow::Error::from)??
        .into_iter()
        .next()
        .unwrap();
        Some(vector)
    } else {
        None
    };

    Ok(Json(PostEmbedResult { dense, bm25 }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let model = TextEmbedding::try_new_from_user_defined(
        UserDefinedEmbeddingModel::new(
            tokio::fs::read("./model/model.onnx").await?,
            TokenizerFiles {
                tokenizer_file: tokio::fs::read("./model/tokenizer.json").await?,
                config_file: tokio::fs::read("./model/config.json").await?,
                special_tokens_map_file: tokio::fs::read("./model/special_tokens_map.json").await?,
                tokenizer_config_file: tokio::fs::read("./model/tokenizer_config.json").await?,
            },
        ),
        Default::default(),
    )
    .context("Could not load model")?;

    let app_base = Route::new().at("/embed", post(post_embed));
    let app = app_base.with(AddData::new(Arc::new(Mutex::new(model))));

    let addr = format!("0.0.0.0:{}", args.port);
    println!("Starting server on: {addr}");
    Server::new(TcpListener::bind(addr)).run(app).await?;
    Ok(())
}
