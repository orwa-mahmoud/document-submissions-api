import type { Cache } from "#core/ports.ts";
import { NotFoundError } from "#core/errors.ts";
import { UUID_RE } from "../api/schemas.ts";
import * as submissionRepo from "../infra/submission-repo.ts";

export type GetResult = {
  status: 200 | 304;
  body?: ReturnType<typeof submissionRepo.toPublic>;
  version: number;
};

function etagMatches(ifNoneMatch: string | undefined, version: number): boolean {
  if (!ifNoneMatch) {
    return false;
  }
  const normalized = ifNoneMatch.trim().replaceAll('"', "");
  return normalized === String(version);
}

export async function getSubmission(
  id: string,
  ifNoneMatch: string | undefined,
  cache: Cache,
): Promise<GetResult> {
  if (!UUID_RE.test(id)) {
    throw new NotFoundError();
  }
  const cached = await cache.get(id);
  if (cached) {
    const body = JSON.parse(cached) as ReturnType<typeof submissionRepo.toPublic>;
    if (etagMatches(ifNoneMatch, body.version)) {
      return { status: 304, version: body.version };
    }
    return { status: 200, body, version: body.version };
  }
  const row = await submissionRepo.findById(id);
  if (!row) {
    throw new NotFoundError();
  }
  const body = submissionRepo.toPublic(row);
  await cache.set(id, JSON.stringify(body));
  if (etagMatches(ifNoneMatch, body.version)) {
    return { status: 304, version: body.version };
  }
  return { status: 200, body, version: body.version };
}
