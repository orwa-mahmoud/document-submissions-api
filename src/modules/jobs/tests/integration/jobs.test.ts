import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  assertTestDatabase,
  closeServer,
  listen,
  memoryCache,
  memoryJobQueue,
  staffHeaders,
  truncateAll,
} from "#common/testing/helpers.ts";
import { createApp } from "#composition/app.ts";
import { query } from "#infrastructure/persistence/executor.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";
import { processScan } from "../../application/process-scan.ts";
import { drainOutbox } from "#scripts/drain-outbox.ts";

before(async () => {
  assertTestDatabase();
  await truncateAll();
});

after(async () => {
  await closePool();
});

async function createSubmission(baseUrl: string, key: string): Promise<string> {
  const res = await fetch(`${baseUrl}/submissions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({
      title: "Scan me",
      category: "legal",
      body: "scan body",
    }),
  });
  const json = (await res.json()) as { id: string };
  return json.id;
}

test("enqueue 202 then follow progress by job id; history row on done", async () => {
  await truncateAll();
  const queue = memoryJobQueue();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined, queue }),
  );
  try {
    const id = await createSubmission(baseUrl, "job-1");
    const queued = await fetch(`${baseUrl}/submissions/${id}/scan`, {
      method: "POST",
      headers: staffHeaders(),
    });
    assert.equal(queued.status, 202);
    const body = (await queued.json()) as {
      job_id: string;
      progress: number;
      scan_status: string;
    };
    assert.equal(body.progress, 0);
    assert.equal(body.scan_status, "queued");
    assert.match(body.job_id, /^\d+$/);

    const beforeDrain = (await (
      await fetch(`${baseUrl}/jobs/${body.job_id}`, { headers: staffHeaders() })
    ).json()) as { status: string; progress: number };
    assert.equal(beforeDrain.status, "queued");
    assert.equal(beforeDrain.progress, 0);

    await drainOutbox(queue);
    await processScan({
      id: body.job_id,
      updateProgress: (n) => queue.updateProgress(body.job_id, n),
    });

    const job = (await (
      await fetch(`${baseUrl}/jobs/${body.job_id}`, { headers: staffHeaders() })
    ).json()) as { status: string; progress: number };
    assert.equal(job.status, "done");
    assert.equal(job.progress, 100);

    const history = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM submission_scans WHERE job_id = $1 AND result = 'done'`,
      [body.job_id],
    );
    assert.equal(history.rows[0].n, "1");
  } finally {
    await closeServer(server);
  }
});

test("second scan while one is open is 409; after done a new scan is 202", async () => {
  await truncateAll();
  const queue = memoryJobQueue();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined, queue }),
  );
  try {
    const id = await createSubmission(baseUrl, "job-again");
    const first = await fetch(`${baseUrl}/submissions/${id}/scan`, {
      method: "POST",
      headers: staffHeaders(),
    });
    assert.equal(first.status, 202);
    const firstBody = (await first.json()) as { job_id: string };
    const again = await fetch(`${baseUrl}/submissions/${id}/scan`, {
      method: "POST",
      headers: staffHeaders(),
    });
    assert.equal(again.status, 409);
    const conflict = (await again.json()) as { error: { details?: { job_id?: string } } };
    assert.equal(conflict.error.details?.job_id, firstBody.job_id);

    await drainOutbox(queue);
    await processScan({
      id: firstBody.job_id,
      updateProgress: (n) => queue.updateProgress(firstBody.job_id, n),
    });

    const rescan = await fetch(`${baseUrl}/submissions/${id}/scan`, {
      method: "POST",
      headers: staffHeaders(),
    });
    assert.equal(rescan.status, 202);
    const rescanBody = (await rescan.json()) as { job_id: string };
    assert.notEqual(rescanBody.job_id, firstBody.job_id);
  } finally {
    await closeServer(server);
  }
});

test("unknown job 404 and non-staff 403", async () => {
  const { server, baseUrl } = await listen(
    createApp({
      cache: memoryCache(),
      checkDb: async () => undefined,
      queue: memoryJobQueue(),
    }),
  );
  try {
    const missing = await fetch(`${baseUrl}/jobs/999999999`, {
      headers: staffHeaders(),
    });
    assert.equal(missing.status, 404);
    const forbidden = await fetch(`${baseUrl}/jobs/1`, {
      headers: { "X-User-Id": "x", "X-Role": "public" },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await closeServer(server);
  }
});
