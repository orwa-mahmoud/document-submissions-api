import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "#infrastructure/persistence/executor.ts";
import type { JobRow } from "../domain/types.ts";

export async function submissionExists(client: PoolClient, submissionId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id FROM submissions WHERE id = $1`,
    [submissionId],
    client,
  );
  return result.rows.length > 0;
}

export async function insertScanJob(client: PoolClient, submissionId: string): Promise<JobRow> {
  const id = randomUUID();
  const result = await query<JobRow>(
    `INSERT INTO jobs (id, kind, status, submission_id, progress)
     VALUES ($1, 'document_scan', 'pending', $2, 0)
     RETURNING id, kind, status, attempts, last_error, submission_id, progress, worker_id, heartbeat_at`,
    [id, submissionId],
    client,
  );
  await query(
    `UPDATE submissions SET scan_status = 'queued', scan_progress = 0, updated_at = now()
     WHERE id = $1`,
    [submissionId],
    client,
  );
  return result.rows[0];
}

export async function findJob(id: string): Promise<JobRow | undefined> {
  const result = await query<JobRow>(
    `SELECT id, kind, status, attempts, last_error, submission_id, progress, worker_id, heartbeat_at
     FROM jobs WHERE id = $1`,
    [id],
  );
  return result.rows[0];
}

export async function claimNext(workerId: string): Promise<JobRow | undefined> {
  const result = await query<JobRow>(
    `UPDATE jobs SET status = 'processing', worker_id = $1, heartbeat_at = now()
     WHERE id = (
       SELECT id FROM jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, kind, status, attempts, last_error, submission_id, progress, worker_id, heartbeat_at`,
    [workerId],
  );
  const job = result.rows[0];
  if (job) {
    await query(
      `UPDATE submissions SET scan_status = 'processing', updated_at = now() WHERE id = $1`,
      [job.submission_id],
    );
  }
  return job;
}

export async function writeProgress(job: JobRow, progress: number): Promise<boolean> {
  const result = await query(
    `UPDATE jobs SET progress = $2, heartbeat_at = now()
     WHERE id = $1 AND worker_id = $3 AND status = 'processing'`,
    [job.id, progress, job.worker_id],
  );
  if ((result.rowCount ?? 0) === 0) {
    return false;
  }
  await query(`UPDATE submissions SET scan_progress = $2, updated_at = now() WHERE id = $1`, [
    job.submission_id,
    progress,
  ]);
  return true;
}

export async function finish(
  job: JobRow,
  status: "done" | "failed",
  lastError?: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE jobs SET status = $2, progress = CASE WHEN $2 = 'done' THEN 100 ELSE progress END,
            last_error = $3, heartbeat_at = now()
     WHERE id = $1 AND worker_id = $4 AND status = 'processing'`,
    [job.id, status, lastError ?? null, job.worker_id],
  );
  if ((result.rowCount ?? 0) === 0) {
    return false;
  }
  await query(
    `UPDATE submissions
     SET scan_status = $2, scan_progress = CASE WHEN $2 = 'done' THEN 100 ELSE scan_progress END,
         updated_at = now()
     WHERE id = $1`,
    [job.submission_id, status],
  );
  return true;
}

export async function reclaimStale(leaseSeconds: number, maxAttempts = 5) {
  const retry = await query(
    `UPDATE jobs
     SET status = 'pending', worker_id = NULL, attempts = attempts + 1
     WHERE status = 'processing'
       AND heartbeat_at < now() - make_interval(secs => $1)
       AND attempts < $2`,
    [leaseSeconds, maxAttempts],
  );
  const failed = await query<JobRow>(
    `UPDATE jobs
     SET status = 'failed', last_error = 'lease expired'
     WHERE status = 'processing'
       AND heartbeat_at < now() - make_interval(secs => $1)
       AND attempts >= $2
     RETURNING submission_id`,
    [leaseSeconds, maxAttempts],
  );
  for (const row of failed.rows) {
    await query(`UPDATE submissions SET scan_status = 'failed', updated_at = now() WHERE id = $1`, [
      row.submission_id,
    ]);
  }
  return { retried: retry.rowCount ?? 0, failed: failed.rowCount ?? 0 };
}
