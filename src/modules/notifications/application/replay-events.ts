import { query } from "#infrastructure/persistence/executor.ts";

export type StatusEvent = {
  id: string;
  submission_id: string;
  actor_id: string;
  actor_role: string;
  old_status: string;
  new_status: string;
  result_version: number;
};

export async function replayEvents(afterId: string): Promise<StatusEvent[]> {
  const n = Number(afterId);
  if (!Number.isInteger(n) || n < 0) {
    return [];
  }
  const result = await query<StatusEvent>(
    `SELECT id::text, submission_id, actor_id, actor_role, old_status, new_status, result_version
     FROM submission_status_audit
     WHERE id > $1
     ORDER BY id ASC`,
    [n],
  );
  return result.rows;
}
