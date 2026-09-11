import type { PoolClient } from "pg";
import type { Notifier } from "../../../core/ports.ts";
import { getPool } from "../../../infrastructure/persistence/pool.ts";

export type StatusListener = (payload: string) => void;

const listeners = new Set<StatusListener>();
let client: PoolClient | undefined;
let reconnecting = false;

export function subscribe(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function fanout(payload: string): void {
  for (const listener of listeners) {
    listener(payload);
  }
}

async function attach(next: PoolClient): Promise<void> {
  await next.query("LISTEN submission_events");
  next.on("notification", (msg) => {
    if (msg.channel === "submission_events" && msg.payload) {
      fanout(msg.payload);
    }
  });
  next.on("error", () => {
    void reconnect();
  });
}

async function reconnect(): Promise<void> {
  if (reconnecting) {
    return;
  }
  reconnecting = true;
  try {
    if (client) {
      client.removeAllListeners();
      client.release();
      client = undefined;
    }
    client = await getPool().connect();
    await attach(client);
  } catch {
    setTimeout(() => {
      reconnecting = false;
      void reconnect();
    }, 1000);
    return;
  }
  reconnecting = false;
}

export async function startListener(): Promise<void> {
  if (client) {
    return;
  }
  client = await getPool().connect();
  await attach(client);
}

export async function stopListener(): Promise<void> {
  if (!client) {
    return;
  }
  client.removeAllListeners();
  try {
    await client.query("UNLISTEN submission_events");
  } catch {
    /* closing anyway */
  }
  client.release();
  client = undefined;
}

export const pgNotifier: Notifier = {
  async notify(_channel, payload) {
    fanout(payload);
  },
};
