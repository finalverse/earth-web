//! The Node Earth API remains authoritative for geography and provenance.
use crate::{
    config::{bounded_json, client, local_origin},
    protocol::*,
};
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

const APP: &str = "finalverse.intelligence";
#[derive(Clone)]
pub struct Earth {
    origin: String,
    http: reqwest::Client,
}
impl Earth {
    pub fn new(origin: &str) -> Result<Self> {
        Ok(Self {
            origin: local_origin(origin)?.origin().ascii_serialization(),
            http: client()?,
        })
    }
    fn path(&self, path: &str) -> String {
        format!("{}/v1/apps/{APP}{path}", self.origin)
    }
    pub async fn health(&self) -> Result<Value> {
        bounded_json(
            self.http
                .get(format!("{}/readyz", self.origin))
                .send()
                .await?,
            16384,
        )
        .await
    }
    pub async fn datasets(&self) -> Result<Value> {
        bounded_json(
            self.http
                .get(self.path("/catalog/datasets?limit=16"))
                .send()
                .await?,
            128 * 1024,
        )
        .await
    }
    pub async fn reference(&self) -> Result<Value> {
        let plan = json!({"schema_version":1,"tool":"query_features","arguments":{"dataset":"natural-earth-countries","query":"Canada","limit":1}});
        bounded_json(
            self.http
                .post(self.path("/query"))
                .json(&plan)
                .send()
                .await?,
            512 * 1024,
        )
        .await
    }
    pub async fn places(&self) -> Result<Value> {
        let plan = json!({"schema_version":1,"tool":"query_features","arguments":{"dataset":"natural-earth-places","country":"CAN","limit":100}});
        let result = bounded_json(
            self.http
                .post(self.path("/query"))
                .json(&plan)
                .send()
                .await?,
            256 * 1024,
        )
        .await?;
        ensure!(
            result["data"]["truncated"] == false,
            "Incomplete source-place context"
        );
        let features = result["data"]["features"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Invalid source place result"))?;
        ensure!(
            features.iter().all(|f| f["properties"]["country"] == "CAN"),
            "Unexpected source country"
        );
        Ok(Value::Array(features.iter().map(|f| json!({"id":f["id"],"name":f["properties"]["name"],"aliases":f["properties"]["aliases"]})).collect()))
    }
    pub async fn validate(&self, query: &Query) -> Result<Value> {
        let plan = query.plan();
        let reply = bounded_json(
            self.http
                .post(self.path("/query/validate"))
                .json(&plan)
                .send()
                .await?,
            16384,
        )
        .await?;
        ensure!(
            reply["plan"] == plan && reply["requires_review"] == true,
            "Earth did not validate this exact typed proposal"
        );
        Ok(plan)
    }
    pub async fn execute(
        &self,
        query: &Query,
        cancel: CancellationToken,
        correlation: uuid::Uuid,
    ) -> Result<Value> {
        let request = self
            .http
            .post(self.path("/query"))
            .header("X-Request-ID", correlation.to_string())
            .json(&query.plan())
            .send();
        let response = tokio::select! {biased;_ = cancel.cancelled()=>anyhow::bail!("Cancelled"),response=request=>response?};
        let result = bounded_json(response, 1_900_000).await?;
        ensure!(
            result["plan"] == query.plan()
                && result["receipt"]["access"] == "read-only"
                && result["receipt"]["plan_sha256"] == digest(&serde_json::to_vec(&query.plan())?),
            "Earth returned incompatible or incorrectly bound evidence"
        );
        Ok(result)
    }
    pub fn schema() -> Value {
        // This subset has native Rust argument types. Node validates against
        // the actual authoritative tool schemas before any human review.
        let string = json!({"type":"string"});
        let mut distance = json!({"dataset":string,"place_id":{"type":"string"},"radius_m":{"type":"integer","minimum":1,"maximum":500000},"fuels":{"type":"array","items":{"type":"string"}},"limit":{"type":"integer","minimum":1,"maximum":100}});
        let ordinary = distance.clone();
        distance["cluster_radius_m"] = json!({"type":"integer","minimum":1,"maximum":50000});
        let temporal = json!({"dataset":{"type":"string"},"start":{"type":"string"},"end":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100}});
        let branches = [("within_distance",ordinary),("cluster_features",distance),("features_during_interval",temporal)].into_iter().map(|(tool,args)| {
            let required:Vec<_>=args.as_object().unwrap().keys().cloned().collect();
            json!({"type":"object","additionalProperties":false,"required":["tool","arguments"],"properties":{"tool":{"const":tool},"arguments":{"type":"object","additionalProperties":false,"required":required,"properties":args}}})
        }).collect::<Vec<_>>();
        json!({"oneOf":branches})
    }
}

pub fn workspace(result: &Value, title: &str) -> Result<Value> {
    ensure!(
        result["plan"]["arguments"]["dataset"] == "wri-canada-power-plants",
        "Energy browser continuation requires the approved facility dataset"
    );
    let args = &result["plan"]["arguments"];
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let center = result["data"]["analysis"]["center"]
        .as_array()
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Source query center missing"))?;
    ensure!(
        center.len() == 2 && center.iter().all(Value::is_number),
        "Invalid spatial camera center"
    );
    Ok(json!({
      "schema_version":1,"id":uuid::Uuid::new_v4().to_string(),"title":title,"notes":"Explicit Earth Intelligence spatial snapshot; archival source data, not live generation. Imported receipts are unsigned evidence.","application":"finalverse.energy-explorer","created_at":now,"updated_at":now,
      "camera":{"longitude":center[0],"latitude":center[1],"height":560000,"heading":0,"pitch":-std::f64::consts::FRAC_PI_2,"roll":0},
      "layers":[{"id":"wri-canada-power-plants","version":result["provenance"]["dataset_version"].as_str().unwrap_or("archival"),"visible":true}],
      "selected_features":[],"temporal_range":null,"plan":result["plan"],"receipt":result["receipt"],"provenance":[result["provenance"]],"saved_views":[],
      "application_state":{"filters":{"place_id":args["place_id"],"radius_m":args["radius_m"],"cluster_radius_m":args["cluster_radius_m"].as_u64().unwrap_or(10000),"fuels":args["fuels"]},"display_rings":[],"result":result}
    }))
}
