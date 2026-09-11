import * as scanRepo from "../infra/scan-repo.ts";

const STEPS = [0, 40, 70, 100];

export async function processScan(job: {
  id: string;
  updateProgress(n: number): Promise<void>;
}): Promise<void> {
  const row = await scanRepo.findScanJob(job.id);
  if (!row) {
    throw new Error(`scan job ${job.id} not found`);
  }
  try {
    for (const progress of STEPS) {
      await job.updateProgress(progress);
      await new Promise((r) => setTimeout(r, 15));
    }
    await scanRepo.insertResult(job.id, row.submission_id, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : "scan failed";
    await scanRepo.insertResult(job.id, row.submission_id, "failed", message);
    throw err;
  }
}
