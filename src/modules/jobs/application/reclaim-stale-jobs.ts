import { loadConfig } from "../../../common/config.ts";
import * as jobRepo from "../infra/job-repo.ts";

export async function reclaimStaleJobs() {
  const { JOB_LEASE_SECONDS } = loadConfig();
  return jobRepo.reclaimStale(JOB_LEASE_SECONDS);
}
