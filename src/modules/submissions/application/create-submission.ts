import { BadRequestError, ConflictError } from "../../../core/errors.ts";
import { fingerprint } from "../../../core/idempotency/fingerprint.ts";
import { withTransaction } from "../../../infrastructure/persistence/tx.ts";
import type { CreateSubmissionInput } from "../api/schemas.ts";
import * as idempotencyRepo from "../infra/idempotency-repo.ts";
import * as outboxRepo from "../infra/outbox-repo.ts";
import * as submissionRepo from "../infra/submission-repo.ts";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export type CreateResult = {
  status: number;
  body: ReturnType<typeof submissionRepo.toPublic>;
  replayed: boolean;
};

export async function createSubmission(
  key: string | undefined,
  input: CreateSubmissionInput,
): Promise<CreateResult> {
  if (!key || key.trim() === "") {
    throw new BadRequestError("idempotency_key_required", "Idempotency-Key header is required");
  }
  const requestHash = fingerprint("POST", "/submissions", input);
  try {
    return await withTransaction(async (client) => {
      await idempotencyRepo.insertOrReplay(client, key, requestHash);
      const row = await submissionRepo.insertSubmission(client, input);
      await outboxRepo.insertUnpublished(client, "submission.upsert", {
        submission_id: row.id,
      });
      const body = submissionRepo.toPublic(row);
      await idempotencyRepo.storeResponse(client, key, 201, body, row.id);
      return { status: 201, body, replayed: false };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
    const stored = await idempotencyRepo.findByKey(key);
    if (!stored) {
      throw err;
    }
    if (stored.request_hash !== requestHash) {
      throw new ConflictError(
        "idempotency_key_reused",
        "Idempotency-Key was already used with a different body",
      );
    }
    return {
      status: stored.response_status,
      body: stored.response_body as CreateResult["body"],
      replayed: true,
    };
  }
}
