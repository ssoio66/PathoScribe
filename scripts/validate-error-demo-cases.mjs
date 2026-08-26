import assert from "node:assert/strict";

const baseUrl = process.env.PATHOSCRIBE_TEST_BASE_URL ?? "http://127.0.0.1:3000";

async function readJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status} ${body.error ?? ""}`);
  return body;
}

const normalized = (value) => String(value ?? "")
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLocaleLowerCase("en");

const runtime = await readJson("/api/gemini/status");
assert.equal(runtime.demoMode, true, "오류 회귀 검증은 실제 Gemini를 호출하지 않는 데모 모드에서 실행해야 합니다.");

let analyzed = 0;
for (const kind of ["gross", "pathology"]) {
  const fixture = await readJson(`/api/evaluation/cases?type=${kind}`);
  const errorCases = fixture.cases.filter((item) => item.scenario === "error");
  for (const evaluationCase of errorCases) {
    const result = await readJson("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: evaluationCase.caseId, kind }),
    });
    const actualByKey = new Map(result.fields.map((field) => [field.key, field.value]));
    for (const expected of evaluationCase.groundTruth.expectedExtraction) {
      const actualField = result.fields.find((field) => field.key === expected.key);
      assert.equal(
        normalized(actualByKey.get(expected.key)),
        normalized(expected.value),
        `${evaluationCase.caseId}: ${expected.key} 원문 추출 정답 불일치`,
      );
      assert.equal(actualField?.status, expected.status === "missing" ? "not_found" : expected.status, `${evaluationCase.caseId}: ${expected.key} 확인 상태 불일치`);
    }
    const detectedCodes = new Set(result.issues.map((issue) => issue.evaluationCode).filter(Boolean));
    for (const warning of evaluationCase.expectedWarnings) {
      assert.equal(detectedCodes.has(warning.code), true, `${evaluationCase.caseId}: ${warning.code} 경고 미탐`);
    }
    assert.equal(result.issues.some((issue) => issue.id === "source-check"), false, `${evaluationCase.caseId}: 오류 사례를 정상 placeholder로 표시하면 안 됩니다.`);
    analyzed += 1;
  }
}

const outsourcedCases = await readJson("/api/evaluation/cases?type=outsourced");
const fixtureMetadata = await readJson("/api/referral/fixtures");
for (const evaluationCase of outsourcedCases.cases.filter((item) => item.scenario === "error")) {
  const fixture = fixtureMetadata.fixtures.find((item) => item.evaluation_case_id === evaluationCase.caseId);
  assert.ok(fixture, `${evaluationCase.caseId}: 연결된 위탁검사 fixture 없음`);
  const result = await readJson("/api/referral/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId: fixture.id }),
  });
  const detectedCodes = new Set(result.ruleIssues.map((issue) => issue.evaluationCode).filter(Boolean));
  for (const warning of evaluationCase.expectedWarnings) {
    assert.equal(detectedCodes.has(warning.code), true, `${evaluationCase.caseId}: ${warning.code} 경고 미탐`);
  }
  analyzed += 1;
}

assert.equal(analyzed, 23, "오류 평가사례 23건을 모두 검증해야 합니다.");
console.log(`오류 사례 회귀 검증 통과: ${analyzed}건의 원문 추출 정답과 예상 경고 재현`);
