import { BadRequestError, ConflictError, NotFoundError } from "#core/errors.ts";
import type { Cache, Notifier } from "#core/ports.ts";
import { withTransaction } from "#infrastructure/persistence/tx.ts";
import { UUID_RE } from "../api/schemas.ts";
import { assertTransition } from "../domain/status.ts";
import type { SubmissionStatus } from "../domain/types.ts";
import * as auditRepo from "../infra/audit-repo.ts";
import * as outboxRepo from "../infra/outbox-repo.ts";
import * as submissionRepo from "../infra/submission-repo.ts";

export function parseIfMatch(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") {
    throw new BadRequestError("if_match_required", "If-Match header is required");
  }
  const n = Number(raw.trim().replaceAll('"', ""));
  if (!Number.isInteger(n) || n < 1) {
    throw new BadRequestError("if_match_invalid", "If-Match must be a version");
  }
  return n;
}

export async function changeStatus(input: {
  id: string;
  status: SubmissionStatus;
  ifMatch: string | undefined;
  actorId: string;
  actorRole: string;
  cache: Cache;
  notifier: Notifier;
}): Promise<ReturnType<typeof submissionRepo.toPublic>> {
  if (!UUID_RE.test(input.id)) {
    throw new NotFoundError();
  }
  const expected = parseIfMatch(input.ifMatch);
  const result = await withTransaction(async (client) => {
    const current = await submissionRepo.lockForUpdate(client, input.id);
    if (current.version !== expected) {
      throw new ConflictError("stale_version", "Submission version is stale", {
        current_version: current.version,
        current_status: current.status,
      });
    }
    assertTransition(current.status, input.status);
    const saved = await submissionRepo.saveWithExpectedVersion(
      client,
      input.id,
      expected,
      input.status,
    );
    const audit = await auditRepo.insertAudit(client, {
      submissionId: saved.id,
      actorId: input.actorId,
      actorRole: input.actorRole,
      oldStatus: current.status,
      newStatus: saved.status,
      resultVersion: saved.version,
    });
    await outboxRepo.insertUnpublished(client, "submission.upsert", {
      submission_id: saved.id,
    });
    const payload = JSON.stringify({
      id: audit.id,
      submission_id: saved.id,
      actor_id: input.actorId,
      actor_role: input.actorRole,
      old_status: current.status,
      new_status: saved.status,
      result_version: saved.version,
    });
    await auditRepo.emitStatusChanged(client, payload);
    return { saved, payload };
  });
  await input.cache.del(input.id);
  await input.notifier.notify("submission_events", result.payload);
  return submissionRepo.toPublic(result.saved);
}
