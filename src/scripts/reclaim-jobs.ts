/**
 * One-shot: reclaim scan jobs stuck in processing whose heartbeat is older
 * than JOB_LEASE_SECONDS. Sets them pending (retry) or failed if attempts
 * are exhausted. Exits when done.
 *
 * I did not add a scheduler, to not introduce new dependencies (BullMQ).
 * Usually I will do one of:
 * 1. Preferred: BullMQ + Redis in this repo — repeatable job, fail / retry / status UI (Bull Board).
 * 2. OS cron / systemd timer / k8s CronJob calling `npm run reclaim-jobs` every minute (clock + logs).
 *
 * A live worker may call the same reclaim function so it does not wait for the scheduler.
 */
import { reclaimStaleJobs } from "#modules/jobs/application/reclaim-stale-jobs.ts";
import { closePool } from "#infrastructure/persistence/pool.ts";

const result = await reclaimStaleJobs();
console.log(JSON.stringify(result));
await closePool();
