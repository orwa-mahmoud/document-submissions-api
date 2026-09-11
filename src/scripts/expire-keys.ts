/**
 * One-shot: delete idempotency keys older than IDEMPOTENCY_KEY_TTL_HOURS.
 * The worker also runs this as a Bull repeatable (EXPIRE_KEYS_EVERY_MS, default 12h).
 */
import { loadConfig } from "#common/config.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";
import { deleteOlderThan } from "#modules/submissions/infra/idempotency-repo.ts";

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
