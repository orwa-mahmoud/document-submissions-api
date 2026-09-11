import * as jobRepo from "../infra/job-repo.ts";

const STEPS = [0, 40, 70, 100];

export async function processScan(workerId: string): Promise<boolean> {
  const job = await jobRepo.claimNext(workerId);
  if (!job) {
    return false;
  }
  for (const progress of STEPS) {
    const owned = await jobRepo.writeProgress(job, progress);
    if (!owned) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  await jobRepo.finish(job, "done");
  return true;
}
