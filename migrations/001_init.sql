CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 50),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  reference_date date,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  scan_status text NOT NULL DEFAULT 'none'
    CHECK (scan_status IN ('none', 'queued', 'processing', 'done', 'failed')),
  scan_progress integer NOT NULL DEFAULT 0
    CHECK (scan_progress BETWEEN 0 AND 100),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX submissions_created_at_id_idx ON submissions (created_at, id);
CREATE INDEX submissions_category_created_at_id_idx
  ON submissions (category, created_at, id);

CREATE TABLE idempotency_keys (
  key text PRIMARY KEY,
  request_hash text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  submission_id uuid REFERENCES submissions (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submission_status_audit (
  id bigserial PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submissions (id),
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  old_status text NOT NULL,
  new_status text NOT NULL,
  result_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, result_version)
);

CREATE TABLE outbox (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  submission_id uuid REFERENCES submissions (id),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  worker_id text,
  heartbeat_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
