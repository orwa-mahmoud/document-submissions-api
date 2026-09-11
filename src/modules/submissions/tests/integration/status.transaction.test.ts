import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertTestDatabase,
  closeServer,
  listen,
  memoryCache,
  staffHeaders,
  truncateAll,
} from "../../../../common/testing/helpers.ts";
import { createApp } from "../../../../composition/app.ts";
import { query } from "../../../../infrastructure/persistence/executor.ts";
import { closePool } from "../../../../infrastructure/persistence/pool.ts";

const payload = {
  title: "Atomic",
  category: "legal",
  body: "Transaction body",
};

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

test("happy path writes status audit and outbox together", async () => {
  await truncateAll();
  const cache = memoryCache();
  const { server, baseUrl } = await listen(createApp({ cache, checkDb: async () => undefined }));
  try {
    const created = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "tx-happy",
      },
      body: JSON.stringify(payload),
    });
    const json = (await created.json()) as { id: string };
    await cache.set(json.id, JSON.stringify({ ...json, version: 1 }));
    const patched = await fetch(`${baseUrl}/submissions/${json.id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders("alice"),
        "content-type": "application/json",
        "If-Match": '"1"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(patched.status, 200);
    const body = (await patched.json()) as { status: string; version: number };
    assert.equal(body.status, "approved");
    assert.equal(body.version, 2);
    const audit = await fetch(`${baseUrl}/submissions/${json.id}/audit`, {
      headers: staffHeaders("alice"),
    });
    const rows = (await audit.json()) as { new_status: string }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0].new_status, "approved");
    const outbox = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM outbox WHERE payload->>'submission_id' = $1`,
      [json.id],
    );
    assert.equal(outbox.rows[0].n, "2");
    assert.equal(await cache.get(json.id), null);
  } finally {
    await closeServer(server);
  }
});

test("failed audit insert rolls back status and outbox", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const created = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "tx-fail",
      },
      body: JSON.stringify(payload),
    });
    const json = (await created.json()) as { id: string };
    await query(`
      CREATE OR REPLACE FUNCTION fail_audit() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_blocked';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await query(`
      CREATE TRIGGER fail_audit_trg
      BEFORE INSERT ON submission_status_audit
      FOR EACH ROW EXECUTE FUNCTION fail_audit()
    `);
    try {
      const patched = await fetch(`${baseUrl}/submissions/${json.id}/status`, {
        method: "PATCH",
        headers: {
          ...staffHeaders(),
          "content-type": "application/json",
          "If-Match": '"1"',
        },
        body: JSON.stringify({ status: "approved" }),
      });
      assert.equal(patched.status, 500);
      const row = await query<{ status: string; version: number }>(
        "SELECT status, version FROM submissions WHERE id = $1",
        [json.id],
      );
      assert.equal(row.rows[0].status, "pending");
      assert.equal(row.rows[0].version, 1);
      const audits = await query<{ n: string }>(
        "SELECT count(*)::text AS n FROM submission_status_audit",
      );
      assert.equal(audits.rows[0].n, "0");
      const extraOutbox = await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM outbox WHERE payload->>'submission_id' = $1`,
        [json.id],
      );
      assert.equal(extraOutbox.rows[0].n, "1");
    } finally {
      await query("DROP TRIGGER IF EXISTS fail_audit_trg ON submission_status_audit");
      await query("DROP FUNCTION IF EXISTS fail_audit()");
    }
  } finally {
    await closeServer(server);
  }
});

test("create replay after PATCH still returns the original 201 body", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const headers = {
      "content-type": "application/json",
      "Idempotency-Key": "replay-after-patch",
    };
    const first = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const original = (await first.json()) as {
      id: string;
      status: string;
      version: number;
    };
    await fetch(`${baseUrl}/submissions/${original.id}/status`, {
      method: "PATCH",
      headers: {
        ...staffHeaders(),
        "content-type": "application/json",
        "If-Match": '"1"',
      },
      body: JSON.stringify({ status: "approved" }),
    });
    const replay = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
    const body = (await replay.json()) as { status: string; version: number };
    assert.equal(body.status, "pending");
    assert.equal(body.version, 1);
  } finally {
    await closeServer(server);
  }
});
