/**
 * Today: persist the scan on the jobs table (our SKIP LOCKED worker).
 * If we move to BullMQ: drop the jobs table. This write goes to outbox
 * in the same TX. A scheduled publisher sends unpublished rows to Bull
 * so a crash cannot lose the job. Bull then owns status / retry / UI.
 */
import { NotFoundError } from "#core/errors.ts";
import { withTransaction } from "#infrastructure/persistence/tx.ts";
import * as jobRepo from "../infra/job-repo.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function enqueueScan(submissionId: string) {
  if (!UUID_RE.test(submissionId)) {
    throw new NotFoundError();
  }
  return withTransaction(async (client) => {
    if (!(await jobRepo.submissionExists(client, submissionId))) {
      throw new NotFoundError();
    }
    const job = await jobRepo.insertScanJob(client, submissionId);
    return {
      job_id: job.id,
      scan_status: "queued" as const,
      progress: 0,
    };
  });
}
