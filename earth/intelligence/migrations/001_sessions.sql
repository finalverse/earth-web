-- Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
-- Dedicated earth_intelligence_* database only. Apply through the operator tool.
CREATE SCHEMA IF NOT EXISTS earth_intelligence;
CREATE TABLE IF NOT EXISTS earth_intelligence.sessions (
 id UUID PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('chat','spatial','code')),
 status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','running','awaiting_approval','closed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 cursor BIGINT NOT NULL DEFAULT 0, event_bytes BIGINT NOT NULL DEFAULT 0,
 CHECK(cursor BETWEEN 0 AND 4096), CHECK(event_bytes BETWEEN 0 AND 8388608)
);
CREATE INDEX IF NOT EXISTS sessions_owner ON earth_intelligence.sessions(owner,updated_at);
CREATE TABLE IF NOT EXISTS earth_intelligence.requests (
 session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 request_id UUID NOT NULL, input_sha256 TEXT NOT NULL, status TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(session_id,request_id)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.events (
 session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 sequence BIGINT NOT NULL, event JSONB NOT NULL, PRIMARY KEY(session_id,sequence),
 CHECK(octet_length(event::text) <= 16384)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.proposals (
 id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 request_id UUID NOT NULL, sha256 TEXT NOT NULL, tool JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executing','completed','revoked','unknown')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(octet_length(tool::text) <= 131072)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.artifacts (
 id UUID PRIMARY KEY, session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, body JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(octet_length(body::text) <= 2097152)
);
CREATE TABLE IF NOT EXISTS earth_intelligence.shares (
 token_sha256 TEXT PRIMARY KEY, session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 artifact_id UUID NOT NULL REFERENCES earth_intelligence.artifacts(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
