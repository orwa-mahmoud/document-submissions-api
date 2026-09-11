import { createClient, type RedisClientType } from "redis";
import { loadConfig } from "#common/config.ts";
import type { Cache } from "#core/ports.ts";

const PREFIX = "submission:";

let client: RedisClientType | undefined;

async function getClient(): Promise<RedisClientType | null> {
  try {
    if (!client) {
      client = createClient({ url: loadConfig().REDIS_URL });
      client.on("error", () => {
        /* Redis down: callers fall back to Postgres */
      });
      await client.connect();
    }
    if (!client.isOpen) {
      await client.connect();
    }
    return client;
  } catch {
    return null;
  }
}

export const redisCache: Cache = {
  async get(submissionId) {
    const redis = await getClient();
    if (!redis) {
      return null;
    }
    try {
      return await redis.get(`${PREFIX}${submissionId}`);
    } catch {
      return null;
    }
  },
  async set(submissionId, value) {
    const redis = await getClient();
    if (!redis) {
      return;
    }
    try {
      await redis.set(`${PREFIX}${submissionId}`, value);
    } catch {
      /* miss is fine */
    }
  },
  async del(submissionId) {
    const redis = await getClient();
    if (!redis) {
      return;
    }
    try {
      await redis.del(`${PREFIX}${submissionId}`);
    } catch {
      /* miss is fine */
    }
  },
};

export async function closeRedis(): Promise<void> {
  if (!client) {
    return;
  }
  await client.quit();
  client = undefined;
}
