import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const baseUrl = process.env.PATHOSCRIBE_TEST_BASE_URL ?? "http://127.0.0.1:3000";
const outputPath = "docs/evaluation-case-audit.md";

async function readJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status} ${body.error ?? ""}`);
  return body;
}

const normalized = (value) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const fieldStatus = (status) => status === "missing" ? "not_found" : status;
const issueCodes = (issues) => issues.map((issue) => issue.evaluationCode).filter(Boolean).sort();

function assertExtraction(evaluationCase, fields) {
  const actualByKey = new Map(fields.map((field) => [field.key, field]));
  for (const expected of evaluationCase.groundTruth.expectedExtraction) {
    const actual = actualByKey.get(expected.key);
    assert.ok(actual, `${evaluationCase.caseId}: ${expected.key} field is missing`);
    assert.equal(normalized(actual.value), normalized(expected.value), `${evaluationCase.caseId}: ${expected.key} value differs from input-text ground truth`);
    assert.equal(actual.status, fieldStatus(expected.status), `${evaluationCase.caseId}: ${expected.key} status differs from expected review state`);
    if (actual.value === null) {
      assert.equal(actual.evidenceText, null, `${evaluationCase.caseId}: ${expected.key} has evidence despite null value`);
    } else {
      assert.equal(typeof actual.evidenceText, "string", `${evaluationCase.caseId}: ${expected.key} lacks evidence`);
      assert.equal(evaluationCase.inputText.includes(actual.evidenceText), true, `${evaluationCase.caseId}: ${expected.key} evidence is not in source text`);
    }
  }
}

function allowedTextIssue(issueId, evaluationCase) {
  if (evaluationCase.scenario === "normal") return issueId === "source-check";
  const expected = evaluationCase.expectedWarnings;
  return expected.some((warning) => {
    const key = String(warning.fieldKeys?.[0] ?? "").toLowerCase();
    if (warning.code === "MISSING_UNIT") return /missing-unit|numeric-unit/.test(issueId);
    if (warning.code === "LATERALITY_CONFLICT") return issueId.includes("laterality");
    if (warning.code === "LYMPH_NODE_FRACTION_INCONSISTENCY") return issueId.includes("rule-ratio");
    if (warning.code === "MARGIN_MISSING") return issueId.includes("missing-margin");
    if (warning.code === "IMMUNOPATHOLOGY_RESULT_MISSING") return issueId.includes("test-format");
    if (warning.code === "MISSING_FIELD") return issueId.toLowerCase().includes(`missing-${key}`) || issueId.toLowerCase().includes(`required-${key}`);
    return false;
  });
}

function allowedReferralIssue(issueId, evaluationCase) {
  if (evaluationCase.expectedReview?.required && evaluationCase.expectedReview?.reason === "low_quality_document") {
    return issueId.startsWith("rule-referral-required-");
  }
  if (evaluationCase.scenario === "normal") return false;
  return evaluationCase.expectedWarnings.some((warning) => {
    const key = String(warning.fieldKeys?.[0] ?? "");
    if (warning.code === "ORDER_NUMBER_MISMATCH") return issueId.includes("referral-order_number-mismatch");
    if (warning.code === "TEST_NAME_MISMATCH") return issueId.includes("referral-test_name-mismatch");
    if (warning.code === "SPECIMEN_MISMATCH") return issueId.includes("referral-specimen-mismatch");
    if (warning.code === "DATE_MISMATCH") return issueId.includes(`referral-${key}-mismatch`);
    if (warning.code === "AMENDMENT_STATUS_MISSING") return issueId.includes("referral-required-amendment_status");
    if (warning.code === "REPORT_DATE_MISSING") return issueId.includes("referral-required-reported_date");
    if (warning.code === "SOURCE_VALUE_MISMATCH") return issueId.includes("referral-result-mismatch");
    if (warning.code === "MISSING_FIELD") return issueId.includes(`referral-required-${key}`);
    return false;
  });
}

function shortFieldSummary(fields) {
  const reviewed = fields.filter((field) => field.status === "needs_review").map((field) => field.key);
  const missing = fields.filter((field) => field.status === "not_found").map((field) => field.key);
  const extracted = fields.filter((field) => field.status === "extracted").length;
  return `추출 ${extracted}/${fields.length}; 확인 필요 ${reviewed.length ? reviewed.join(", ") : "없음"}; null ${missing.length ? missing.join(", ") : "없음"}`;
}

const runtime = await readJson("/api/gemini/status");
assert.equal(runtime.demoMode, true, "The case audit must not invoke live Gemini.");

const rows = [];
for (const kind of ["gross", "pathology"]) {
  const data = await readJson(`/api/evaluation/cases?type=${kind}`);
  for (const evaluationCase of data.cases) {
    const result = await readJson("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: evaluationCase.caseId, kind }),
    });
    assertExtraction(evaluationCase, result.fields);
    const expectedCodes = evaluationCase.expectedWarnings.map((warning) => warning.code).sort();
    assert.deepEqual(issueCodes(result.issues), expectedCodes, `${evaluationCase.caseId}: evaluation warning set differs from fixture`);
    const supportingIssues = result.issues.filter((issue) => !issue.evaluationCode).map((issue) => issue.id);
    for (const issueId of supportingIssues) assert.equal(allowedTextIssue(issueId, evaluationCase), true, `${evaluationCase.caseId}: unexpected supporting issue ${issueId}`);
    rows.push({
      caseId: evaluationCase.caseId,
      type: kind === "gross" ? "육안 소견" : "병리 결과",
      expected: expectedCodes.length ? expectedCodes.join(", ") : "정상",
      actual: `${shortFieldSummary(result.fields)}; 경고 ${issueCodes(result.issues).join(", ") || "없음"}`,
      outcome: "통과",
    });
  }
}

const outsourced = await readJson("/api/evaluation/cases?type=outsourced");
const fixtures = await readJson("/api/referral/fixtures");
for (const evaluationCase of outsourced.cases) {
  const fixture = fixtures.fixtures.find((candidate) => candidate.evaluation_case_id === evaluationCase.caseId);
  assert.ok(fixture, `${evaluationCase.caseId}: linked outsourced fixture is missing`);
  const result = await readJson("/api/referral/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId: fixture.id }),
  });
  const expectedCodes = evaluationCase.expectedWarnings.map((warning) => warning.code).sort();
  assert.deepEqual(issueCodes(result.ruleIssues), expectedCodes, `${evaluationCase.caseId}: evaluation warning set differs from fixture`);
  const supportingIssues = result.ruleIssues.filter((issue) => !issue.evaluationCode).map((issue) => issue.id);
  for (const issueId of supportingIssues) assert.equal(allowedReferralIssue(issueId, evaluationCase), true, `${evaluationCase.caseId}: unexpected supporting issue ${issueId}`);
  const mismatched = result.comparisons.filter((item) => item.status === "mismatch").map((item) => item.key);
  const missing = result.comparisons.filter((item) => item.status === "missing").map((item) => item.key);
  const expected = evaluationCase.expectedReview?.required
    ? "정상 내용·저화질 수동 확인"
    : expectedCodes.length ? expectedCodes.join(", ") : "정상";
  rows.push({
    caseId: evaluationCase.caseId,
    type: "위탁검사",
    expected,
    actual: `대조 ${result.overall}; 불일치 ${mismatched.join(", ") || "없음"}; 누락 ${missing.join(", ") || "없음"}; 경고 ${issueCodes(result.ruleIssues).join(", ") || "없음"}`,
    outcome: "통과",
  });
}

const markdown = [
  "# 평가사례 사례별 감사",
  "",
  "이 문서는 고정된 교육용 평가사례 35건을 하나씩 다시 실행한 결과다. 실제 Gemini를 호출하지 않는 데모 모드에서 원문 추출값, `status`, `evidenceText`, 평가 경고, 일반 규칙 경고를 함께 확인했다.",
  "",
  "- 정상 사례: 원문값·상태가 정답과 일치하고 예상하지 않은 오류 경고가 없는지 확인",
  "- 오류 사례: 오류가 포함된 원문값을 보존하면서 `needs_review` 또는 `null` 상태가 적절한지, 예상 경고만 재현되는지 확인",
  "- 저화질 위탁검사: 문서 내용 자체의 오류가 아니라 영상 품질 때문에 모든 항목을 수동 확인으로 보류하는 별도 사례",
  "",
  "`null`은 원문에 해당 값이 없는 경우만 사용한다. 원문 안의 값이 서로 충돌하거나 결과 형식이 불완전하면 발견한 값과 근거를 보존하고 `needs_review`로 표시한다.",
  "",
  "| 사례 | 업무 | 의도한 상태 | 실제 점검 결과 | 판정 |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| ${row.caseId} | ${row.type} | ${row.expected} | ${row.actual} | ${row.outcome} |`),
  "",
  "## 범위와 한계",
  "",
  "- 이 감사는 프로젝트가 생성한 고정 가상 사례와 데모·규칙 엔진의 일관성을 검증한다.",
  "- 실제 Gemini 35건 전체 평가나 의료적 정확도 평가는 수행하지 않았다.",
  "- 병기 계산, 진단 확정, 치료 권고는 감사 범위에 포함하지 않는다.",
  "",
];

await writeFile(outputPath, `${markdown.join("\n")}\n`, "utf8");
console.log(`사례별 감사 통과: ${rows.length}건. ${outputPath} 생성 완료.`);
