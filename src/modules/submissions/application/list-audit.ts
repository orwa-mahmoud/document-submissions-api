import { NotFoundError } from "../../../core/errors.ts";
import { UUID_RE } from "../api/schemas.ts";
import * as auditRepo from "../infra/audit-repo.ts";
import * as submissionRepo from "../infra/submission-repo.ts";

export async function listAudit(submissionId: string) {
  if (!UUID_RE.test(submissionId)) {
    throw new NotFoundError();
  }
  const existing = await submissionRepo.findById(submissionId);
  if (!existing) {
    throw new NotFoundError();
  }
  const rows = await auditRepo.listBySubmission(submissionId);
  return rows.map((row) => ({
    id: row.id,
    submission_id: row.submission_id,
    actor_id: row.actor_id,
    actor_role: row.actor_role,
    old_status: row.old_status,
    new_status: row.new_status,
    result_version: row.result_version,
    created_at: row.created_at.toISOString(),
  }));
}
