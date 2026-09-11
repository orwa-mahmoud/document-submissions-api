import type { PoolClient } from "pg";
import { ConflictError, NotFoundError } from "../../../core/errors.ts";
import { query } from "../../../infrastructure/persistence/executor.ts";
import type { Submission, SubmissionStatus } from "../domain/types.ts";

export type SubmissionRow = {
  id: string;
  title: string;
  category: string;
  body: string;
  reference_date: string | null;
  status: Submission["status"];
  scan_status: Submission["scan_status"];
  scan_progress: number;
  version: number;
  created_at: Date;
  updated_at: Date;
};

export function toPublic(row: SubmissionRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    body: row.body,
    reference_date: row.reference_date,
    status: row.status,
    scan_status: row.scan_status,
    scan_progress: row.scan_progress,
    version: row.version,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function insertSubmission(
  client: PoolClient,
  input: {
    title: string;
    category: string;
    body: string;
    reference_date?: string;
  },
): Promise<SubmissionRow> {
  const result = await query<SubmissionRow>(
    `INSERT INTO submissions (title, category, body, reference_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, category, body, reference_date, status,
               scan_status, scan_progress, version, created_at, updated_at`,
    [input.title, input.category, input.body, input.reference_date ?? null],
    client,
  );
  return result.rows[0];
}

export async function findById(
  id: string,
  client?: PoolClient,
): Promise<SubmissionRow | undefined> {
  const result = await query<SubmissionRow>(
    `SELECT id, title, category, body, reference_date, status,
            scan_status, scan_progress, version, created_at, updated_at
     FROM submissions WHERE id = $1`,
    [id],
    client,
  );
  return result.rows[0];
}

export async function lockForUpdate(client: PoolClient, id: string): Promise<SubmissionRow> {
  const locked = await query<SubmissionRow>(
    `SELECT id, title, category, body, reference_date, status,
            scan_status, scan_progress, version, created_at, updated_at
     FROM submissions WHERE id = $1 FOR UPDATE`,
    [id],
    client,
  );
  if (!locked.rows[0]) {
    throw new NotFoundError();
  }
  return locked.rows[0];
}

export async function saveWithExpectedVersion(
  client: PoolClient,
  id: string,
  expectedVersion: number,
  status: SubmissionStatus,
): Promise<SubmissionRow> {
  const locked = await query<SubmissionRow>(
    `SELECT id, title, category, body, reference_date, status,
            scan_status, scan_progress, version, created_at, updated_at
     FROM submissions WHERE id = $1 FOR UPDATE`,
    [id],
    client,
  );
  const current = locked.rows[0];
  if (!current) {
    throw new NotFoundError();
  }
  if (current.version !== expectedVersion) {
    throw new ConflictError("stale_version", "Submission version is stale", {
      current_version: current.version,
      current_status: current.status,
    });
  }
  const updated = await query<SubmissionRow>(
    `UPDATE submissions
     SET status = $3, version = version + 1, updated_at = now()
     WHERE id = $1 AND version = $2
     RETURNING id, title, category, body, reference_date, status,
               scan_status, scan_progress, version, created_at, updated_at`,
    [id, expectedVersion, status],
    client,
  );
  if (!updated.rows[0]) {
    throw new ConflictError("stale_version", "Submission version is stale", {
      current_version: current.version,
      current_status: current.status,
    });
  }
  return updated.rows[0];
}
