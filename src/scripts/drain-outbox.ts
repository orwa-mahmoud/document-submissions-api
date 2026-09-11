/**
 * Publish unpublished outbox rows to the job queue (jobId = outbox id), then mark published.
 * Redis down: leave the row unpublished.
 * submission.upsert is the OpenSearch job; the index adapter is not wired yet.
 */
import type { JobQueue } from "#core/ports.ts";
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";

type OutboxRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
};

export async function drainOutbox(queue: JobQueue): Promise<number> {
  const pending = await query<OutboxRow>(
    `SELECT id::text, event_type, payload FROM outbox WHERE published_at IS NULL ORDER BY id`,
  );
  let published = 0;
  for (const row of pending.rows) {
    try {
      await queue.add(row.event_type, row.payload, { jobId: row.id });
    } catch {
      continue;
    }
    await query(`UPDATE outbox SET published_at = now() WHERE id = $1 AND published_at IS NULL`, [
      row.id,
    ]);
    published += 1;
  }
  return published;
}

const invoked = process.argv[1]?.endsWith("drain-outbox.ts") === true;
if (invoked) {
  const { bullJobQueue, closeQueue } = await import("#infrastructure/queue/bull-queue.ts");
  const published = await drainOutbox(bullJobQueue);
  console.log(JSON.stringify({ published }));
  await closeQueue();
  await closePool();
}
