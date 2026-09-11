import type { RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "../../core/errors.ts";

declare module "express-serve-static-core" {
  interface Request {
    actorId?: string;
    actorRole?: string;
  }
}

export const requireStaff: RequestHandler = (req, _res, next) => {
  const userId = req.header("x-user-id")?.trim();
  const role = req.header("x-role")?.trim();
  if (!userId) {
    next(new UnauthorizedError("X-User-Id is required"));
    return;
  }
  if (role !== "staff") {
    next(new ForbiddenError("Staff role required"));
    return;
  }
  req.actorId = userId;
  req.actorRole = role;
  next();
};
