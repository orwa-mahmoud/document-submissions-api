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
import { reclaimStaleJobs } from "../../application/reclaim-stale-jobs.ts";
import { processScan } from "../../application/process-scan.ts";
import * as jobRepo from "../../infra/job-repo.ts";

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

test("enqueue 202 with progress 0 then worker reaches done 100", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
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
    await processScan("w1");
    const job = (await (
      await fetch(`${baseUrl}/jobs/${body.job_id}`, { headers: staffHeaders() })
    ).json()) as { status: string; progress: number };
    assert.equal(job.status, "done");
    assert.equal(job.progress, 100);
    const sub = (await (await fetch(`${baseUrl}/submissions/${id}`)).json()) as {
      scan_status: string;
      scan_progress: number;
    };
    assert.equal(sub.scan_status, "done");
    assert.equal(sub.scan_progress, 100);
  } finally {
    await closeServer(server);
  }
});

test("unknown job 404 and non-staff 403", async () => {
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const missing = await fetch(`${baseUrl}/jobs/00000000-0000-4000-8000-000000000000`, {
      headers: staffHeaders(),
    });
    assert.equal(missing.status, 404);
    const forbidden = await fetch(`${baseUrl}/jobs/00000000-0000-4000-8000-000000000000`, {
      headers: { "X-User-Id": "x", "X-Role": "public" },
    });
    assert.equal(forbidden.status, 403);
  } finally {
    await closeServer(server);
  }
});

test("stale heartbeat is reclaimed; old worker writes are ignored; reclaim twice is ok", async () => {
  await truncateAll();
  const { server, baseUrl } = await listen(
    createApp({ cache: memoryCache(), checkDb: async () => undefined }),
  );
  try {
    const id = await createSubmission(baseUrl, "job-reclaim");
    const queued = await fetch(`${baseUrl}/submissions/${id}/scan`, {
      method: "POST",
      headers: staffHeaders(),
    });
    const body = (await queued.json()) as { job_id: string };
    await query(
      `UPDATE jobs SET status = 'processing', worker_id = 'old', heartbeat_at = now() - interval '2 hours', attempts = 0
       WHERE id = $1`,
      [body.job_id],
    );
    const first = await reclaimStaleJobs();
    assert.ok(first.retried >= 1);
    const job = await jobRepo.findJob(body.job_id);
    assert.equal(job?.status, "pending");
    assert.equal(job?.worker_id, null);
    const ignored = await jobRepo.writeProgress(
      {
        id: body.job_id,
        kind: "document_scan",
        status: "processing",
        attempts: 1,
        last_error: null,
        submission_id: id,
        progress: 10,
        worker_id: "old",
        heartbeat_at: new Date(),
      },
      50,
    );
    assert.equal(ignored, false);
    const second = await reclaimStaleJobs();
    assert.equal(typeof second.retried, "number");
    await processScan("new-worker");
    const done = await jobRepo.findJob(body.job_id);
    assert.equal(done?.status, "done");
  } finally {
    await closeServer(server);
  }
});
