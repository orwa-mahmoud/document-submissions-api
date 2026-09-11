import type { PoolClient } from "pg";
import type { SearchDoc } from "#core/ports.ts";
import { query } from "#infrastructure/persistence/executor.ts";

export type ScanJobRow = {
  id: string;
  submission_id: string;
  published_at: Date | null;
  result: "done" | "failed" | null;
};

export async function lockSubmission(client: PoolClient, submissionId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM submissions WHERE id = $1 FOR UPDATE`,
    [submissionId],
    client,
  );
  return result.rows.length > 0;
}

export async function openScanJobId(
  client: PoolClient,
  submissionId: string,
): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    `SELECT o.id::text AS id
     FROM outbox o
     WHERE o.event_type = 'submission.scan'
       AND o.payload->>'submission_id' = $1
       AND NOT EXISTS (SELECT 1 FROM submission_scans s WHERE s.job_id = o.id::text)
     ORDER BY o.id DESC
     LIMIT 1`,
    [submissionId],
    client,
  );
  return result.rows[0]?.id;
}

export async function queueScan(client: PoolClient, submissionId: string): Promise<string> {
  await query(
    `UPDATE submissions SET scan_status = 'queued', scan_progress = 0, updated_at = now()
     WHERE id = $1`,
    [submissionId],
    client,
  );
  const result = await query<{ id: string }>(
    `INSERT INTO outbox (event_type, payload) VALUES ('submission.scan', $1) RETURNING id::text`,
    [{ submission_id: submissionId }],
    client,
  );
  return result.rows[0].id;
}

export async function findScanJob(id: string): Promise<ScanJobRow | undefined> {
  const result = await query<ScanJobRow>(
    `SELECT o.id::text AS id,
            o.payload->>'submission_id' AS submission_id,
            o.published_at,
            sc.result
     FROM outbox o
     LEFT JOIN submission_scans sc ON sc.job_id = o.id::text
     WHERE o.id = $1 AND o.event_type = 'submission.scan'`,
    [id],
  );
  return result.rows[0];
}

export async function insertResult(
  jobId: string,
  submissionId: string,
  result: "done" | "failed",
  error?: string,
): Promise<void> {
  await query(
    `INSERT INTO submission_scans (job_id, submission_id, result, error)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (job_id) DO NOTHING`,
    [jobId, submissionId, result, error ?? null],
  );
  await query(
    `UPDATE submissions
     SET scan_status = $2, scan_progress = CASE WHEN $2 = 'done' THEN 100 ELSE scan_progress END,
         updated_at = now()
     WHERE id = $1`,
    [submissionId, result],
  );
}

export async function findSubmissionForIndex(id: string): Promise<SearchDoc | undefined> {
  const result = await query<{
    id: string;
    title: string;
    body: string;
    category: string;
    status: string;
    created_at: Date;
    version: number;
  }>(
    `SELECT id, title, body, category, status, created_at, version FROM submissions WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    return undefined;
  }
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    status: row.status,
    created_at: row.created_at.toISOString(),
    version: row.version,
  };
}
