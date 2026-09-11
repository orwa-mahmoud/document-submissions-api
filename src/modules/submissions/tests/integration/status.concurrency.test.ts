import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertTestDatabase,
  closeServer,
  listen,
  memoryCache,
  staffHeaders,
  truncateAll,
} from "#common/testing/helpers.ts";
import { createApp } from "#composition/app.ts";
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";

const payload = {
  title: "Lock me",
  category: "legal",
  body: "Concurrency body",
};

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

async function createOne(baseUrl: string, key: string): Promise<string> {
  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as { id: string };
  return json.id;
}

test("two parallel PATCH with same If-Match: one 200 one 409 and one audit", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const id = await createOne(baseUrl, "conc-1");
    const headers = {
      ...staffHeaders(),
      "content-type": "application/json",
      "If-Match": '"1"',
    };
    const [a, b] = await Promise.all([
      fetch(`${baseUrl}/submissions/${id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "approved" }),
      }),
      fetch(`${baseUrl}/submissions/${id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "approved" }),
      }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const audits = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM submission_status_audit",
    );
    assert.equal(audits.rows[0].n, "1");
  } finally {
    await closeServer(server);
  }
});

test("sequential stale If-Match is 409", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const id = await createOne(baseUrl, "stale-1");
    const first = await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders(),
        "content-type": "application/json",
        "If-Match": "1",
      },
      body: JSON.stringify({ status: "under_review" }),
    });
    assert.equal(first.status, 200);
    const stale = await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders(),
        "content-type": "application/json",
        "If-Match": '"1"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(stale.status, 409);
    const err = (await stale.json()) as {
      error: { code: string; details: { current_version: number } };
    };
    assert.equal(err.error.code, "stale_version");
    assert.equal(err.error.details.current_version, 2);
  } finally {
    await closeServer(server);
  }
});

test("invalid transition and auth failures", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const id = await createOne(baseUrl, "auth-1");
    await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders(),
        "content-type": "application/json",
        "If-Match": '"1"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    const invalid = await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders(),
        "content-type": "application/json",
        "If-Match": '"2"',
      },
      body: JSON.stringify({ status: "rejected" }),
    });
    assert.equal(invalid.status, 400);
    const noUser = await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        "X-Role": "staff",
        "content-type": "application/json",
        "If-Match": '"2"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(noUser.status, 401);
    const notStaff = await fetch(`${baseUrl}/submissions/${id}/status`, {
      method: "PATCH",
      headers: {
        "X-User-Id": "bob",
        "X-Role": "public",
        "content-type": "application/json",
        "If-Match": '"2"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(notStaff.status, 403);
  } finally {
    await closeServer(server);
  }
});
