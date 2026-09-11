import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { getPool } from "./pool.ts";

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: PoolClient,
): Promise<QueryResult<T>> {
  const runner = client ?? getPool();
  return runner.query<T>(sql, params);
}

const BACKSLASH = String.raw`\\`[0];

export function escapeIlike(value: string): string {
  return value
    .replaceAll(BACKSLASH, String.raw`\\`)
    .replaceAll("%", String.raw`\%`)
    .replaceAll("_", String.raw`\_`);
}

export async function truncateForTests(): Promise<void> {
  await query(`
    TRUNCATE submission_scans, outbox, submission_status_audit, idempotency_keys, submissions
    RESTART IDENTITY CASCADE
  `);
}
