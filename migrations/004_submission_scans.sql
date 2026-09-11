CREATE TABLE submission_scans (
  job_id text PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions (id),
  result text NOT NULL CHECK (result IN ('done', 'failed')),
  error text,
  finished_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submission_scans_submission_finished_idx
  ON submission_scans (submission_id, finished_at DESC);
