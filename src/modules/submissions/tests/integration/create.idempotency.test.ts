import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertTestDatabase,
  closeServer,
  listen,
  memoryCache,
  truncateAll,
} from "../../../../common/testing/helpers.ts";
import { createApp } from "../../../../composition/app.ts";
import { query } from "../../../../infrastructure/persistence/executor.ts";
import { closePool } from "../../../../infrastructure/persistence/pool.ts";
import { countUnpublishedFor } from "../../infra/outbox-repo.ts";

const body = {
  title: "Permit",
  category: "legal",
  body: "A document body",
};

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

test("same key twice creates one row and one unpublished outbox", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "key-once",
    };
    const first = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const second = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.headers.get("Idempotency-Replayed"), "true");
    const a = (await first.json()) as { id: string };
    const b = (await second.json()) as { id: string };
    assert.deepEqual(a, b);
    const count = await query<{ n: string }>("SELECT count(*)::text AS n FROM submissions");
    assert.equal(count.rows[0].n, "1");
    assert.equal(await countUnpublishedFor(a.id), 1);
  } finally {
    await closeServer(server);
  }
});

test("same key different body is 409", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "key-reuse",
    };
    const first = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    assert.equal(first.status, 201);
    const second = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, title: "Other" }),
    });
    assert.equal(second.status, 409);
    const err = (await second.json()) as { error: { code: string } };
    assert.equal(err.error.code, "idempotency_key_reused");
  } finally {
    await closeServer(server);
  }
});

test("five parallel same-key POSTs create one row", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "key-parallel",
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/submissions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }),
      ),
    );
    assert.ok(results.every((r) => r.status === 201));
    const count = await query<{ n: string }>("SELECT count(*)::text AS n FROM submissions");
    assert.equal(count.rows[0].n, "1");
  } finally {
    await closeServer(server);
  }
});

test("missing Idempotency-Key is 400", async () => {
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const res = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400);
  } finally {
    await closeServer(server);
  }
});
