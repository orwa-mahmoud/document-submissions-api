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
import { closePool } from "#infrastructure/persistence/pool.ts";
import { startListener, stopListener } from "../../infra/pg-notifier.ts";

before(async () => {
  assertTestDatabase();
  await truncateAll();
  await startListener();
});

after(async () => {
  await stopListener();
  await closePool();
});

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  match: (text: string) => boolean,
): Promise<string> {
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) {
      return buf;
    }
    buf += decoder.decode(chunk.value, { stream: true });
    if (match(buf)) {
      return buf;
    }
  }
}

test("PATCH appears on SSE with audit id; Last-Event-ID replays", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const created = await fetch(`${baseUrl}/submissions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "sse-1",
      },
      body: JSON.stringify({
        title: "Stream",
        category: "legal",
        body: "sse body",
      }),
    });
    const json = (await created.json()) as { id: string };
    const stream = await fetch(`${baseUrl}/events`, {
      headers: staffHeaders("alice"),
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = stream.body?.getReader();
    assert.ok(reader);
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
    const audit = (await (
      await fetch(`${baseUrl}/submissions/${json.id}/audit`, {
        headers: staffHeaders("alice"),
      })
    ).json()) as { id: string }[];
    const auditId = audit[0].id;
    const live = await readUntil(reader, (t) => t.includes("submission.status_changed"));
    assert.match(live, new RegExp(`id: ${auditId}`));
    await reader.cancel();

    const replay = await fetch(`${baseUrl}/events`, {
      headers: {
        ...staffHeaders("alice"),
        "Last-Event-ID": "0",
      },
    });
    const replayReader = replay.body?.getReader();
    assert.ok(replayReader);
    const replayed = await readUntil(replayReader, (t) => t.includes("submission.status_changed"));
    assert.match(replayed, new RegExp(`id: ${auditId}`));
    await replayReader.cancel();
  } finally {
    await closeServer(server);
  }
});

test("non-staff cannot open the stream", async () => {
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const noUser = await fetch(`${baseUrl}/events`, {
      headers: { "X-Role": "staff" },
    });
    assert.equal(noUser.status, 401);
    const notStaff = await fetch(`${baseUrl}/events`, {
      headers: { "X-User-Id": "bob", "X-Role": "public" },
    });
    assert.equal(notStaff.status, 403);
  } finally {
    await closeServer(server);
  }
});
