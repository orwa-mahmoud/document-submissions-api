import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { assertTestDatabase, truncateAll } from "#common/testing/helpers.ts";
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";
import { expireIdempotencyKeys } from "#scripts/expire-keys.ts";

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

test("old key is deleted, fresh key is kept, expire twice is ok", async () => {
  await truncateAll();
  await query(
    `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body, created_at)
     VALUES
       ('old-key', 'h1', 201, '{}'::jsonb, now() - interval '100 hours'),
       ('fresh-key', 'h2', 201, '{}'::jsonb, now())`,
  );
  const first = await expireIdempotencyKeys();
  assert.equal(first, 1);
  const rows = await query<{ key: string }>("SELECT key FROM idempotency_keys ORDER BY key");
  assert.deepEqual(
    rows.rows.map((r) => r.key),
    ["fresh-key"],
  );
  const submissions = await query<{ n: string }>("SELECT count(*)::text AS n FROM submissions");
  assert.equal(submissions.rows[0].n, "0");
  const second = await expireIdempotencyKeys();
  assert.equal(second, 0);
});
