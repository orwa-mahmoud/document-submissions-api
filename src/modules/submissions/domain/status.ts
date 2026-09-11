import { BadRequestError } from "../../../core/errors.ts";
import type { SubmissionStatus } from "./types.ts";

const allowed: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  pending: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
};

export function assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (from === to || !allowed[from].includes(to)) {
    throw new BadRequestError("invalid_transition", `Cannot change status from ${from} to ${to}`, {
      from,
      to,
    });
  }
}
