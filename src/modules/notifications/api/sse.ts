import { Router } from "express";
import type { Response } from "express";
import { requireStaff } from "../../../common/http/auth.ts";
import { replayEvents } from "../application/replay-events.ts";
import { subscribe } from "../infra/pg-notifier.ts";

const HEARTBEAT_MS = 25_000;

function writeEvent(res: Response, id: string, data: string): boolean {
  return res.write(`id: ${id}\nevent: submission.status_changed\ndata: ${data}\n\n`);
}

export function eventsRouter(): Router {
  const router = Router();
  router.get("/events", requireStaff, async (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const lastId = req.header("last-event-id");
    if (lastId) {
      const missed = await replayEvents(lastId);
      for (const event of missed) {
        if (
          !writeEvent(
            res,
            event.id,
            JSON.stringify({
              submission_id: event.submission_id,
              actor_id: event.actor_id,
              actor_role: event.actor_role,
              old_status: event.old_status,
              new_status: event.new_status,
              result_version: event.result_version,
            }),
          )
        ) {
          res.destroy();
          return;
        }
      }
    }

    const unsubscribe = subscribe((payload) => {
      let parsed: { id?: string };
      try {
        parsed = JSON.parse(payload) as { id?: string };
      } catch {
        return;
      }
      if (!parsed.id) {
        return;
      }
      if (!writeEvent(res, parsed.id, payload)) {
        unsubscribe();
        res.destroy();
      }
    });

    const heartbeat = setInterval(() => {
      if (!res.write(": ping\n\n")) {
        clearInterval(heartbeat);
        unsubscribe();
        res.destroy();
      }
    }, HEARTBEAT_MS);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  return router;
}
