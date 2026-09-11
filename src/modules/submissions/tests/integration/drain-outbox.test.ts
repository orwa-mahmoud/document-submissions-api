import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { assertTestDatabase, memoryJobQueue, truncateAll } from "#common/testing/helpers.ts";
import type { JobQueue } from "#core/ports.ts";
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";
import { drainOutbox } from "#scripts/drain-outbox.ts";

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

test("drain-outbox publishes each row once and is safe to run twice", async () => {
  await truncateAll();
  await query(
    `INSERT INTO outbox (event_type, payload) VALUES ('submission.upsert', '{"submission_id":"x"}')`,
  );
  const queue = memoryJobQueue();
  assert.equal(await drainOutbox(queue), 1);
  assert.equal(queue.added.length, 1);
  assert.equal(queue.added[0]?.name, "submission.upsert");
  assert.equal(await drainOutbox(queue), 0);
  const left = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM outbox WHERE published_at IS NULL",
  );
  assert.equal(left.rows[0].n, "0");
});

test("Redis down leaves the row unpublished", async () => {
  await truncateAll();
  await query(
    `INSERT INTO outbox (event_type, payload) VALUES ('submission.scan', '{"submission_id":"y"}')`,
  );
  const queue: JobQueue = {
    async add() {
      throw new Error("redis down");
    },
    async get() {
      return undefined;
    },
  };
  assert.equal(await drainOutbox(queue), 0);
  const left = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM outbox WHERE published_at IS NULL",
  );
  assert.equal(left.rows[0].n, "1");
});
