import pg, { type Pool } from "pg";
import { loadConfig } from "../../common/config.ts";

const DATE_OID = 1082;

pg.types.setTypeParser(DATE_OID, (value: string) => value);

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) {
    return pool;
  }
  const config = loadConfig();
  const connectionString =
    config.NODE_ENV === "test" ? config.DATABASE_URL_TEST : config.DATABASE_URL;
  pool = new pg.Pool({ connectionString });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = undefined;
}
