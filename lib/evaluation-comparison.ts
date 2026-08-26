export type EvaluationComparisonStatus = "exact" | "equivalent" | "missing" | "mismatch" | "generated";

// These fields can legitimately include surrounding specimen or diagnosis context.
const COMPOSITE_FIELDS = new Set(["specimen", "diagnosis", "histologicType"]);

const FIELD_CANDIDATES: Record<string, string[]> = {
  specimen: ["폐 생검", "폐 절제술", "쐐기 절제", "분절 절제", "엽절제", "생검", "절제술", "biopsy", "wedge resection", "segmentectomy", "lobectomy", "resection"],
  diagnosis: ["선암", "편평세포암", "소세포암", "대세포암", "관상피내암", "adenocarcinoma", "squamous cell carcinoma", "small cell carcinoma", "large cell carcinoma", "ductal carcinoma in situ"],
  histologicType: ["acinar predominant type", "keratinizing type", "large cell type", "lepidic predominant type", "papillary predominant type", "micropapillary predominant type", "solid predominant type", "선방형", "유두형", "고형형", "편평세포형", "대세포형", "각질화형"],
};

export function normalizeEvaluationValue(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function hasConflictingCandidate(fieldKey: string, actual: string, expected: string) {
  const expectedValue = normalizeEvaluationValue(expected);
  const normalizedExpected = expectedValue;
  return (FIELD_CANDIDATES[fieldKey] ?? []).some((candidate) => {
    const normalizedCandidate = normalizeEvaluationValue(candidate);
    const overlapsExpectedPhrase = normalizedExpected.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedExpected);
    return normalizedCandidate !== expectedValue && !overlapsExpectedPhrase && actual.includes(normalizedCandidate);
  });
}

function isEquivalentCompositeValue(fieldKey: string, actual: string, expected: string) {
  const normalizedActual = normalizeEvaluationValue(actual);
  const normalizedExpected = normalizeEvaluationValue(expected);
  if (!COMPOSITE_FIELDS.has(fieldKey) || !normalizedExpected || !normalizedActual.includes(normalizedExpected)) return false;
  return !hasConflictingCandidate(fieldKey, normalizedActual, normalizedExpected);
}

export function evaluationComparisonStatus(
  fieldKey: string,
  actual: string | null | undefined,
  expected: string | null | undefined,
): EvaluationComparisonStatus {
  if (expected === null || expected === undefined) return actual === null || actual === undefined || actual.trim() === "" ? "exact" : "generated";
  if (actual === null || actual === undefined || actual.trim() === "") return "missing";
  if (normalizeEvaluationValue(actual) === normalizeEvaluationValue(expected)) return "exact";
  return isEquivalentCompositeValue(fieldKey, actual, expected) ? "equivalent" : "mismatch";
}
