import { createServer, type RequestListener, type Server } from "node:http";
import type { Express } from "express";
import { truncateForTests } from "#infrastructure/persistence/executor.ts";
import type { Cache, JobQueue, JobState } from "#core/ports.ts";
import { databaseNameFromUrl, loadConfig } from "../config.ts";

export function assertTestDatabase(): string {
  const { DATABASE_URL_TEST } = loadConfig();
  const name = databaseNameFromUrl(DATABASE_URL_TEST);
  if (!name.endsWith("_test")) {
    throw new Error(`refusing to run tests against database "${name}" (must end in _test)`);
  }
  return DATABASE_URL_TEST;
}

export function staffHeaders(userId = "test-staff"): Record<string, string> {
  return {
    "X-Role": "staff",
    "X-User-Id": userId,
  };
}

export async function listen(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app as RequestListener);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("server did not bind a port");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function truncateAll(): Promise<void> {
  assertTestDatabase();
  await truncateForTests();
}

export function memoryCache(): Cache {
  const map = new Map<string, string>();
  return {
    async get(id) {
      return map.get(id) ?? null;
    },
    async set(id, value) {
      map.set(id, value);
    },
    async del(id) {
      map.delete(id);
    },
  };
}

export function memoryJobQueue(): JobQueue & {
  added: { name: string; jobId: string }[];
  updateProgress(jobId: string, n: number): Promise<void>;
} {
  const jobs = new Map<string, JobState>();
  const added: { name: string; jobId: string }[] = [];
  return {
    added,
    async add(name, _payload, opts) {
      added.push({ name, jobId: opts.jobId });
      jobs.set(opts.jobId, { status: "queued", progress: 0 });
    },
    async get(jobId) {
      return jobs.get(jobId);
    },
    async updateProgress(jobId, n) {
      jobs.set(jobId, { status: n >= 100 ? "done" : "processing", progress: n });
    },
  };
}
