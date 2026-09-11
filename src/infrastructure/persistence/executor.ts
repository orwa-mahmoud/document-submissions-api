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

export function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function truncateForTests(): Promise<void> {
  await query(`
    TRUNCATE jobs, outbox, submission_status_audit, idempotency_keys, submissions
    RESTART IDENTITY CASCADE
  `);
}
