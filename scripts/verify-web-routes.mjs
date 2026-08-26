const baseUrl = process.env.PATHOSCRIBE_TEST_URL ?? "http://127.0.0.1:3000";

const checks = [];

async function check(name, requestPath, options, expectedStatus, validate = () => true) {
  try {
    const response = await fetch(`${baseUrl}${requestPath}`, options);
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    const passed = response.status === expectedStatus && validate(payload);
    checks.push({ name, passed, status: response.status });
  } catch {
    checks.push({ name, passed: false, status: 0 });
  }
}

const jsonPost = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

await check("home", "/", undefined, 200, (body) => typeof body === "string" && body.includes("PathoScribe"));
await check("workflow data", "/api/data/pathology-workflow", undefined, 200, (body) => Array.isArray(body.cases) && body.cases.length > 0);
await check("pathology-molecular linkage", "/api/data/pathology-molecular-linkage", undefined, 200, (body) => Boolean(body.statistics) && Boolean(body.targetSchema));
await check("diagnosis reference", "/api/reference-diagnoses", jsonPost({ diagnosis: "선암" }), 200, (body) => Array.isArray(body.candidates));
await check("stage reference", "/api/reference-stages", jsonPost({ stage: "pT1c" }), 200, (body) => Array.isArray(body.candidates) && Boolean(body.quality));
await check("stage format pN2a", "/api/reference-stages", jsonPost({ stage: "pN2a" }), 200, (body) => Array.isArray(body.candidates) && Boolean(body.quality));
await check("stage format pM1c2", "/api/reference-stages", jsonPost({ stage: "pM1c2" }), 200, (body) => Array.isArray(body.candidates) && Boolean(body.quality));
await check("bronchoscopy reference", "/api/reference-bronchoscopy", undefined, 200, (body) => body.statistics?.apiRows === 1361 && Array.isArray(body.targets) && body.targets.length === 3 && body.quality?.distributionAvailable === true);
await check("knowledge sources", "/api/knowledge/search", undefined, 200, (body) => Array.isArray(body.sources));
await check("knowledge grounded answer", "/api/knowledge/search", jsonPost({ query: "AI 안전정책" }), 200, (body) => body.matches?.[0]?.kind === "project_reference" && Boolean(body.answer));
await check("knowledge dictionary browse", "/api/knowledge/browse?category=all&initial=all&page=1&pageSize=40", undefined, 200, (body) => body.available === true && body.corpusTotal === 3544 && body.total === 3544 && body.items?.length === 40 && body.rangeStart === 1 && body.rangeEnd === 40 && body.totalPages === 89);
await check("knowledge dictionary browse filter", "/api/knowledge/browse?category=lung&initial=ㄱ&page=1&pageSize=40", undefined, 200, (body) => body.category === "lung" && body.initial === "ㄱ" && body.total > 0 && body.total < body.corpusTotal && body.items?.length > 0 && body.items.length <= 40);
await check("gross evaluation cases", "/api/evaluation/cases?type=gross", undefined, 200, (body) => body.cases?.length === 10 && body.cases.every((item) => item.caseType === "gross" && Boolean(item.inputText) && Array.isArray(item.groundTruth?.expectedExtraction)));
await check("evaluation case source-row lookup", "/api/evaluation/cases?sourceRowId=NCC-LUNG-TST-00000", undefined, 200, (body) => body.cases?.length === 1 && body.cases[0]?.caseId === "EVAL-GROSS-001" && body.cases[0]?.sourceRowId === "NCC-LUNG-TST-00000");
await check("evaluation case source-row validation", "/api/evaluation/cases?sourceRowId=invalid", undefined, 400, (body) => Boolean(body.error));
await check("pathology evaluation cases", "/api/evaluation/cases?type=pathology", undefined, 200, (body) => body.cases?.length === 15 && body.cases.every((item) => item.caseType === "pathology" && Boolean(item.sourceRowId)));
await check("evaluation result summary", "/api/evaluation/results", undefined, 200, (body) => body.available === false && body.latest === null && Array.isArray(body.recent));
await check("referral fixtures", "/api/referral/fixtures", undefined, 200, (body) => Array.isArray(body.fixtures) && body.fixtures.length === 10 && body.fixtures.every((fixture) => fixture.watermark === "교육용 가상자료·실제 의료기록 아님"));
await check("referral fixture document", "/fixtures/outsourced-test/교육용_위탁검사_정상_일치.pdf", undefined, 200, (body) => typeof body === "string" && body.length > 1024);
await check("referral match", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-match" }), 200, (body) => body.overall === "match");
await check("referral specimen mismatch", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-specimen-mismatch" }), 200, (body) => body.overall === "mismatch" && body.comparisons.some((item) => item.key === "specimen" && item.status === "mismatch") && body.ruleIssues?.some((item) => item.id === "rule-referral-specimen-mismatch" && item.origin === "rule"));
await check("referral received-date mismatch", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-received-date-mismatch" }), 200, (body) => body.overall === "needs_review" && body.comparisons.some((item) => item.key === "received_date" && item.status === "mismatch"));
await check("referral result mismatch", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-result-mismatch" }), 200, (body) => body.overall === "mismatch" && body.comparisons.some((item) => item.key === "result" && item.status === "mismatch"));
await check("referral revised report", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-revised-report" }), 200, (body) => body.revisedReport?.status === "revised" && body.comparisons.some((item) => item.key === "amendment_status" && item.status === "match"));
await check("referral poor image", "/api/referral/compare", jsonPost({ fixtureId: "outsourced-image-poor" }), 200, (body) => body.overall === "needs_review" && body.comparisons.some((item) => item.key === "order_number" && item.status === "missing"));
await check("referral Gemini demo guard", "/api/referral/gemini-extract", jsonPost({ fixtureId: "outsourced-match" }), 503, (body) => Boolean(body.error));
await check("referral not found", "/api/referral/compare", jsonPost({ fixtureId: "not-found" }), 404, (body) => Boolean(body.error));
await check("analyze invalid input", "/api/analyze", jsonPost({ kind: "gross", text: "" }), 400, (body) => Boolean(body.error));
await check(
  "analyze explicit demo",
  "/api/analyze",
  jsonPost({ kind: "gross", text: "우측 폐 상엽 가상 검체 1개, 크기 2.0 x 1.0 cm, 블록 2개" }),
  200,
  (body) => body.mode === "demo"
    && Array.isArray(body.fields)
    && body.fields.length === 9
    && body.fields.every((field) => ["extracted", "needs_review", "not_found"].includes(field.status) && Object.hasOwn(field, "evidenceText") && !Object.hasOwn(field, "confidence"))
    && body.fields.some((field) => field.value === null && field.evidence === null && field.evidenceText === null && field.status === "not_found")
    && body.issues.some((issue) => issue.origin === "rule")
    && Array.isArray(body.termReviews)
    && body.termReviews.some((review) => review.suggestionType === "not_found" && review.status === "needs_review"),
);
await check(
  "pathology term safety",
  "/api/analyze",
  jsonPost({ kind: "pathology", caseId: "EVAL-PATH-001" }),
  200,
  (body) => Array.isArray(body.termReviews)
    && body.fields?.length === 17
    && body.fields.every((field) => field.value === null
      ? field.status === "not_found" && field.evidenceText === null
      : typeof field.evidenceText === "string" && field.evidenceText.length > 0)
    && !Object.hasOwn(body, "confirmedValues")
    && body.termReviews.every((review) => Boolean(review.source) && Boolean(review.sourceVersion))
    && body.termReviews.some((review) => review.fieldName === "diagnosis" && review.suggestionType === "exact_match" && review.suggestedValue === null)
    && body.termReviews.filter((review) => review.riskLevel === "high").every((review) => review.suggestedValue === null)
    && body.termReviews.some((review) => review.fieldName === "laterality" && ["exact_match", "high_risk_match"].includes(review.suggestionType) && review.status === "pending")
    && !body.termReviews.some((review) => review.suggestionType === "high_risk_mismatch"),
);

for (const result of checks) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name} (HTTP ${result.status})`);
}

const failed = checks.filter((result) => !result.passed);
console.log(`${checks.length - failed.length}/${checks.length} web checks passed`);
if (failed.length) process.exitCode = 1;
