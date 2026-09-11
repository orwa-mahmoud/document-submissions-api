import type { PoolClient } from "pg";
import { query } from "../../../infrastructure/persistence/executor.ts";

export async function insertUnpublished(
  client: PoolClient,
  eventType: string,
  payload: unknown,
): Promise<void> {
  await query(
    `INSERT INTO outbox (event_type, payload) VALUES ($1, $2)`,
    [eventType, payload],
    client,
  );
}

export async function countUnpublishedFor(submissionId: string): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM outbox
     WHERE published_at IS NULL AND payload->>'submission_id' = $1`,
    [submissionId],
  );
  return Number(result.rows[0]?.n ?? 0);
}
