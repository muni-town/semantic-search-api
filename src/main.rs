use poem::{
    Body, EndpointExt, Route, Server,
    error::ResponseError,
    get, handler,
    http::StatusCode,
    listener::TcpListener,
    middleware::AddData,
    post,
    web::{Data, Json, Path, Query},
};

use clap::Parser;
use semantic_search_api::{Engine, Item, Payload, SearchResult};
use serde::Deserialize;
use serde_json::Value;
use uuid::{Uuid, uuid};

const UUID_NAMESPACE: Uuid = uuid!("da0ac261-2851-4934-a405-a1df024749cb");

/// Simple program to greet a person
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Enable the generic embed endpoint, which you may not want exposed in production since it
    /// just lets you submit anything for embedding.
    #[arg(short, long, env)]
    enable_embed_endpoint: bool,

    /// Name of the person to greet
    #[arg(short, long, default_value = "http://localhost:6334", env)]
    qdrant_url: String,

    #[arg(short = 'c', long, default_value = "semantic_search_api", env)]
    qdrant_collection: String,

    /// Number of times to greet
    #[arg(short, long, default_value_t = 3000, env)]
    listen_port: u16,
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

#[handler]
async fn get_uuid(Path(id): Path<String>) -> String {
    Uuid::new_v5(&UUID_NAMESPACE, id.as_bytes()).to_string()
}

#[handler]
async fn post_index(
    Path(id): Path<String>,
    body: Body,
    engine: Data<&Engine>,
) -> Result<Json<Value>> {
    let uuid = Uuid::new_v5(&UUID_NAMESPACE, id.as_bytes());
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
async fn post_embed(body: Body, engine: Data<&Engine>) -> Result<Json<Vec<f32>>> {
    Ok(Json(
        engine
            .embed_single(&body.into_string().await.map_err(anyhow::Error::from)?)
            .await?,
    ))
}

#[derive(Debug, Deserialize)]
struct PostSearchQuery {
    limit: Option<u64>,
}

#[handler]
async fn post_search(
    body: Body,
    engine: Data<&Engine>,
    query: Query<PostSearchQuery>,
) -> Result<Json<Vec<SearchResult>>> {
    let text = body.into_string().await.map_err(anyhow::Error::from)?;
    let results = engine.search(&text, query.limit).await?;
    Ok(Json(results))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let engine = Engine::start(&args.qdrant_url, &args.qdrant_collection).await?;

    let mut app_base = Route::new()
        .at("/index/:id", post(post_index))
        .at("/uuid/:id", get(get_uuid))
        .at("/search", post(post_search));
    if args.enable_embed_endpoint {
        app_base = app_base.at("/embed", post(post_embed));
    }
    let app = app_base.with(AddData::new(engine));

    let addr = format!("0.0.0.0:{}", args.listen_port);
    println!("Starting server on: {addr}");
    Server::new(TcpListener::bind(addr))
        .run(app)
        .await?;
    Ok(())
}
