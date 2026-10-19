-- PostGIS predicates are not leakproof, so PostgreSQL RLS can prevent GiST use.
-- Stored scalar latitude permits a leakproof B-tree prefilter while keeping RLS enabled.
ALTER TABLE earth.features ADD COLUMN point_latitude double precision
  GENERATED ALWAYS AS (CASE WHEN ST_GeometryType(geom)='ST_Point' THEN ST_Y(geom) ELSE NULL END) STORED;
CREATE INDEX features_dataset_latitude ON earth.features(dataset_id,point_latitude);
