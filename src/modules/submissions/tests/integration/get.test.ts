import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertTestDatabase,
  closeServer,
  listen,
  memoryCache,
  truncateAll,
} from "#common/testing/helpers.ts";
import { createApp } from "#composition/app.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";

const body = {
  title: "Get me",
  category: "ops",
  body: "Lookup body",
};

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

test("GET returns 200 then 304 on If-None-Match", async () => {
  await truncateAll();
  const cache = memoryCache();
  const { server, baseUrl } = await listen(createApp({ cache, checkDb: async () => undefined }));
  try {
    const created = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "get-1",
      },
      body: JSON.stringify(body),
    });
    const json = (await created.json()) as { id: string };
    const first = await fetch(`${baseUrl}/submissions/${json.id}`);
    assert.equal(first.status, 200);
    const got = (await first.json()) as { id: string; version: number };
    assert.equal(got.id, json.id);
    assert.equal(got.version, 1);
    assert.equal(first.headers.get("etag"), '"1"');
    const second = await fetch(`${baseUrl}/submissions/${json.id}`, {
      headers: { "If-None-Match": '"1"' },
    });
    assert.equal(second.status, 304);
  } finally {
    await closeServer(server);
  }
});

test("GET missing and malformed id are 404", async () => {
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const missing = await fetch(`${baseUrl}/submissions/00000000-0000-4000-8000-000000000000`);
    assert.equal(missing.status, 404);
    const bad = await fetch(`${baseUrl}/submissions/not-a-uuid`);
    assert.equal(bad.status, 404);
    const err = (await bad.json()) as { error: { code: string } };
    assert.equal(err.error.code, "not_found");
  } finally {
    await closeServer(server);
  }
});
