use std::sync::Arc;

use poem::{
    Body, EndpointExt, Route, Server,
    error::ResponseError,
    get, handler,
    http::StatusCode,
    listener::TcpListener,
    middleware::AddData,
    post,
    web::{Data, Json, Path},
};

use clap::Parser;
use qdrant_client::{Payload, qdrant::SearchPointsBuilder};
use semantic_search_api::{Engine, Item};
use serde_json::Value;
use tokio::sync::Mutex;
use uuid::{Uuid, uuid};

const UUID_NAMESPACE: Uuid = uuid!("da0ac261-2851-4934-a405-a1df024749cb");

/// Simple program to greet a person
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Name of the person to greet
    #[arg(short, long, default_value = "http://localhost:6334")]
    qdrant_url: String,

    #[arg(short = 'c', long, default_value = "semantic_search_api")]
    qdrant_collection: String,

    /// Number of times to greet
    #[arg(short, long, default_value_t = 3000)]
    listen_port: u16,
}

type EngineState<'a> = &'a Arc<Mutex<Engine>>;

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

#[handler]
async fn get_uuid(Path(id): Path<String>) -> String {
    Uuid::new_v5(&UUID_NAMESPACE, id.as_bytes()).to_string()
}

#[handler]
async fn post_index(
    Path(id): Path<String>,
    body: Body,
    engine: Data<EngineState<'_>>,
) -> Result<Json<Value>> {
    let uuid = Uuid::new_v5(&UUID_NAMESPACE, id.as_bytes());
    let mut engine = engine.lock().await;
    let mut payload = Payload::new();

    payload.insert("id", id);
    engine
        .index([Item {
            id: uuid,
            text: body.into_string().await.map_err(anyhow::Error::from)?,
            payload,
        }])
        .await?;
    let json = serde_json::json!({
        "uuid": uuid,
    });
    Ok(Json(json))
}

#[handler]
async fn post_search(body: Body, engine: Data<EngineState<'_>>) -> Result<Json<Value>> {
    let mut engine = engine.lock().await;
    let mut payload = Payload::new();

    let json = todo!();
    Ok(Json(json))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let engine = Engine::start(&args.qdrant_url, &args.qdrant_collection).await?;

    let app = Route::new()
        .at("/index/:id", post(post_index))
        .at("/uuid/:id", get(get_uuid))
        .at("/search", post(post_search))
        .with(AddData::new(Arc::new(Mutex::new(engine))));

    Server::new(TcpListener::bind(format!("0.0.0.0:{}", args.listen_port)))
        .run(app)
        .await?;
    Ok(())
}
