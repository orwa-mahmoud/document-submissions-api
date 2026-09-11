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
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

async function post(
  baseUrl: string,
  key: string,
  body: Record<string, string>,
): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { id: string };
}

test("title-only and body-only hits plus category filter", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    await post(baseUrl, "s-title", {
      title: "UniqueTitleWord",
      category: "legal",
      body: "aaaa",
    });
    await post(baseUrl, "s-body", {
      title: "Other",
      category: "ops",
      body: "UniqueBodyWord",
    });
    const titleHits = (await (await fetch(`${baseUrl}/search?q=UniqueTitleWord`)).json()) as {
      items: { title: string }[];
    };
    assert.equal(titleHits.items.length, 1);
    assert.equal(titleHits.items[0].title, "UniqueTitleWord");
    const bodyHits = (await (await fetch(`${baseUrl}/search?q=UniqueBodyWord`)).json()) as {
      items: { title: string }[];
    };
    assert.equal(bodyHits.items.length, 1);
    assert.equal(bodyHits.items[0].title, "Other");
    const filtered = (await (await fetch(`${baseUrl}/search?q=Unique&category=ops`)).json()) as {
      items: { category: string }[];
    };
    assert.equal(filtered.items.length, 1);
    assert.equal(filtered.items[0].category, "ops");
  } finally {
    await closeServer(server);
  }
});

test("has_more and same created_at ordered by id", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const a = await post(baseUrl, "p1", {
      title: "PageA",
      category: "legal",
      body: "sharedterm",
    });
    const b = await post(baseUrl, "p2", {
      title: "PageB",
      category: "legal",
      body: "sharedterm",
    });
    const c = await post(baseUrl, "p3", {
      title: "PageC",
      category: "legal",
      body: "sharedterm",
    });
    const stamp = new Date("2024-01-01T00:00:00.000Z");
    await query("UPDATE submissions SET created_at = $1 WHERE id = ANY($2)", [
      stamp,
      [a.id, b.id, c.id],
    ]);
    const expected = [a.id, b.id, c.id].sort();
    const page1 = (await (await fetch(`${baseUrl}/search?q=sharedterm&page=1&limit=2`)).json()) as {
      items: { id: string }[];
      has_more: boolean;
    };
    assert.equal(page1.has_more, true);
    assert.deepEqual(
      page1.items.map((i) => i.id),
      expected.slice(0, 2),
    );
    const page2 = (await (await fetch(`${baseUrl}/search?q=sharedterm&page=2&limit=2`)).json()) as {
      items: { id: string }[];
      has_more: boolean;
    };
    assert.equal(page2.has_more, false);
    assert.deepEqual(
      page2.items.map((i) => i.id),
      expected.slice(2),
    );
  } finally {
    await closeServer(server);
  }
});

test("ILIKE metacharacters and SQL fragments do not dump the table", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    await post(baseUrl, "inj", {
      title: "Safe",
      category: "legal",
      body: "plain",
    });
    for (const q of ["' OR 1=1 --", "'; DROP TABLE submissions; --", "%", "_"]) {
      const res = await fetch(`${baseUrl}/search?q=${encodeURIComponent(q)}`);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { items: unknown[] };
      assert.equal(json.items.length, 0);
    }
    const tables = await query<{ n: string }>("SELECT count(*)::text AS n FROM submissions");
    assert.equal(tables.rows[0].n, "1");
  } finally {
    await closeServer(server);
  }
});
