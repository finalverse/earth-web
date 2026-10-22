//! FSIP 0.1: application semantics, independent of renderer and transport.
//! Geographic evidence never becomes an implicitly georeferenced reconstruction.
use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const VERSION: &str = "0.1";
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub enum FsipVersion {
    #[serde(rename = "0.1")]
    V01,
}
macro_rules! record {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
        #[serde(deny_unknown_fields)]
        pub struct $name { $(pub $field: $ty),* }
    };
}
macro_rules! choice {
    ($name:ident { $($variant:ident),* $(,)? }) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        #[serde(rename_all="snake_case")]
        pub enum $name { $($variant),* }
    };
}
choice!(Layout {
    SchematicExhibition,
    Virtual
});
choice!(Scope {
    ReadContext,
    Preview,
    CreateOwnedPlace,
    InspectReceipt,
    UndoOwnedPlace
});
choice!(ExecutionStatus {
    Prepared,
    Executing,
    Committed,
    Cancelled,
    Unknown,
    Rejected,
    Undone
});
choice!(ErrorCode {
    InvalidManifest,
    Unauthorized,
    Expired,
    Revoked,
    Replay,
    StaleSource,
    RegionUnavailable,
    MissingAsset,
    PermissionDenied,
    BudgetExceeded,
    Conflict,
    Cancelled,
    OutcomeUnknown,
    RecoveryRequired
});
record!(FsipError {
    code: ErrorCode,
    correlation_id: Uuid,
    retry_safe: bool
});
record!(Owner { earth_subject: String, mutsea_agent_id: Option<Uuid> });
record!(Audience {
    grid_id: Uuid,
    region_id: Uuid
});
record!(GeoAnchor {
    crs: String,
    longitude_deg: f64,
    latitude_deg: f64,
    ellipsoidal_height_m: f64,
    vertical_datum: String,
});
record!(LocalFrame {
    frame_id: Uuid, axes: String, metres_per_unit: f64,
    origin: [f64; 3], geo_anchor: Option<GeoAnchor>,
});
record!(TemporalReference {
    kind: String, observed_at: Option<DateTime<Utc>>, source_release_year: Option<u16>,
});
/// Region and purely virtual frames have no geographic anchor by implication.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum SpatialContext {
    Geographic {
        anchor: GeoAnchor,
        temporal: TemporalReference,
    },
    Projected {
        crs: String,
        position_m: [f64; 3],
        vertical_datum: String,
    },
    Local {
        frame: LocalFrame,
    },
    Region {
        audience: Audience,
        frame: LocalFrame,
    },
    Virtual {
        world_id: Uuid,
        frame: LocalFrame,
    },
}
record!(CoordinateTransformReceipt {
    receipt_id: Uuid, from_crs: String, to_crs: String,
    source: [f64; 3], result: [f64; 3], anchor: Option<GeoAnchor>,
    method: String, timestamp: DateTime<Utc>,
});
record!(WorldTransform {
    layout: Layout, source_context: Option<SpatialContext>,
    target: Audience, frame: LocalFrame, description: String,
});
record!(Provenance {
    source: String, record_ids: Vec<String>, license: String,
    attribution: String, sha256: String, generated: bool,
});
record!(WorkspaceRef {
    session_id: Uuid,
    artifact_id: Uuid,
    sha256: String,
    source_execution_id: String,
    title: String,
});
record!(SpatialSession {
    protocol_version: FsipVersion, session_id: Uuid, owner: Owner,
    context: SpatialContext, sequence: u64, created_at: DateTime<Utc>,
});
record!(SpatialArtifact {
    protocol_version: FsipVersion, artifact_id: Uuid, session_id: Uuid, owner: Owner,
    kind: String, context: SpatialContext, provenance: Vec<Provenance>, sha256: String,
});
record!(SpatialIntent {
    protocol_version: FsipVersion,
    intent_id: Uuid,
    session_id: Uuid,
    owner: Owner,
    request: String,
    layout: Layout,
    audience: Audience,
    correlation_id: Uuid,
});
record!(AssetRef {
    package_id: String,
    version: String,
    manifest_sha256: String,
    license: String,
});
record!(ExperienceObject {
    local_id: String, asset: AssetRef, offset_m: [f64; 3], yaw_degrees: f64,
    semantic_type: String, description: String, source_record_ids: Vec<String>,
    generated_geometry: bool,
});
record!(SemanticZone { zone_id: String, title: String, affordances: Vec<String> });
record!(ResourceBudget {
    max_objects: u32,
    max_triangles: u32,
    max_asset_bytes: u64,
    max_lights: u32,
    scripts_allowed: bool,
});
record!(SpatialExperienceManifest {
    protocol_version: FsipVersion, manifest_version: u32, experience_id: Uuid,
    owner: Owner, title: String, source_workspace: Option<WorkspaceRef>,
    world_template: String, transform: WorldTransform, objects: Vec<ExperienceObject>,
    semantic_zones: Vec<SemanticZone>, required_permissions: Vec<Scope>,
    budget: ResourceBudget, provenance: Vec<Provenance>,
    ai_narrative: String, created_at: DateTime<Utc>,
});
record!(SpatialPlan {
    protocol_version: FsipVersion, plan_id: Uuid, experience_id: Uuid,
    owner: Owner, manifest_sha256: String, audience: Audience,
    expires_at: DateTime<Utc>, correlation_id: Uuid,
});
record!(SpatialGrant {
    protocol_version: FsipVersion, grant_id: Uuid, owner: Owner, audience: Audience,
    experience_id: Uuid, manifest_sha256: String, scopes: Vec<Scope>,
    expires_at: DateTime<Utc>, revoked_at: Option<DateTime<Utc>>,
});
record!(SpatialExecution {
    protocol_version: FsipVersion,
    execution_id: Uuid,
    experience_id: Uuid,
    grant_id: Uuid,
    owner: Owner,
    status: ExecutionStatus,
    idempotency_key: Uuid,
    correlation_id: Uuid,
    sequence: u64,
    cancellation_requested: bool,
});
record!(WorldBinding {
    protocol_version: FsipVersion, binding_id: Uuid, experience_id: Uuid,
    manifest_sha256: String, owner: Owner, audience: Audience,
    local_id: String, entity_ids: Vec<Uuid>, source_record_ids: Vec<String>,
});
record!(SpatialReceipt {
    protocol_version: FsipVersion, receipt_id: Uuid, execution_id: Uuid,
    manifest_sha256: String, owner: Owner, audience: Audience,
    status: ExecutionStatus, worldline_operation_id: Option<String>,
    bindings: Vec<WorldBinding>, timestamp: DateTime<Utc>,
});
record!(SpatialPresence {
    protocol_version: FsipVersion, presence_id: Uuid, session_id: Uuid,
    agent_id: Uuid, audience: Audience, role: String, expires_at: DateTime<Utc>,
});

/// Schema root keeps every public object reachable in the published definitions.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    content = "data",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum Document {
    Session(SpatialSession),
    Context(SpatialContext),
    Artifact(SpatialArtifact),
    ArtifactReference(crate::confluence::ArtifactReference),
    Intent(SpatialIntent),
    Plan(SpatialPlan),
    Grant(SpatialGrant),
    Execution(SpatialExecution),
    Receipt(SpatialReceipt),
    Binding(WorldBinding),
    Presence(SpatialPresence),
    Experience(Box<SpatialExperienceManifest>),
    Transform(CoordinateTransformReceipt),
    Error(FsipError),
}

pub fn hash(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn label(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.len() <= max && !value.chars().any(char::is_control)
}
impl GeoAnchor {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.crs == "EPSG:4979" && self.vertical_datum == "WGS84_ELLIPSOID",
            "Explicit WGS84 ellipsoidal coordinates required"
        );
        ensure!(
            self.longitude_deg.is_finite()
                && self.longitude_deg.abs() <= 180.
                && self.latitude_deg.is_finite()
                && self.latitude_deg.abs() <= 90.
                && self.ellipsoidal_height_m.is_finite()
                && (-12000. ..=100000000.).contains(&self.ellipsoidal_height_m),
            "Geographic extent refused"
        );
        Ok(())
    }
}
impl LocalFrame {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.axes == "east_north_up"
                && self.metres_per_unit == 1.
                && self
                    .origin
                    .iter()
                    .all(|v| v.is_finite() && v.abs() <= 4096.),
            "Explicit metre frame required"
        );
        if let Some(a) = &self.geo_anchor {
            a.validate()?;
        }
        Ok(())
    }
}
impl SpatialExperienceManifest {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.protocol_version == FsipVersion::V01 && self.manifest_version == 1,
            "Unsupported FSIP version"
        );
        ensure!(
            hash(&self.owner.earth_subject)
                && label(&self.title, 120)
                && label(&self.ai_narrative, 2048)
                && label(&self.world_template, 120),
            "Invalid ownership or labels"
        );
        self.transform.frame.validate()?;
        ensure!(
            self.transform.frame.geo_anchor.is_none(),
            "Exhibition geometry is not geographically anchored"
        );
        ensure!(
            !self.transform.target.grid_id.is_nil() && !self.transform.target.region_id.is_nil(),
            "Audience required"
        );
        ensure!(
            label(&self.transform.description, 512),
            "Declared world transform required"
        );
        match self.transform.layout {
            Layout::SchematicExhibition => {
                let Some(SpatialContext::Geographic { anchor, temporal }) =
                    &self.transform.source_context
                else {
                    anyhow::bail!("Source geography required");
                };
                anchor.validate()?;
                ensure!(
                    temporal.kind == "archival_snapshot"
                        && temporal.observed_at.is_none()
                        && temporal.source_release_year == Some(2021),
                    "First source adapter requires explicitly archival WRI evidence"
                );
                let workspace = self
                    .source_workspace
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("Source workspace required"))?;
                ensure!(
                    hash(&workspace.sha256)
                        && label(&workspace.source_execution_id, 128)
                        && label(&workspace.title, 120),
                    "Invalid workspace provenance"
                );
                ensure!(
                    self.provenance
                        .iter()
                        .any(|p| !p.generated && !p.record_ids.is_empty()),
                    "Authoritative source evidence required"
                );
            }
            Layout::Virtual => ensure!(
                self.source_workspace.is_none()
                    && self.transform.source_context.is_none()
                    && self.objects.iter().all(|o| o.source_record_ids.is_empty())
                    && self
                        .provenance
                        .iter()
                        .all(|p| p.generated && p.record_ids.is_empty()),
                "Virtual experiences cannot imply Earth evidence"
            ),
        }
        ensure!(
            !self.objects.is_empty()
                && self.objects.len() <= 24
                && self.budget.max_objects > 0
                && self.budget.max_objects <= 256
                && self.budget.max_triangles > 0
                && self.budget.max_triangles <= 65536
                && self.budget.max_asset_bytes > 0
                && self.budget.max_asset_bytes <= 16 * 1024 * 1024
                && self.budget.max_lights <= 12
                && !self.budget.scripts_allowed,
            "Experience resource budget refused"
        );
        ensure!(
            self.required_permissions
                == [
                    Scope::ReadContext,
                    Scope::Preview,
                    Scope::CreateOwnedPlace,
                    Scope::InspectReceipt,
                    Scope::UndoOwnedPlace
                ],
            "Only owned-place scope is supported"
        );
        ensure!(
            !self.semantic_zones.is_empty()
                && self.semantic_zones.len() <= 8
                && self.semantic_zones.iter().all(|z| label(&z.zone_id, 80)
                    && label(&z.title, 120)
                    && !z.affordances.is_empty()
                    && z.affordances.len() <= 8
                    && z.affordances.iter().all(|a| matches!(
                        a.as_str(),
                        "inspect" | "sit" | "walk" | "speak" | "gather"
                    ))),
            "Invalid semantic zones"
        );
        let mut ids = std::collections::HashSet::new();
        for p in &self.provenance {
            ensure!(
                label(&p.source, 256)
                    && label(&p.license, 120)
                    && label(&p.attribution, 512)
                    && hash(&p.sha256)
                    && p.record_ids.len() <= 64
                    && p.record_ids.iter().all(|id| label(id, 128)),
                "Invalid provenance"
            );
        }
        ensure!(
            !self.provenance.is_empty() && self.provenance.len() <= 8,
            "Provenance required"
        );
        for o in &self.objects {
            ensure!(
                label(&o.local_id, 80)
                    && ids.insert(&o.local_id)
                    && label(&o.asset.package_id, 120)
                    && label(&o.asset.version, 40)
                    && hash(&o.asset.manifest_sha256)
                    && o.asset.license == "CC0-1.0"
                    && o.offset_m.iter().all(|v| v.is_finite() && v.abs() <= 28.)
                    && (-2. ..=8.).contains(&o.offset_m[2])
                    && o.yaw_degrees.is_finite()
                    && o.yaw_degrees.abs() <= 360.
                    && label(&o.semantic_type, 80)
                    && label(&o.description, 512)
                    && o.generated_geometry
                    && o.source_record_ids.len() <= 16
                    && o.source_record_ids.iter().all(|id| label(id, 128)),
                "Invalid object or pinned asset"
            );
            ensure!(
                o.source_record_ids.iter().all(|id| self
                    .provenance
                    .iter()
                    .any(|p| !p.generated && p.record_ids.contains(id))),
                "Fabricated source record refused"
            );
        }
        Ok(())
    }
}

pub fn schema() -> serde_json::Value {
    serde_json::to_value(schemars::schema_for!(Document)).expect("FSIP schema serializes")
}
