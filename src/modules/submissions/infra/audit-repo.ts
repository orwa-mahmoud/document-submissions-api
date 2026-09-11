import type { PoolClient } from "pg";
import { query } from "#infrastructure/persistence/executor.ts";

export type AuditRow = {
  id: string;
  submission_id: string;
  actor_id: string;
  actor_role: string;
  old_status: string;
  new_status: string;
  result_version: number;
  created_at: Date;
};

export async function insertAudit(
  client: PoolClient,
  row: {
    submissionId: string;
    actorId: string;
    actorRole: string;
    oldStatus: string;
    newStatus: string;
    resultVersion: number;
  },
): Promise<AuditRow> {
  const result = await query<AuditRow>(
    `INSERT INTO submission_status_audit
       (submission_id, actor_id, actor_role, old_status, new_status, result_version)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, submission_id, actor_id, actor_role, old_status, new_status,
               result_version, created_at`,
    [row.submissionId, row.actorId, row.actorRole, row.oldStatus, row.newStatus, row.resultVersion],
    client,
  );
  return result.rows[0];
}

export async function listBySubmission(submissionId: string): Promise<AuditRow[]> {
  const result = await query<AuditRow>(
    `SELECT id, submission_id, actor_id, actor_role, old_status, new_status,
            result_version, created_at
     FROM submission_status_audit
     WHERE submission_id = $1
     ORDER BY id ASC`,
    [submissionId],
  );
  return result.rows;
}

export async function emitStatusChanged(client: PoolClient, payload: string): Promise<void> {
  await query(`SELECT pg_notify('submission_events', $1)`, [payload], client);
}
