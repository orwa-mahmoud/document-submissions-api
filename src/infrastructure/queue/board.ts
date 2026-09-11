import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Express, RequestHandler } from "express";
import { loadConfig } from "#common/config.ts";
import { getQueue } from "./bull-queue.ts";

function requireBoardAuth(user: string, password: string): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Basic ")) {
      res.set("WWW-Authenticate", 'Basic realm="Bull Board"');
      res.status(401).end();
      return;
    }
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const sep = decoded.indexOf(":");
    const name = sep === -1 ? decoded : decoded.slice(0, sep);
    const pass = sep === -1 ? "" : decoded.slice(sep + 1);
    if (name !== user || pass !== password) {
      res.set("WWW-Authenticate", 'Basic realm="Bull Board"');
      res.status(401).end();
      return;
    }
    next();
  };
}

export function mountBullBoard(app: Express): void {
  const { BULLBOARD_USER, BULLBOARD_PASSWORD } = loadConfig();
  if (!BULLBOARD_USER || !BULLBOARD_PASSWORD) {
    return;
  }
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");
  createBullBoard({
    queues: [new BullMQAdapter(getQueue())],
    serverAdapter,
  });
  app.use(
    "/admin/queues",
    requireBoardAuth(BULLBOARD_USER, BULLBOARD_PASSWORD),
    serverAdapter.getRouter(),
  );
}
