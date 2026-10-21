-- FSIP bridge metadata only. Native MutSea remains the world authority.
CREATE TABLE IF NOT EXISTS earth_intelligence.bridge_experiences (
 id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 owner TEXT NOT NULL, request_id UUID NOT NULL, input_sha256 TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planning','ready','failed')),
 manifest JSONB, manifest_sha256 TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(session_id,request_id), CHECK(manifest IS NULL OR octet_length(manifest::text)<=65536)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.bridge_grants (
 id UUID PRIMARY KEY, experience_id UUID NOT NULL REFERENCES earth_intelligence.bridge_experiences(id) ON DELETE CASCADE,
 token_sha256 TEXT NOT NULL UNIQUE, actor_id UUID NOT NULL, grid_id UUID NOT NULL, region_id UUID NOT NULL,
 manifest_sha256 TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
 status TEXT NOT NULL CHECK(status IN ('issued','redeemed','executing','committed','cancelled','unknown','undone')),
 plan_id UUID, receipt JSONB, sequence BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(receipt IS NULL OR octet_length(receipt::text)<=65536)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.bridge_events (
 grant_id UUID NOT NULL REFERENCES earth_intelligence.bridge_grants(id) ON DELETE CASCADE,
 sequence BIGINT NOT NULL, status TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(grant_id,sequence)
);
