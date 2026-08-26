export type StageReviewKey = "pathologicT" | "pathologicN" | "pathologicM" | "pathologicStage";

export const STAGE_REVIEW_DISCLAIMER = "교육용 입력 검수이며 AJCC 병기 판정 도구가 아닙니다. 최종 병기 판정은 병리의사가 수행합니다.";

export const STAGE_FIELD_DEFINITIONS: Array<{ key: StageReviewKey; label: string }> = [
  { key: "pathologicT", label: "pT 입력 형식" },
  { key: "pathologicN", label: "pN 입력 형식" },
  { key: "pathologicM", label: "pM 입력 형식" },
  { key: "pathologicStage", label: "Stage 입력 형식" },
];

const STAGE_PATTERNS: Record<StageReviewKey, RegExp> = {
  pathologicT: /pT(?:is|x|[0-4](?:[a-d])?)/gi,
  pathologicN: /(?:pN|N)(?:x|[0-3](?:[a-d])?)/gi,
  pathologicM: /(?:pM|M)(?:x|0|1(?:[ab]|c[12]?)?)/gi,
  pathologicStage: /(?:\bStage|병기군)\s*[:：]?\s*(?:0|[1-4]|[IVX]+)(?:\s*[A-C])?/gi,
};

export function extractStageTokens(text: string, key: StageReviewKey): string[] {
  const pattern = STAGE_PATTERNS[key];
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => match[0].trim());
}

export function normalizeStageValue(value: string | null | undefined): string | null {
  const normalized = value?.normalize("NFKC").toUpperCase().replace(/[\s:：()()[\]{}.,_-]+/g, "").trim() ?? "";
  return normalized || null;
}

export function stageValuesMatch(source: string | null | undefined, entered: string | null | undefined): boolean {
  const sourceValue = normalizeStageValue(source);
  const enteredValue = normalizeStageValue(entered);
  return Boolean(sourceValue && enteredValue && sourceValue === enteredValue);
}

export function isStageValueAllowed(value: string | null | undefined, key: StageReviewKey): boolean {
  if (!value) return false;
  return extractStageTokens(value, key).some((token) => normalizeStageValue(token) === normalizeStageValue(value));
}

export function stageKeyLabel(key: StageReviewKey): string {
  return STAGE_FIELD_DEFINITIONS.find((definition) => definition.key === key)?.label ?? key;
}
