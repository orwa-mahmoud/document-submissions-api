export type JobKind = "document_scan";

export type JobRow = {
  id: string;
  kind: JobKind;
  status: "pending" | "processing" | "done" | "failed";
  attempts: number;
  last_error: string | null;
  submission_id: string;
  progress: number;
  worker_id: string | null;
  heartbeat_at: Date | null;
};
