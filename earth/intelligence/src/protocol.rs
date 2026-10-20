//! Versioned wire types. Model text is never an executable command.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub const PROTOCOL: &str = "1.0";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    Chat,
    Spatial,
    Code,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewSession {
    pub title: String,
    pub mode: Mode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub request_id: Uuid,
    pub text: String,
    pub model: Option<String>,
    /// Only an operator-authorized code session may read this relative file.
    pub file: Option<String>,
    /// Explicit same-session test receipt, never shared with browsers.
    #[serde(default)]
    pub artifact: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Uuid,
    pub title: String,
    pub mode: Mode,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub cursor: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub protocol_version: String,
    pub session_id: Uuid,
    pub sequence: i64,
    pub request_id: Uuid,
    pub timestamp: DateTime<Utc>,
    #[serde(flatten)]
    pub body: EventBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum EventBody {
    #[serde(rename = "session.started")]
    SessionStarted { mode: Mode },
    #[serde(rename = "message.started")]
    MessageStarted {
        model: String,
        privacy: String,
        user_text: String,
    },
    #[serde(rename = "message.delta")]
    MessageDelta { text: String },
    #[serde(rename = "message.completed")]
    MessageCompleted { usage: Value, generated: bool },
    #[serde(rename = "tool.proposed")]
    ToolProposed {
        proposal_id: Uuid,
        kind: String,
        sha256: String,
    },
    #[serde(rename = "tool.approval_required")]
    ApprovalRequired { proposal_id: Uuid, summary: String },
    #[serde(rename = "tool.started")]
    ToolStarted { proposal_id: Uuid },
    #[serde(rename = "tool.completed")]
    ToolCompleted {
        proposal_id: Uuid,
        artifact_id: Uuid,
        receipt: Value,
    },
    #[serde(rename = "tool.failed")]
    ToolFailed { code: String, outcome: String },
    #[serde(rename = "artifact.created")]
    ArtifactCreated { artifact_id: Uuid, kind: String },
    #[serde(rename = "workspace.updated")]
    WorkspaceUpdated {
        artifact_id: Uuid,
        verified_tool_receipt: Value,
    },
    #[serde(rename = "session.completed")]
    SessionCompleted { resumable: bool },
    #[serde(rename = "session.cancelled")]
    SessionCancelled { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistanceArgs {
    pub dataset: String,
    pub place_id: String,
    pub radius_m: u32,
    pub fuels: Vec<String>,
    pub limit: u16,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClusterArgs {
    pub dataset: String,
    pub place_id: String,
    pub radius_m: u32,
    pub cluster_radius_m: u32,
    pub fuels: Vec<String>,
    pub limit: u16,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TemporalArgs {
    pub dataset: String,
    pub start: String,
    pub end: String,
    pub limit: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "tool", content = "arguments", deny_unknown_fields)]
pub enum Query {
    #[serde(rename = "within_distance")]
    WithinDistance(DistanceArgs),
    #[serde(rename = "cluster_features")]
    ClusterFeatures(ClusterArgs),
    #[serde(rename = "features_during_interval")]
    FeaturesDuringInterval(TemporalArgs),
}
impl Query {
    pub fn plan(&self) -> Value {
        let mut value = serde_json::to_value(self).expect("Typed query serializes");
        value["schema_version"] = Value::from(1);
        value
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Patch {
    pub path: String,
    pub expected_sha256: String,
    pub content: String,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "arguments",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Tool {
    EarthQuery(Query),
    Patch(Patch),
    NodeTest {
        files: Vec<String>,
        #[serde(default)]
        read_files: Vec<String>,
    },
}
impl Tool {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::EarthQuery(_) => "earth_query",
            Self::Patch(_) => "patch",
            Self::NodeTest { .. } => "node_test",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub id: Uuid,
    pub session_id: Uuid,
    pub request_id: Uuid,
    pub sha256: String,
    pub tool: Tool,
    pub status: String,
    pub created_at: DateTime<Utc>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Approval {
    pub proposal_id: Uuid,
    pub sha256: String,
}

pub fn digest(value: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn typed_tools_reject_shells_and_unknown_fields() {
        assert!(
            serde_json::from_value::<Tool>(
                json!({"kind":"shell","arguments":{"command":"whoami"}})
            )
            .is_err()
        );
        assert!(serde_json::from_value::<Patch>(json!({"path":"a.js","content":"a","expected_sha256":"a","explanation":"b","execute":"curl"})).is_err());
    }
    #[test]
    fn exact_event_names_and_correlations_round_trip() {
        let event = Event {
            protocol_version: PROTOCOL.into(),
            session_id: Uuid::new_v4(),
            sequence: 1,
            request_id: Uuid::new_v4(),
            timestamp: Utc::now(),
            body: EventBody::MessageDelta {
                text: "hello".into(),
            },
        };
        let value = serde_json::to_value(&event).unwrap();
        assert_eq!(value["type"], "message.delta");
        assert_eq!(
            serde_json::from_value::<Event>(value).unwrap().request_id,
            event.request_id
        );
    }
}
