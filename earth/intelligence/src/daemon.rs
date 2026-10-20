//! Daemon startup owns a database lease; a second runtime cannot replay work.
use crate::{
    api::{Api, router},
    coding::Coding,
    config::Config,
    model::{Ollama, Router},
    runtime::Runtime,
    spatial::Earth,
    store::Store,
};
use anyhow::{Result, ensure};
use sqlx::Row;
use std::{path::Path, sync::Arc};
pub async fn serve(path: &Path) -> Result<()> {
    let config = Config::load(path)?;
    let store = Store::open(&config.database_url_file).await?;
    let mut lease = store.pool.acquire().await?;
    let owned: bool = sqlx::query("SELECT pg_try_advisory_lock(72640805) AS owned")
        .fetch_one(&mut *lease)
        .await?
        .get("owned");
    ensure!(owned, "Another runtime owns this dedicated database");
    store.recover_and_prune(config.retention_days).await?;
    let model_router = Router {
        providers: config
            .ollama_origin
            .as_ref()
            .map(|origin| {
                Ollama::new(origin).map(|p| vec![Arc::new(p) as Arc<dyn crate::model::Provider>])
            })
            .transpose()?
            .unwrap_or_default(),
        preferred: config.default_model.clone(),
    };
    let coding = config
        .code_root
        .as_ref()
        .map(|root| Coding::new(root, config.node_binary.as_deref()))
        .transpose()?;
    let runtime = Runtime::new(
        store,
        model_router,
        Earth::new(&config.earth_origin)?,
        coding,
    );
    let retention_store = runtime.store.clone();
    let stop_retention = runtime.stopping.clone();
    let retention = config.retention_days;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        interval.tick().await;
        loop {
            tokio::select! {
                _ = stop_retention.cancelled() => break,
                _ = interval.tick() => { if retention_store.prune(retention).await.is_err() { tracing::warn!(event="retention_failed"); } }
            }
        }
    });
    let listener = tokio::net::TcpListener::bind(&config.bind).await?;
    let authority = listener.local_addr()?.to_string();
    let state = Api::new(runtime.clone(), authority.clone(), &config.token_files)?;
    let app = router(state, config.browser_assets);
    println!(
        "{}",
        serde_json::json!({"event":"intelligence_ready","origin":format!("http://{authority}"),"version":crate::protocol::VERSION,"protocol_version":crate::protocol::PROTOCOL,"public_runtime":false})
    );
    let shutdown = runtime.clone();
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown_signal().await;
            shutdown.shutdown();
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        })
        .await?;
    drop(lease);
    Ok(())
}
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("Signal handler");
        tokio::select! {_=tokio::signal::ctrl_c()=>{},_=term.recv()=>{}}
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
