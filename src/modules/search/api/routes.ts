import { Router } from "express";
import { searchSubmissions } from "../application/search-submissions.ts";
import { searchQuerySchema } from "./schemas.ts";

export function searchRouter(): Router {
  const router = Router();
  router.get("/search", async (req, res, next) => {
    try {
      const query = searchQuerySchema.parse({
        q: req.query.q,
        category: req.query.category,
        page: req.query.page,
        limit: req.query.limit,
      });
      res.status(200).json(await searchSubmissions(query));
    } catch (err) {
      next(err);
    }
  });
  return router;
}
