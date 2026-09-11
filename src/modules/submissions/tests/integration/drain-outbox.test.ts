import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { assertTestDatabase, truncateAll } from "#common/testing/helpers.ts";
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

test("drain-outbox marks unpublished rows and is safe to run twice", async () => {
  await truncateAll();
  await query(
    `INSERT INTO outbox (event_type, payload) VALUES ('submission.upsert', '{"submission_id":"x"}')`,
  );
  assert.equal(await drainOutbox(), 1);
  assert.equal(await drainOutbox(), 0);
  const left = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM outbox WHERE published_at IS NULL",
  );
  assert.equal(left.rows[0].n, "0");
});
