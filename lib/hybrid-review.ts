import type { AnalyzeKind, ExtractedField, ReviewIssue } from "./types";

type ReferralValues = Record<string, string | null | undefined>;

const REQUIRED_FIELDS: Record<AnalyzeKind, string[]> = {
  gross: ["organ", "specimen", "size", "count", "lesionLocation"],
  pathology: ["organ", "specimen", "diagnosis", "tumorSize"],
};

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const normalize = (value: string | null | undefined) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const ruleIssue = (id: string, severity: ReviewIssue["severity"], title: string, detail: string, evidence?: string): ReviewIssue => ({ id, severity, title, detail, evidence, origin: "rule" });

export function runTextRuleReview(text: string, kind: AnalyzeKind, fields: ExtractedField[]): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));

  for (const key of REQUIRED_FIELDS[kind]) {
    const field = fieldByKey.get(key);
    if (!field?.value) issues.push(ruleIssue(`rule-required-${key}`, "warning", `${field?.label ?? key} 필수항목 확인 필요`, "교육용 입력 검수 기준에서 원문 근거가 확인되지 않았습니다. 값을 보완하거나 자동 확정하지 않습니다."));
  }

  const dateTokens = text.match(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g) ?? [];
  for (const dateToken of dateTokens) {
    if (!isIsoDate(dateToken)) issues.push(ruleIssue(`rule-date-format-${dateToken}`, "warning", "날짜 형식 확인 필요", "날짜는 유효한 YYYY-MM-DD 형식인지 원문과 대조해야 합니다.", dateToken));
  }

  const dimensions = text.match(/\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){1,2}(?:\s*(?:cm|mm))?/gi) ?? [];
  if (dimensions.some((dimension) => !/(?:cm|mm)\s*$/i.test(dimension))) {
    issues.push(ruleIssue("rule-numeric-unit", "error", "숫자·단위 확인 필요", "크기 표현에 cm 또는 mm 단위가 명시되어 있는지 확인해야 합니다."));
  }
  for (const key of kind === "gross" ? ["size"] : ["tumorSize"]) {
    const field = fieldByKey.get(key);
    if (field?.value && /\d/.test(field.value) && !/\b(?:cm|mm)\b/i.test(field.value)) {
      issues.push(ruleIssue(`rule-numeric-unit-${key}`, "error", `${field.label} 단위 확인 필요`, "구조화된 숫자값에 cm 또는 mm 단위가 없습니다.", field.value));
    }
  }

  const hasLeft = /(좌측|왼쪽|left)/i.test(text);
  const hasRight = /(우측|오른쪽|right)/i.test(text);
  if (hasLeft && hasRight) issues.push(ruleIssue("rule-laterality-conflict", "error", "좌우 불일치 가능성", "원문에서 좌측과 우측 표현이 함께 확인됩니다. 담당자가 원문을 대조해야 합니다."));

  for (const match of text.matchAll(/\b(\d+)\s*(?:개|nodes?)?\s*\/\s*(\d+)\s*(?:개|nodes?)?\b/gi)) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator === 0 || numerator > denominator) {
      issues.push(ruleIssue(`rule-ratio-${match.index}`, "error", "분자·분모 확인 필요", "분자·분모 값이 유효하지 않습니다. 분자는 분모보다 클 수 없고 분모는 0이 될 수 없습니다.", match[0]));
    }
  }

  return issues;
}

export function runReferralRuleReview(extracted: ReferralValues, internal: ReferralValues): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const required = ["order_number", "test_name", "specimen", "received_date", "reported_date", "amendment_status", "result"];
  for (const key of required) {
    if (!extracted[key]) issues.push(ruleIssue(`rule-referral-required-${key}`, "warning", `${key} 필수항목 확인 필요`, "가상 결과지에서 필수 대조 항목을 확인하지 못했습니다."));
  }

  const comparisons: Array<[string, string, string]> = [
    ["order_number", "order_id", "검사번호"],
    ["test_name", "test_name", "검사명"],
    ["specimen", "specimen", "검체명"],
    ["received_date", "received_date", "접수일"],
    ["reported_date", "reported_date", "보고일"],
    ["result", "expected_result", "결과"],
  ];
  for (const [extractedKey, internalKey, label] of comparisons) {
    const actual = extracted[extractedKey];
    const expected = internal[internalKey];
    if (actual && expected && normalize(actual) !== normalize(expected)) {
      issues.push(ruleIssue(`rule-referral-${extractedKey}-mismatch`, "error", `${label} 불일치`, "가상 결과지의 추출값과 가상 내부 의뢰정보 값이 다릅니다.", actual));
    }
  }

  for (const key of ["received_date", "reported_date"]) {
    const value = extracted[key];
    if (value && !isIsoDate(value)) issues.push(ruleIssue(`rule-referral-${key}-format`, "warning", `${key} 형식 확인 필요`, "날짜는 유효한 YYYY-MM-DD 형식인지 원문과 대조해야 합니다.", value));
  }

  return issues;
}
