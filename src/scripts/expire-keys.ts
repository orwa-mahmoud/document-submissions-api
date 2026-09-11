/**
 * One-shot: delete idempotency keys older than IDEMPOTENCY_KEY_TTL_HOURS.
 * Exits when done.
 *
 * I did not add a scheduler, to not introduce new dependencies (BullMQ).
 * Usually I will do one of:
 * 1. Preferred: BullMQ + Redis in this repo — repeatable job, fail / retry / status UI (Bull Board).
 * 2. OS cron / systemd timer / k8s CronJob calling `npm run expire-keys` (clock + logs).
 */
import { loadConfig } from "../common/config.ts";
import { closePool } from "../infrastructure/persistence/pool.ts";
import { deleteOlderThan } from "../modules/submissions/infra/idempotency-repo.ts";

export async function expireIdempotencyKeys(): Promise<number> {
  const { IDEMPOTENCY_KEY_TTL_HOURS } = loadConfig();
  return deleteOlderThan(IDEMPOTENCY_KEY_TTL_HOURS);
}

const invoked = process.argv[1]?.endsWith("expire-keys.ts") === true;
if (invoked) {
  const deleted = await expireIdempotencyKeys();
  console.log(JSON.stringify({ deleted }));
  await closePool();
}
