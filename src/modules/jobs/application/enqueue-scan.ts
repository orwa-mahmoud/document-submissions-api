/**
 * Same TX: lock the submission, reject if a scan is still open, write outbox.
 * This handler does not talk to Redis. drain-outbox publishes to Bull (jobId = outbox id).
 */
import { ConflictError, NotFoundError } from "#core/errors.ts";
import { withTransaction } from "#infrastructure/persistence/tx.ts";
import * as scanRepo from "../infra/scan-repo.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function enqueueScan(submissionId: string) {
  if (!UUID_RE.test(submissionId)) {
    throw new NotFoundError();
  }
  return withTransaction(async (client) => {
    if (!(await scanRepo.lockSubmission(client, submissionId))) {
      throw new NotFoundError();
    }
    const openId = await scanRepo.openScanJobId(client, submissionId);
    if (openId) {
      throw new ConflictError("scan_in_progress", "A scan is already in progress", {
        job_id: openId,
      });
    }
    const jobId = await scanRepo.queueScan(client, submissionId);
    return {
      job_id: jobId,
      scan_status: "queued" as const,
      progress: 0,
    };
  });
}
