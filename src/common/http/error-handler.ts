import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../../core/errors.ts";
import { errorBody } from "./errors.ts";

function isPgError(err: unknown): err is { code: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId;
  if (err instanceof AppError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.details));
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json(errorBody("validation_error", "Invalid request", err.issues));
    return;
  }
  if (isPgError(err) && err.code === "22P02") {
    res.status(404).json(errorBody("not_found", "Not found"));
    return;
  }
  console.error("unhandled_error", { requestId, err });
  res.status(500).json(errorBody("internal_error", "Internal server error"));
};
