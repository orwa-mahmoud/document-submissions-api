/**
 * One-shot: take unpublished outbox rows and mark them published.
 * Exits when done.
 *
 * OpenSearch is optional (stretch). Real publish happens here.
 * I did not add OpenSearch, Kafka, or Rabbit, to not introduce new dependencies.
 *
 * Usually I will do one of:
 * 1. Preferred: push the row to BullMQ + Redis in this repo, then a Bull worker upserts OpenSearch
 *    (fail / retry / status UI).
 * 2. Write OpenSearch direct from this job (one consumer, no extra broker).
 * 3. Push to Kafka or Rabbit if the org already runs them.
 */
import { query } from "../infrastructure/persistence/executor.ts";
import { closePool } from "../infrastructure/persistence/pool.ts";

export async function drainOutbox(): Promise<number> {
  const result = await query(`UPDATE outbox SET published_at = now() WHERE published_at IS NULL`);
  return result.rowCount ?? 0;
}

const invoked = process.argv[1]?.endsWith("drain-outbox.ts") === true;
if (invoked) {
  const published = await drainOutbox();
  console.log(JSON.stringify({ published }));
  await closePool();
}
