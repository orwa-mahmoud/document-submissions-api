import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestError } from "#core/errors.ts";
import { assertTransition } from "../../domain/status.ts";

test("legal transitions pass", () => {
  assertTransition("pending", "under_review");
  assertTransition("pending", "approved");
  assertTransition("pending", "rejected");
  assertTransition("under_review", "approved");
  assertTransition("under_review", "rejected");
});

test("approved to rejected is invalid", () => {
  assert.throws(
    () => assertTransition("approved", "rejected"),
    (err: unknown) => err instanceof BadRequestError && err.code === "invalid_transition",
  );
});

test("same-status is invalid", () => {
  assert.throws(
    () => assertTransition("pending", "pending"),
    (err: unknown) => err instanceof BadRequestError && err.code === "invalid_transition",
  );
});
