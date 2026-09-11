import type { Express } from "express";
import type { Cache } from "../core/ports.ts";
import { submissionsRouter } from "../modules/submissions/index.ts";

export function register(app: Express, deps: { cache: Cache }): void {
  app.use(submissionsRouter(deps.cache));
}
