CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS earth;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='earth_app') THEN CREATE ROLE earth_app NOLOGIN; END IF; END $$;
CREATE TABLE earth.datasets (
  id text PRIMARY KEY, version text NOT NULL, owner_id text NOT NULL,
  visibility text NOT NULL CHECK(visibility IN ('public','private')),
  manifest jsonb NOT NULL, registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE earth.features (
  dataset_id text NOT NULL REFERENCES earth.datasets(id), id text NOT NULL,
  properties jsonb NOT NULL, geom geometry(Geometry,4326) NOT NULL,
  PRIMARY KEY(dataset_id,id), CHECK(ST_IsValid(geom)), CHECK(NOT ST_IsEmpty(geom))
);
CREATE INDEX features_geometry_gist ON earth.features USING gist(geom);
CREATE INDEX features_geography_gist ON earth.features USING gist((geom::geography));
ALTER TABLE earth.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE earth.datasets FORCE ROW LEVEL SECURITY;
ALTER TABLE earth.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE earth.features FORCE ROW LEVEL SECURITY;
CREATE POLICY dataset_read ON earth.datasets FOR SELECT USING (
  visibility='public' OR (owner_id=current_setting('earth.principal',true) AND owner_id<>'anonymous')
);
CREATE POLICY dataset_register ON earth.datasets FOR INSERT WITH CHECK (
  owner_id=current_setting('earth.principal',true) AND owner_id<>'anonymous'
);
CREATE POLICY feature_read ON earth.features FOR SELECT USING (
  EXISTS(SELECT FROM earth.datasets d WHERE d.id=dataset_id)
);
CREATE POLICY feature_register ON earth.features FOR INSERT WITH CHECK (
  EXISTS(SELECT FROM earth.datasets d WHERE d.id=dataset_id AND d.owner_id=current_setting('earth.principal',true) AND d.owner_id<>'anonymous')
);
GRANT USAGE ON SCHEMA earth TO earth_app;
GRANT SELECT,INSERT ON earth.datasets,earth.features TO earth_app;
