import type { Job } from "bullmq";
import { noopSearchIndex } from "#core/ports.ts";
import {
  bullJobQueue,
  createQueueWorker,
  fromBullJobId,
  registerRepeats,
} from "#infrastructure/queue/bull-queue.ts";
import { handleUpsert } from "#modules/jobs/application/handle-upsert.ts";
import { processScan } from "#modules/jobs/application/process-scan.ts";
import { drainOutbox } from "#scripts/drain-outbox.ts";
import { expireIdempotencyKeys } from "#scripts/expire-keys.ts";

function submissionId(data: unknown): string {
  if (data && typeof data === "object" && "submission_id" in data) {
    const id = (data as { submission_id: unknown }).submission_id;
    if (typeof id === "string") {
      return id;
    }
  }
  throw new Error("job payload missing submission_id");
}

async function handle(job: Job): Promise<unknown> {
  switch (job.name) {
    case "drain-outbox":
      return drainOutbox(bullJobQueue);
    case "expire-keys":
      return expireIdempotencyKeys();
    case "submission.scan": {
      const jobId = job.id;
      if (!jobId) {
        throw new Error("scan job missing id");
      }
      return processScan({
        id: fromBullJobId(jobId),
        updateProgress: (n) => job.updateProgress(n),
      });
    }
    case "submission.upsert":
      return handleUpsert({ submission_id: submissionId(job.data) }, noopSearchIndex);
    default:
      throw new Error(`unknown job ${job.name}`);
  }
}

await registerRepeats();
const worker = createQueueWorker(handle);
worker.on("failed", (job, err) => {
  console.error("job_failed", job?.id, job?.name, err);
});
console.log("worker listening");
