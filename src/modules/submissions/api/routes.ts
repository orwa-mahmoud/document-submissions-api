import { Router } from "express";
import { requireStaff } from "#common/http/auth.ts";
import type { Cache, Notifier } from "#core/ports.ts";
import { changeStatus } from "../application/change-status.ts";
import { createSubmission } from "../application/create-submission.ts";
import { getSubmission } from "../application/get-submission.ts";
import { listAudit } from "../application/list-audit.ts";
import { changeStatusSchema, createSubmissionSchema } from "./schemas.ts";

function pathId(id: string | string[] | undefined): string {
  return Array.isArray(id) ? (id[0] ?? "") : (id ?? "");
}

export function submissionsRouter(cache: Cache, notifier: Notifier): Router {
  const router = Router();

  router.post("/submissions", async (req, res, next) => {
    try {
      const input = createSubmissionSchema.parse(req.body);
      const result = await createSubmission(req.header("idempotency-key") ?? undefined, input);
      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.setHeader("ETag", `"${result.body.version}"`);
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/submissions/:id/status", requireStaff, async (req, res, next) => {
    try {
      const input = changeStatusSchema.parse(req.body);
      const body = await changeStatus({
        id: pathId(req.params.id),
        status: input.status,
        ifMatch: req.header("if-match") ?? undefined,
        actorId: req.actorId ?? "",
        actorRole: req.actorRole ?? "staff",
        cache,
        notifier,
      });
      res.setHeader("ETag", `"${body.version}"`);
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/submissions/:id/audit", requireStaff, async (req, res, next) => {
    try {
      res.status(200).json(await listAudit(pathId(req.params.id)));
    } catch (err) {
      next(err);
    }
  });

  router.get("/submissions/:id", async (req, res, next) => {
    try {
      const result = await getSubmission(
        pathId(req.params.id),
        req.header("if-none-match") ?? undefined,
        cache,
      );
      res.setHeader("ETag", `"${result.version}"`);
      if (result.status === 304) {
        res.status(304).end();
        return;
      }
      res.status(200).json(result.body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
