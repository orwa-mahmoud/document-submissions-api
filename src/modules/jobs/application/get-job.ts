import { NotFoundError } from "../../../core/errors.ts";
import * as jobRepo from "../infra/job-repo.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getJob(id: string) {
  if (!UUID_RE.test(id)) {
    throw new NotFoundError();
  }
  const job = await jobRepo.findJob(id);
  if (!job) {
    throw new NotFoundError();
  }
  return {
    job_id: job.id,
    submission_id: job.submission_id,
    status: job.status,
    progress: job.progress,
    worker_id: job.worker_id,
    attempts: job.attempts,
    last_error: job.last_error,
  };
}
