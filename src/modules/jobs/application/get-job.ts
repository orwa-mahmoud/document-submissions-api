import { NotFoundError } from "#core/errors.ts";
import type { JobQueue } from "#core/ports.ts";
import * as scanRepo from "../infra/scan-repo.ts";

const OUTBOX_ID_RE = /^\d+$/;

export async function getJob(id: string, queue: JobQueue) {
  if (!OUTBOX_ID_RE.test(id)) {
    throw new NotFoundError();
  }
  const row = await scanRepo.findScanJob(id);
  if (!row) {
    throw new NotFoundError();
  }
  if (row.published_at) {
    const state = await queue.get(id);
    if (state) {
      return {
        job_id: row.id,
        submission_id: row.submission_id,
        status: state.status,
        progress: state.progress,
        worker_id: null,
        attempts: 0,
        last_error: null,
      };
    }
  }
  if (row.result === "done") {
    return {
      job_id: row.id,
      submission_id: row.submission_id,
      status: "done" as const,
      progress: 100,
      worker_id: null,
      attempts: 0,
      last_error: null,
    };
  }
  if (row.result === "failed") {
    return {
      job_id: row.id,
      submission_id: row.submission_id,
      status: "failed" as const,
      progress: 0,
      worker_id: null,
      attempts: 0,
      last_error: null,
    };
  }
  return {
    job_id: row.id,
    submission_id: row.submission_id,
    status: "queued" as const,
    progress: 0,
    worker_id: null,
    attempts: 0,
    last_error: null,
  };
}
