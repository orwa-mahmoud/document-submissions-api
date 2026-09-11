import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprint } from "#core/idempotency/fingerprint.ts";

test("fingerprint is stable when JSON key order changes", () => {
  const a = fingerprint("POST", "/submissions", {
    title: "Doc",
    category: "legal",
    body: "hello",
  });
  const b = fingerprint("POST", "/submissions", {
    body: "hello",
    title: "Doc",
    category: "legal",
  });
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("fingerprint changes when a field changes", () => {
  const a = fingerprint("POST", "/submissions", { title: "A" });
  const b = fingerprint("POST", "/submissions", { title: "B" });
  assert.notEqual(a, b);
});
