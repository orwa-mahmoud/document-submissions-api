import { createHash } from "node:crypto";

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortJson(v)]));
  }
  return value;
}

export function fingerprint(method: string, path: string, body: unknown): string {
  const canonical = JSON.stringify(sortJson(body ?? {}));
  return createHash("sha256")
    .update(`${method.toUpperCase()}\n${path}\n${canonical}`)
    .digest("hex");
}
