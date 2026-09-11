import type { PoolClient } from "pg";
import { query } from "#infrastructure/persistence/executor.ts";

export type StoredKey = {
  key: string;
  request_hash: string;
  response_status: number;
  response_body: unknown;
  submission_id: string | null;
};

export async function insertOrReplay(
  client: PoolClient,
  key: string,
  requestHash: string,
): Promise<void> {
  await query(
    `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body)
     VALUES ($1, $2, 0, '{}'::jsonb)`,
    [key, requestHash],
    client,
  );
}

export async function storeResponse(
  client: PoolClient,
  key: string,
  status: number,
  body: unknown,
  submissionId: string,
): Promise<void> {
  await query(
    `UPDATE idempotency_keys
     SET response_status = $2, response_body = $3, submission_id = $4
     WHERE key = $1`,
    [key, status, body, submissionId],
    client,
  );
}

export async function deleteOlderThan(hours: number): Promise<number> {
  const result = await query(
    `DELETE FROM idempotency_keys
     WHERE created_at < now() - make_interval(hours => $1)`,
    [hours],
  );
  return result.rowCount ?? 0;
}

export async function findByKey(key: string): Promise<StoredKey | undefined> {
  const result = await query<StoredKey>(
    `SELECT key, request_hash, response_status, response_body, submission_id
     FROM idempotency_keys WHERE key = $1`,
    [key],
  );
  return result.rows[0];
}
