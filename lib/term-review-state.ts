import type { TermReviewStatus } from "./types";

export type TermReviewDecision = {
  status: TermReviewStatus;
  value?: string;
  decidedAt?: string;
};

export function createTermReviewDecision(status: TermReviewStatus, value?: string, decidedAt = new Date().toISOString()): TermReviewDecision {
  return value === undefined ? { status, decidedAt } : { status, value, decidedAt };
}

export function applyUniqueTermReviewDecision(current: TermReviewDecision | undefined, next: TermReviewDecision) {
  return current ?? next;
}

export function confirmedValueFromDecision(decision: TermReviewDecision) {
  return decision.status === "accepted" || decision.status === "manually_edited" ? decision.value ?? "" : null;
}
