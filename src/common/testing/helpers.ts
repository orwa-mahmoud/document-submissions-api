import { createServer, type RequestListener, type Server } from "node:http";
import type { Express } from "express";
import { truncateForTests } from "#infrastructure/persistence/executor.ts";
import type { Cache } from "#core/ports.ts";
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
