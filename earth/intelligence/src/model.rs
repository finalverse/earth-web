//! Provider-neutral streaming. Only the verified local Ollama adapter ships.
use crate::config::{bounded_json, client, local_origin};
use anyhow::{Result, bail, ensure};
use async_trait::async_trait;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub provider: String,
    pub name: String,
    pub local: bool,
    pub capabilities: Vec<String>,
    pub provider_fee: u32,
}
pub struct ModelRequest {
    pub model: String,
    pub system: String,
    pub prompt: String,
    pub schema: Option<Value>,
}
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub elapsed_ms: u64,
}

#[async_trait]
pub trait Provider: Send + Sync {
    async fn discover(&self) -> Result<Vec<Model>>;
    async fn generate(
        &self,
        request: ModelRequest,
        cancel: CancellationToken,
        output: mpsc::Sender<String>,
    ) -> Result<Usage>;
}

pub struct Ollama {
    origin: String,
    http: reqwest::Client,
}
impl Ollama {
    pub fn new(origin: &str) -> Result<Self> {
        Ok(Self {
            origin: local_origin(origin)?.origin().ascii_serialization(),
            http: client()?,
        })
    }
}

#[async_trait]
impl Provider for Ollama {
    async fn discover(&self) -> Result<Vec<Model>> {
        let tags = bounded_json(
            self.http
                .get(format!("{}/api/tags", self.origin))
                .timeout(Duration::from_secs(3))
                .send()
                .await?,
            65536,
        )
        .await?;
        let mut result = Vec::new();
        for tag in tags["models"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid provider discovery"))?
            .iter()
            .take(32)
        {
            let Some(name) = tag["name"].as_str() else {
                continue;
            };
            if name.len() > 128
                || !name
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._:/-".contains(&b))
                || name.contains(":cloud")
                || tag.get("remote_model").is_some_and(|v| !v.is_null())
                || tag.get("remote_host").is_some_and(|v| !v.is_null())
            {
                continue;
            }
            result.push(Model {
                provider: "ollama-local".into(),
                name: name.into(),
                local: true,
                capabilities: vec![
                    "completion".into(),
                    "stream".into(),
                    "structured-json".into(),
                ],
                provider_fee: 0,
            });
        }
        Ok(result)
    }

    async fn generate(
        &self,
        request: ModelRequest,
        cancel: CancellationToken,
        output: mpsc::Sender<String>,
    ) -> Result<Usage> {
        ensure!(
            request.prompt.len() <= 65536 && request.system.len() <= 32768,
            "Model input budget"
        );
        let metadata = bounded_json(
            self.http
                .post(format!("{}/api/show", self.origin))
                .json(&json!({"model":request.model}))
                .timeout(Duration::from_secs(3))
                .send()
                .await?,
            512 * 1024,
        )
        .await?;
        ensure!(
            metadata.get("remote_model").is_none_or(Value::is_null)
                && metadata.get("remote_host").is_none_or(Value::is_null)
                && metadata["capabilities"]
                    .as_array()
                    .is_some_and(|values| values.iter().any(|v| v == "completion")),
            "Only verified local completion models may receive the prompt"
        );
        let started = std::time::Instant::now();
        let mut payload = json!({"model":request.model,"stream":true,"messages":[{"role":"system","content":request.system},{"role":"user","content":request.prompt}],"options":{"temperature":0,"num_predict":1600,"num_ctx":8192}});
        if let Some(schema) = request.schema {
            payload["format"] = schema;
        }
        // No POST retries: a failure may have consumed inference already.
        let request = self
            .http
            .post(format!("{}/api/chat", self.origin))
            .json(&payload)
            .send();
        let response = tokio::select! { biased; _ = cancel.cancelled() => bail!("Cancelled"), response = request => response? };
        ensure!(
            response.status().is_success(),
            "Local provider unavailable or refused request"
        );
        let mut stream = response.bytes_stream();
        let mut pending = Vec::new();
        let mut wire_bytes = 0;
        let mut text_bytes = 0;
        let mut usage = Usage::default();
        let mut finished = false;
        loop {
            let chunk = tokio::select! {
                biased; _ = cancel.cancelled() => bail!("Cancelled"),
                chunk = tokio::time::timeout(Duration::from_secs(20), stream.next()) => chunk?
            };
            let Some(chunk) = chunk else { break };
            let chunk = chunk?;
            wire_bytes += chunk.len();
            ensure!(
                wire_bytes <= 2 * 1024 * 1024,
                "Provider stream exceeds budget"
            );
            pending.extend_from_slice(&chunk);
            while let Some(position) = pending.iter().position(|b| *b == b'\n') {
                ensure!(position <= 32768, "Provider line budget");
                let line: Vec<u8> = pending.drain(..=position).collect();
                if line.iter().all(u8::is_ascii_whitespace) {
                    continue;
                }
                let message: Value = serde_json::from_slice(&line)?;
                ensure!(message.get("error").is_none(), "Local provider failed");
                if let Some(delta) = message["message"]["content"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                {
                    text_bytes += delta.len();
                    ensure!(text_bytes <= 96000, "Generated content budget");
                    tokio::select! { biased; _ = cancel.cancelled() => bail!("Cancelled"), result = output.send(delta.into()) => result? }
                }
                // Native tool-call semantics are not silently coerced to text.
                ensure!(
                    message["message"]["tool_calls"]
                        .as_array()
                        .is_none_or(Vec::is_empty),
                    "Unexpected native tool call; use the typed JSON proposal mode"
                );
                if message["done"] == true {
                    usage.input_tokens = message["prompt_eval_count"].as_u64().unwrap_or(0);
                    usage.output_tokens = message["eval_count"].as_u64().unwrap_or(0);
                    finished = true;
                }
            }
            ensure!(pending.len() <= 32768, "Provider line budget");
        }
        ensure!(
            finished && pending.iter().all(u8::is_ascii_whitespace),
            "Incomplete provider stream"
        );
        usage.elapsed_ms = started.elapsed().as_millis() as u64;
        Ok(usage)
    }
}

#[derive(Clone, Default)]
pub struct Router {
    pub providers: Vec<Arc<dyn Provider>>,
    pub preferred: Option<String>,
}
impl Router {
    pub async fn models(&self) -> Vec<Model> {
        let mut result = Vec::new();
        for provider in &self.providers {
            if let Ok(mut models) = provider.discover().await {
                result.append(&mut models);
            }
        }
        result
    }
    pub async fn select(
        &self,
        requested: Option<&str>,
        required: &str,
    ) -> Result<(Arc<dyn Provider>, Model)> {
        let name = requested.or(self.preferred.as_deref());
        for provider in &self.providers {
            if let Ok(models) = provider.discover().await
                && let Some(model) = models.into_iter().find(|model| {
                    model.local
                        && model.provider_fee == 0
                        && model.capabilities.iter().any(|c| c == required)
                        && name.is_none_or(|wanted| wanted == model.name)
                })
            {
                return Ok((provider.clone(), model));
            }
        }
        bail!("No configured local model is available; no cloud fallback was attempted")
    }
}
