import { Router } from "express";
import type { Cache } from "../../../core/ports.ts";
import { createSubmission } from "../application/create-submission.ts";
import { getSubmission } from "../application/get-submission.ts";
import { createSubmissionSchema } from "./schemas.ts";

export function submissionsRouter(cache: Cache): Router {
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

  router.get("/submissions/:id", async (req, res, next) => {
    try {
      const result = await getSubmission(
        req.params.id,
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
