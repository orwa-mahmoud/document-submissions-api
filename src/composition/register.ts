import type { Express } from "express";
import type { Cache, Notifier } from "../core/ports.ts";
import { eventsRouter } from "../modules/notifications/index.ts";
import { searchRouter } from "../modules/search/index.ts";
import { submissionsRouter } from "../modules/submissions/index.ts";

export function register(app: Express, deps: { cache: Cache; notifier: Notifier }): void {
  app.use(submissionsRouter(deps.cache, deps.notifier));
  app.use(searchRouter());
  app.use(eventsRouter());
}
