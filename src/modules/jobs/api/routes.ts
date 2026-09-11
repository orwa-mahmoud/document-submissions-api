import { Router } from "express";
import { requireStaff } from "#common/http/auth.ts";
import type { JobQueue } from "#core/ports.ts";
import { enqueueScan } from "../application/enqueue-scan.ts";
import { getJob } from "../application/get-job.ts";

function pathId(id: string | string[] | undefined): string {
  return Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
}

export function jobsRouter(queue: JobQueue): Router {
  const router = Router();
  router.post("/submissions/:id/scan", requireStaff, async (req, res, next) => {
    try {
      const body = await enqueueScan(pathId(req.params.id));
      res.status(202).json(body);
    } catch (err) {
      next(err);
    }
  });
  router.get("/jobs/:id", requireStaff, async (req, res, next) => {
    try {
      res.status(200).json(await getJob(pathId(req.params.id), queue));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
