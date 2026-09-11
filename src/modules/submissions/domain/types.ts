import type { ScanStatus, SubmissionStatus } from "#core/types.ts";

export type { ScanStatus, SubmissionStatus };

export type Submission = {
  id: string;
  title: string;
  category: string;
  body: string;
  reference_date: string | null;
  status: SubmissionStatus;
  scan_status: ScanStatus;
  scan_progress: number;
  version: number;
  created_at: Date;
  updated_at: Date;
};
