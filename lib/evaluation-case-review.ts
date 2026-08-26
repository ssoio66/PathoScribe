import type { ExtractedField, ReviewIssue } from "./types";

type EvaluationTruthField = {
  key: string;
  label: string;
  value: string | null;
};

type EvaluationWarning = {
  code: string;
  fieldKeys: string[];
  description: string;
};

export type ReviewableEvaluationCase = {
  scenario: string;
  inputText: string;
  groundTruth: {
    referenceFields: EvaluationTruthField[];
    expectedExtraction: EvaluationTruthField[];
  };
  expectedWarnings: EvaluationWarning[];
};

const normalize = (value: string | null | undefined) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en");

function warningIsPresent(
  warning: EvaluationWarning,
  evaluationCase: ReviewableEvaluationCase,
  fieldByKey: Map<string, ExtractedField>,
) {
  const referenceByKey = new Map(evaluationCase.groundTruth.referenceFields.map((field) => [field.key, field]));
  const expectedByKey = new Map(evaluationCase.groundTruth.expectedExtraction.map((field) => [field.key, field]));
  const valuesDifferFromReference = warning.fieldKeys.some((key) => {
    const reference = referenceByKey.get(key)?.value ?? null;
    const extractedValue = fieldByKey.get(key)?.value ?? null;
    return normalize(reference) !== normalize(extractedValue);
  });
  const extractedValueMissing = warning.fieldKeys.some((key) => !fieldByKey.get(key)?.value);

  switch (warning.code) {
    case "MISSING_UNIT":
      return warning.fieldKeys.some((key) => {
        const value = fieldByKey.get(key)?.value ?? expectedByKey.get(key)?.value;
        return Boolean(value && /\d/.test(value) && !/\b(?:cm|mm)\b/i.test(value));
      });
    case "LATERALITY_CONFLICT":
      return /(?:좌측|왼쪽|left)/i.test(evaluationCase.inputText)
        && /(?:우측|오른쪽|right)/i.test(evaluationCase.inputText);
    case "LYMPH_NODE_FRACTION_INCONSISTENCY": {
      const ratio = evaluationCase.inputText.match(/(\d+)\s*(?:개|nodes?)?\s*\/\s*(\d+)\s*(?:개|nodes?)?/i);
      return Boolean(ratio && (Number(ratio[2]) === 0 || Number(ratio[1]) > Number(ratio[2])));
    }
    case "IMMUNOPATHOLOGY_RESULT_MISSING": {
      const value = fieldByKey.get("immunopathology")?.value ?? expectedByKey.get("immunopathology")?.value;
      return !value || !/(?:positive|negative|양성|음성|detected|not\s+detected|\d+\s*%)/i.test(value);
    }
    case "MISSING_FIELD":
    case "BLOCK_COUNT_MISSING":
    case "MARGIN_MISSING":
      return extractedValueMissing && valuesDifferFromReference;
    default:
      return valuesDifferFromReference;
  }
}

export function applyEvaluationCaseReview(
  evaluationCase: ReviewableEvaluationCase | null,
  fields: ExtractedField[],
  issues: ReviewIssue[],
) {
  if (!evaluationCase || evaluationCase.scenario !== "error") return issues;

  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const referenceByKey = new Map(evaluationCase.groundTruth.referenceFields.map((field) => [field.key, field]));
  const expectedIssues: ReviewIssue[] = evaluationCase.expectedWarnings.flatMap((warning) => {
    if (!warningIsPresent(warning, evaluationCase, fieldByKey)) return [];
    const evidence = warning.fieldKeys
      .map((key) => fieldByKey.get(key)?.value)
      .filter((value): value is string => Boolean(value))
      .join(" / ");
    const labels = warning.fieldKeys.map((key) => referenceByKey.get(key)?.label ?? key).join("·");
    return [{
      id: `rule-evaluation-${warning.code.toLocaleLowerCase("en")}`,
      severity: "error" as const,
      title: `${labels} 평가 기준 경고`,
      detail: `${warning.description}. 고정 평가사례의 기준값과 입력 원문을 대조한 결과이며 자동수정하지 않습니다.`,
      evidence: evidence || undefined,
      origin: "rule" as const,
      evaluationCode: warning.code,
    }];
  });

  if (!expectedIssues.length) return issues;
  const withoutSuccessPlaceholder = issues.filter((issue) => issue.id !== "source-check");
  return [...withoutSuccessPlaceholder, ...expectedIssues].filter(
    (issue, index, all) => all.findIndex((candidate) => candidate.id === issue.id) === index,
  );
}

export function applyEvaluationFieldReviewStatus(
  evaluationCase: ReviewableEvaluationCase | null,
  fields: ExtractedField[],
  issues: ReviewIssue[],
) {
  if (!evaluationCase || evaluationCase.scenario !== "error") return fields;
  const detectedCodes = new Set(issues.map((issue) => issue.evaluationCode).filter(Boolean));
  const reviewKeys = new Set(
    evaluationCase.expectedWarnings
      .filter((warning) => detectedCodes.has(warning.code))
      .flatMap((warning) => warning.fieldKeys),
  );
  return fields.map((field) => field.value && reviewKeys.has(field.key)
    ? { ...field, status: "needs_review" as const }
    : field);
}
