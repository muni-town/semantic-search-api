use std::sync::Arc;

use poem::{
    Body, EndpointExt, Route, Server, handler, listener::TcpListener, middleware::AddData, post,
    web::Data,
};

use clap::Parser;
use semantic_search_api::Engine;
use tokio::sync::Mutex;

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

#[handler]
async fn embed_endpoint(body: Body, engine: Data<EngineState<'_>>) -> String {
    let mut engine = engine.lock().await;
    let text = body.into_string().await.unwrap();

    let embed = engine.model.embed(vec![text], None);

    format!("hello: {:?}", embed)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let engine = Engine::start(&args.qdrant_url, &args.qdrant_collection).await?;

    let app = Route::new()
        .at("/embed", post(embed_endpoint))
        .with(AddData::new(Arc::new(Mutex::new(engine))));

    Server::new(TcpListener::bind(format!("0.0.0.0:{}", args.listen_port)))
        .run(app)
        .await?;
    Ok(())
}
