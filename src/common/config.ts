import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    process.env[key] ??= value;
  }
}

loadDotEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1),
  REDIS_URL: z.string().min(1),
  IDEMPOTENCY_KEY_TTL_HOURS: z.coerce.number().int().positive().default(48),
  MIGRATE_ON_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  BULLBOARD_USER: z.string().default(""),
  BULLBOARD_PASSWORD: z.string().default(""),
  DRAIN_OUTBOX_EVERY_MS: z.coerce.number().int().positive().default(60_000),
  EXPIRE_KEYS_EVERY_MS: z.coerce.number().int().positive().default(43_200_000),
});

export type Config = z.infer<typeof envSchema>;

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetConfig(): void {
  cached = undefined;
}

export function databaseNameFromUrl(url: string): string {
  const parsed = new URL(url);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}
