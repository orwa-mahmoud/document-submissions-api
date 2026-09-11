import type { SearchIndex } from "#core/ports.ts";
import * as scanRepo from "../infra/scan-repo.ts";

export async function handleUpsert(
  payload: { submission_id?: string },
  index: SearchIndex,
): Promise<void> {
  const id = payload.submission_id;
  if (!id) {
    return;
  }
  const doc = await scanRepo.findSubmissionForIndex(id);
  if (!doc) {
    return;
  }
  await index.upsert(doc);
}
