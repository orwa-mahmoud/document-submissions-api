import express, { type Express } from "express";
import { errorHandler } from "../common/http/error-handler.ts";
import { requestId } from "../common/http/request-id.ts";
import { noopNotifier, type Cache, type Notifier } from "../core/ports.ts";
import { redisCache } from "../infrastructure/cache/redis.ts";
import { register } from "./register.ts";

export type AppDeps = {
  checkDb?: () => Promise<void>;
  cache?: Cache;
  notifier?: Notifier;
};

async function defaultCheckDb(): Promise<void> {
  const { query } = await import("../infrastructure/persistence/executor.ts");
  await query("SELECT 1");
}

export function createApp(deps: AppDeps = {}): Express {
  const checkDb = deps.checkDb ?? defaultCheckDb;
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.get("/health", async (_req, res) => {
    try {
      await checkDb();
      res.status(200).json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  register(app, {
    cache: deps.cache ?? redisCache,
    notifier: deps.notifier ?? noopNotifier,
  });
  app.use(errorHandler);
  return app;
}
