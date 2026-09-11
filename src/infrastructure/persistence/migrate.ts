import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool.ts";

const MIGRATE_LOCK = 871_230;

function migrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../migrations");
}

export async function migrate(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATE_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<{ id: string }>("SELECT id FROM schema_migrations");
    const done = new Set(applied.rows.map((r) => r.id));
    const files = readdirSync(migrationsDir())
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      if (done.has(file)) {
        continue;
      }
      const sql = readFileSync(join(migrationsDir(), file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATE_LOCK]);
    client.release();
  }
}

const invokedDirectly = process.argv[1]?.endsWith("migrate.ts") === true;
if (invokedDirectly) {
  try {
    await migrate();
    console.log("migrations applied");
    process.exit(0);
  } catch (err: unknown) {
    console.error(err);
    process.exit(1);
  }
}
