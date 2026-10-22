-- Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
-- Session access metadata only; conversations/artifacts remain in their existing tables.
CREATE TABLE IF NOT EXISTS earth_intelligence.confluence_grants (
 id UUID PRIMARY KEY,
 session_id UUID NOT NULL REFERENCES earth_intelligence.sessions(id) ON DELETE CASCADE,
 token_sha256 TEXT NOT NULL UNIQUE,
 actor_id UUID NOT NULL, grid_id UUID NOT NULL, region_id UUID NOT NULL,
 can_propose BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 native_session_id UUID,
 last_seen_at TIMESTAMPTZ,
 CHECK(expires_at > created_at AND expires_at <= created_at + interval '1 hour')
);
CREATE INDEX IF NOT EXISTS confluence_grants_session ON earth_intelligence.confluence_grants(session_id);
