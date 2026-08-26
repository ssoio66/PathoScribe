import assert from "node:assert/strict";

const baseUrl = process.env.PATHOSCRIBE_TEST_BASE_URL ?? "http://127.0.0.1:3000";

async function readJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  assert.equal(response.ok, true, `${path}: HTTP ${response.status} ${body.error ?? ""}`);
  return body;
}

function normalized(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

const runtime = await readJson("/api/gemini/status");
assert.equal(runtime.demoMode, true, "이 검증은 실제 Gemini를 호출하지 않도록 데모 모드에서만 실행해야 합니다.");

let analyzedCases = 0;
for (const kind of ["gross", "pathology"]) {
  const fixture = await readJson(`/api/evaluation/cases?type=${kind}`);
  const normalCases = fixture.cases.filter((item) => item.scenario === "normal");
  for (const evaluationCase of normalCases) {
    const result = await readJson("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: evaluationCase.caseId, kind }),
    });
    const actualByKey = new Map(result.fields.map((field) => [field.key, field]));
    for (const expected of evaluationCase.groundTruth.expectedExtraction) {
      const actual = actualByKey.get(expected.key);
      assert.ok(actual, `${evaluationCase.caseId}: ${expected.key} 추출 필드 누락`);
      assert.equal(normalized(actual.value), normalized(expected.value), `${evaluationCase.caseId}: ${expected.key} 정상 정답 불일치`);
      assert.equal(actual.status, expected.status === "missing" ? "not_found" : expected.status, `${evaluationCase.caseId}: ${expected.key} 정상 확인 상태 불일치`);
    }
    const unexpectedWarnings = result.issues.filter((issue) => issue.severity === "error" || issue.severity === "warning");
    assert.deepEqual(unexpectedWarnings, [], `${evaluationCase.caseId}: 정상 사례에 규칙 경고가 없어야 합니다.`);
    assert.equal(result.termReviews.some((review) => review.suggestionType === "high_risk_mismatch"), false, `${evaluationCase.caseId}: 원문과 일치하는 고위험 값을 불일치로 표시하면 안 됩니다.`);
    analyzedCases += 1;
  }
}

for (const fixtureId of ["outsourced-match", "outsourced-revised-report"]) {
  const result = await readJson("/api/referral/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fixtureId }),
  });
  assert.equal(result.overall, "match", `${fixtureId}: 읽을 수 있는 정상 위탁검사 사례는 전체 일치여야 합니다.`);
  assert.equal(result.ruleIssues.some((issue) => issue.severity === "error" || issue.severity === "warning"), false, `${fixtureId}: 정상 위탁검사 사례에 규칙 경고가 없어야 합니다.`);
}

const poorImage = await readJson("/api/referral/compare", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fixtureId: "outsourced-image-poor" }),
});
assert.equal(poorImage.overall, "needs_review", "저화질 정상 원천 문서는 값을 추정하지 않고 확인 필요로 표시해야 합니다.");
assert.equal(poorImage.comparisons.every((item) => item.status === "missing"), true, "저화질 문서의 모든 대조값은 확인 필요여야 합니다.");

console.log(`정상 사례 회귀 검증 통과: 육안·병리 ${analyzedCases}건, 위탁검사 정상 2건, 저화질 확인 필요 1건.`);
