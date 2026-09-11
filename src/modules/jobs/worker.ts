/**
 * Postgres jobs table + SKIP LOCKED. Fine at this size.
 * If job types grow and we need more control (retries UI, delays, many queues), move this to
 * BullMQ + Redis in this repo (Bull Board). Persist the job row first, then queue.add.
 */
import { randomUUID } from "node:crypto";
import { reclaimStaleJobs } from "./application/reclaim-stale-jobs.ts";
import { processScan } from "./application/process-scan.ts";

const workerId = `worker-${randomUUID()}`;

export async function runOnce(): Promise<boolean> {
  await reclaimStaleJobs();
  return processScan(workerId);
}

async function loop(): Promise<void> {
  for (;;) {
    const worked = await runOnce();
    if (!worked) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

const invoked = process.argv[1]?.endsWith("worker.ts") === true;
if (invoked) {
  loop().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
