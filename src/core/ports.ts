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

export const systemClock: Clock = {
  now() {
    return new Date();
  },
};
