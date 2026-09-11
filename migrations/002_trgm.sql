CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX submissions_title_trgm_idx ON submissions USING gin (title gin_trgm_ops);
CREATE INDEX submissions_body_trgm_idx ON submissions USING gin (body gin_trgm_ops);
