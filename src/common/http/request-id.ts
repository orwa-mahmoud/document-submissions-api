import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare module "express-serve-static-core" {
  interface Request {
    requestId: string;
  }
}

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  const id = incoming && incoming.trim() !== "" ? incoming.trim() : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
};
