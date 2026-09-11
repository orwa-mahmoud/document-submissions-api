import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import { loadConfig } from "#common/config.ts";
import type { JobQueue, JobState } from "#core/ports.ts";

export const QUEUE_NAME = "document-submissions";

let queue: Queue | undefined;

export function redisConnection(): ConnectionOptions {
  return { url: loadConfig().REDIS_URL, maxRetriesPerRequest: null };
}

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}

export function alreadyQueued(err: unknown): boolean {
  return err instanceof Error && /already exists/i.test(err.message);
}

function toJobState(state: string, progress: unknown): JobState {
  const n = typeof progress === "number" ? progress : 0;
  if (state === "active") {
    return { status: "processing", progress: n };
  }
  if (state === "completed") {
    return { status: "done", progress: n };
  }
  if (state === "failed") {
    return { status: "failed", progress: n };
  }
  return { status: "queued", progress: n };
}

export const bullJobQueue: JobQueue = {
  async add(name, payload, opts) {
    try {
      await getQueue().add(name, payload, { jobId: opts.jobId });
    } catch (err) {
      if (!alreadyQueued(err)) {
        throw err;
      }
    }
  },
  async get(jobId) {
    const job = await getQueue().getJob(jobId);
    if (!job) {
      return undefined;
    }
    return toJobState(await job.getState(), job.progress);
  },
};

export function createQueueWorker(handler: (job: Job) => Promise<unknown>): Worker {
  return new Worker(QUEUE_NAME, handler, { connection: redisConnection() });
}

export async function registerRepeats(): Promise<void> {
  const { DRAIN_OUTBOX_EVERY_MS, EXPIRE_KEYS_EVERY_MS } = loadConfig();
  const q = getQueue();
  await q.upsertJobScheduler(
    "drain-outbox",
    { every: DRAIN_OUTBOX_EVERY_MS },
    { name: "drain-outbox", data: {} },
  );
  await q.upsertJobScheduler(
    "expire-keys",
    { every: EXPIRE_KEYS_EVERY_MS },
    { name: "expire-keys", data: {} },
  );
}

export async function closeQueue(): Promise<void> {
  if (!queue) {
    return;
  }
  await queue.close();
  queue = undefined;
}
