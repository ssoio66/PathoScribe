export type ReviewStatus = "extracted" | "needs_review" | "not_found" | "edited";

export interface ExtractedField {
  key: string;
  label: string;
  value: string | null;
  evidence: string | null;
  evidenceText?: string | null;
  status: ReviewStatus;
}

export interface ReviewIssue {
  id: string;
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  evidence?: string;
  origin?: "gemini" | "rule";
  evaluationCode?: string;
}

export type TermReviewStatus = "pending" | "accepted" | "rejected" | "manually_edited" | "needs_review";
export type TermReviewRisk = "low" | "high";
export type TermSuggestionType = "exact_match" | "possible_typo" | "high_risk_match" | "high_risk_mismatch" | "not_found";

export interface MedicalTermCandidate {
  term: string;
  normalizedTerm: string;
  category: string;
  source: string;
  sourceVersion: string;
  aliases: string[];
  caseSensitive: boolean;
}

export interface MedicalTermReview {
  suggestionId: string;
  fieldName: string;
  originalValue: string | null;
  suggestedValue: string | null;
  suggestionType: TermSuggestionType;
  riskLevel: TermReviewRisk;
  evidenceText: string | null;
  source: string;
  sourceVersion: string;
  status: TermReviewStatus;
  decidedAt?: string;
  candidates: MedicalTermCandidate[];
}

export interface AnalyzeResponse {
  fields: ExtractedField[];
  issues: ReviewIssue[];
  mode: "demo" | "gemini";
  disclaimer: string;
  model?: string | null;
  latencyMs?: number;
  promptVersion?: string;
  caseVersion?: string | null;
  evaluatedAt?: string;
  termReviews?: MedicalTermReview[];
}

export type AnalyzeKind = "gross" | "pathology";
