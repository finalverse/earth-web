-- Keep exact source coordinates alongside valid, explicitly derived index/query geometry.
ALTER TABLE earth.features ADD COLUMN source_geometry jsonb;
UPDATE earth.features SET source_geometry=ST_AsGeoJSON(geom,17)::jsonb;
ALTER TABLE earth.features ALTER COLUMN source_geometry SET NOT NULL;
