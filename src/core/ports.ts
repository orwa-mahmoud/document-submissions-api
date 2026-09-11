export type Cache = {
  get(submissionId: string): Promise<string | null>;
  set(submissionId: string, value: string): Promise<void>;
  del(submissionId: string): Promise<void>;
};

export type Clock = {
  now(): Date;
};

export type Notifier = {
  notify(channel: string, payload: string): Promise<void>;
};

export type JobState = {
  status: "queued" | "processing" | "done" | "failed";
  progress: number;
};

export type JobQueue = {
  add(name: string, payload: Record<string, unknown>, opts: { jobId: string }): Promise<void>;
  get(jobId: string): Promise<JobState | undefined>;
};

export type SearchDoc = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  created_at: string;
  version: number;
};

export type SearchIndex = {
  upsert(doc: SearchDoc): Promise<void>;
};

export const systemClock: Clock = {
  now() {
    return new Date();
  },
};

export const noopNotifier: Notifier = {
  async notify() {
    /* in-memory fan-out is wired in composition when SSE lands */
  },
};

export const noopSearchIndex: SearchIndex = {
  async upsert() {
    /* fill this to write OpenSearch; if it throws the Bull job fails */
  },
};
