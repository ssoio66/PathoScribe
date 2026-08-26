import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const projectRoot = process.cwd();
const evaluationPath = join(projectRoot, "data", "evaluation", "evaluation-cases.json");
const fixturesPath = join(projectRoot, "data", "fixtures", "outsourced-test", "referral-fixtures.json");
const resultsDirectory = join(projectRoot, "data", "evaluation", "results");
const resultsIndexPath = join(resultsDirectory, "index.json");
const promptVersion = "public-evaluation-v1";
const expectedCounts = { gross: 10, pathology: 15, outsourced: 10 };
const maxRepresentativeCases = 3;

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const optionValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const baseUrl = optionValue("--base-url", "http://127.0.0.1:3000").replace(/\/$/, "");

function printPlan(evaluationData) {
  const totalCases = evaluationData.cases.length;
  const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  console.log("PathoScribe Gemini 전체 평가 실행 계획");
  console.log(`- 예상 Gemini 호출: ${totalCases}건 (육안 ${expectedCounts.gross}, 병리 ${expectedCounts.pathology}, 위탁검사 ${expectedCounts.outsourced})`);
  console.log(`- 사용 모델: ${model} (실행 시 서버 응답 모델명으로 재확인)`);
  console.log(`- 평가사례 버전: ${evaluationData.fixtureVersion}`);
  console.log(`- promptVersion: ${promptVersion}`);
  console.log("- 예상 실행시간: 약 5~15분 (네트워크·문서 처리·API 할당량에 따라 달라질 수 있음)");
  console.log("- 실행 전제: 로컬 개발 서버가 PATHOSCRIBE_DEMO_MODE=false로 실행 중이어야 함");
  console.log("- 실행 명령: npm.cmd run evaluate:gemini -- --confirm --base-url http://127.0.0.1:3000");
  console.log("- 저장 위치: data/evaluation/results/<평가사례버전>-<실행시각>.json");
}

function assertLocalDevelopmentTarget() {
  if (process.env.VERCEL === "1" || process.env.PATHOSCRIBE_PUBLIC_DEPLOYMENT === "true" || process.env.NODE_ENV === "production") {
    throw new Error("전체 평가는 Production 또는 공개 배포 환경에서 실행할 수 없습니다.");
  }
  const url = new URL(baseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("전체 평가는 로컬 개발 서버에서만 실행할 수 있습니다.");
  }
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).normalize("NFKC").trim();
  if (!text || /^(null|not[_ -]?found|n\/a)$/i.test(text)) return null;
  return text
    .replace(/×/g, "x")
    .replace(/\s*([x/])\s*/g, "$1")
    .replace(/\s*(cm|mm|%)/gi, "$1")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function isExactMatch(actual, expected) {
  return normalizeValue(actual) === normalizeValue(expected);
}

function isSchemaValid(fields, expectedFields) {
  if (!Array.isArray(fields) || fields.length !== expectedFields.length) return false;
  const expectedKeys = new Set(expectedFields.map((field) => field.key));
  const seen = new Set();
  return fields.every((field) => {
    if (!field || typeof field !== "object" || !expectedKeys.has(field.key) || seen.has(field.key)) return false;
    seen.add(field.key);
    const value = field.value ?? null;
    if (!["extracted", "needs_review", "not_found"].includes(field.status)) return false;
    if (value === null) return field.status === "not_found" && field.evidenceText === null;
    return typeof value === "string" && value.length > 0 && typeof field.evidenceText === "string" && field.evidenceText.length > 0;
  });
}

function issueIds(payload) {
  return [...(payload.issues ?? []), ...(payload.ruleIssues ?? [])]
    .map((issue) => String(issue?.id ?? "").toLowerCase());
}

function warningDetected(warning, payload) {
  const codedIssues = [...(payload.issues ?? []), ...(payload.ruleIssues ?? [])];
  if (codedIssues.some((issue) => issue?.evaluationCode === warning.code)) return true;
  const ids = issueIds(payload);
  const has = (fragment) => ids.some((id) => id.includes(fragment));
  const fieldKey = warning.fieldKeys?.[0] ?? "";
  const knownMatchers = {
    MISSING_UNIT: () => has("numeric-unit") || has("missing-unit"),
    LATERALITY_CONFLICT: () => has("laterality"),
    SPECIMEN_COUNT_MISMATCH: () => has("count-mismatch"),
    LYMPH_NODE_FRACTION_INCONSISTENCY: () => has("ratio"),
    ORDER_NUMBER_MISMATCH: () => has("referral-order_number-mismatch"),
    TEST_NAME_MISMATCH: () => has("referral-test_name-mismatch"),
    SPECIMEN_MISMATCH: () => has("referral-specimen-mismatch"),
    DATE_MISMATCH: () => has(`referral-${fieldKey}-mismatch`),
    REPORT_DATE_MISSING: () => has("referral-required-reported_date"),
    MISSING_FIELD: () => has(`referral-required-${fieldKey}`),
    SOURCE_VALUE_MISMATCH: () => fieldKey === "result" ? has("referral-result-mismatch") : null,
  };
  const matcher = knownMatchers[warning.code];
  return matcher ? matcher() : null;
}

function rate(key, label, numerator, denominator, direction = "higher_is_better") {
  return { key, label, numerator, denominator, value: denominator > 0 ? numerator / denominator : null, direction };
}

function createAccumulator() {
  return {
    requiredExact: { numerator: 0, denominator: 0 },
    generated: { numerator: 0, denominator: 0 },
    evidence: { numerator: 0, denominator: 0 },
    schema: { numerator: 0, denominator: 0 },
    warnings: { numerator: 0, denominator: 0, excluded: 0 },
  };
}

function updateMetrics(accumulator, evaluationCase, payload) {
  const expectedFields = evaluationCase.groundTruth.expectedExtraction;
  const fieldsByKey = new Map((payload.fields ?? []).map((field) => [field.key, field]));
  accumulator.schema.denominator += 1;
  if (isSchemaValid(payload.fields, expectedFields)) accumulator.schema.numerator += 1;

  for (const expected of expectedFields) {
    const actual = fieldsByKey.get(expected.key);
    const expectedValue = normalizeValue(expected.value);
    const actualValue = normalizeValue(actual?.value);
    if (expectedValue === null) {
      accumulator.generated.denominator += 1;
      if (actualValue !== null) accumulator.generated.numerator += 1;
      continue;
    }
    accumulator.requiredExact.denominator += 1;
    if (isExactMatch(actual?.value, expected.value)) accumulator.requiredExact.numerator += 1;
    accumulator.evidence.denominator += 1;
    const evidence = actual?.evidenceText;
    if (typeof evidence === "string" && evidence.length > 0 && evaluationCase.inputText.includes(evidence)) accumulator.evidence.numerator += 1;
  }

  const warningOutcomes = [];
  for (const warning of evaluationCase.expectedWarnings) {
    const detected = warningDetected(warning, payload);
    if (detected === null) {
      accumulator.warnings.excluded += 1;
      warningOutcomes.push({ code: warning.code, evaluated: false, detected: null });
      continue;
    }
    accumulator.warnings.denominator += 1;
    if (detected) accumulator.warnings.numerator += 1;
    warningOutcomes.push({ code: warning.code, evaluated: true, detected });
  }
  return warningOutcomes;
}

function metricSet(accumulator) {
  const metrics = [
    rate("required_field_extraction_rate", "필수항목 추출률", accumulator.requiredExact.numerator, accumulator.requiredExact.denominator),
    rate("mismatch_detection_rate", "불일치 탐지율", accumulator.warnings.numerator, accumulator.warnings.denominator),
    rate("out_of_source_generation_rate", "원문에 없는 값 생성률", accumulator.generated.numerator, accumulator.generated.denominator, "lower_is_better"),
    rate("evidence_link_rate", "원문 근거 연결률", accumulator.evidence.numerator, accumulator.evidence.denominator),
    rate("json_schema_pass_rate", "JSON 스키마 통과율", accumulator.schema.numerator, accumulator.schema.denominator),
  ];
  return {
    metrics,
    displayedMetricKeys: metrics
      .filter((metric) => metric.value !== null)
      .filter((metric) => ["required_field_extraction_rate", "mismatch_detection_rate", "out_of_source_generation_rate"].includes(metric.key))
      .slice(0, 3)
      .map((metric) => metric.key),
    excludedWarningExpectations: accumulator.warnings.excluded,
  };
}

function summarizeType(caseResults, caseType) {
  const matches = caseResults.filter((item) => item.caseType === caseType);
  return {
    totalCases: matches.length,
    successCases: matches.filter((item) => item.status === "success").length,
    failedCases: matches.filter((item) => item.status === "failed").length,
    excludedCases: matches.filter((item) => item.status === "excluded").length,
    latencyMs: matches.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0),
  };
}

function summarizeErrorTypes(caseResults) {
  const summary = new Map();
  for (const item of caseResults) {
    if (item.status !== "success") continue;
    for (const outcome of item.warningOutcomes ?? []) {
      const current = summary.get(outcome.code) ?? { code: outcome.code, expected: 0, evaluated: 0, detected: 0 };
      current.expected += 1;
      if (outcome.evaluated) {
        current.evaluated += 1;
        if (outcome.detected) current.detected += 1;
      }
      summary.set(outcome.code, current);
    }
  }
  return [...summary.values()].sort((left, right) => left.code.localeCompare(right.code));
}

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : {};
  return { response, payload };
}

async function run() {
  const evaluationData = JSON.parse(await readFile(evaluationPath, "utf8"));
  const fixtures = JSON.parse(await readFile(fixturesPath, "utf8"));
  printPlan(evaluationData);
  if (!confirmed) {
    console.log("실제 Gemini 호출은 실행하지 않았습니다. 실행하려면 --confirm을 명시하세요.");
    return;
  }

  assertLocalDevelopmentTarget();
  const statusResponse = await fetch(`${baseUrl}/api/gemini/status`);
  const runtime = await statusResponse.json();
  if (!statusResponse.ok || runtime.demoMode || !runtime.liveAvailable || runtime.publicDeployment) {
    throw new Error("로컬 실시간 Gemini 설정을 확인하지 못했습니다. PATHOSCRIBE_DEMO_MODE=false, 서버 환경변수, 로컬 개발 서버 상태를 확인하세요.");
  }

  const fixtureByCaseId = new Map(fixtures.map((fixture) => [fixture.evaluation_case_id, fixture]));
  const accumulator = createAccumulator();
  const results = [];
  const observedModels = new Set();
  const observedCaseVersions = new Set();
  const startedAt = Date.now();

  for (const evaluationCase of evaluationData.cases) {
    const fixture = evaluationCase.caseType === "outsourced" ? fixtureByCaseId.get(evaluationCase.caseId) : null;
    if (evaluationCase.caseType === "outsourced" && !fixture) {
      results.push({ caseId: evaluationCase.caseId, caseType: evaluationCase.caseType, scenario: evaluationCase.scenario, status: "excluded", reason: "registered_fixture_missing" });
      continue;
    }

    const request = evaluationCase.caseType === "outsourced"
      ? postJson("/api/referral/gemini-extract", { fixtureId: fixture.id })
      : postJson("/api/analyze", { caseId: evaluationCase.caseId, kind: evaluationCase.caseType });
    const startedCaseAt = Date.now();
    try {
      const { response, payload } = await request;
      const latencyMs = Date.now() - startedCaseAt;
      if (!response.ok || payload.mode !== "gemini" || payload.analysisState !== "live") {
        results.push({ caseId: evaluationCase.caseId, caseType: evaluationCase.caseType, scenario: evaluationCase.scenario, status: "failed", latencyMs, httpStatus: response.status, failureCategory: "live_analysis_failed" });
        continue;
      }
      if (typeof payload.model === "string") observedModels.add(payload.model);
      if (typeof payload.caseVersion === "string") observedCaseVersions.add(payload.caseVersion);
      const warningOutcomes = updateMetrics(accumulator, evaluationCase, payload);
      results.push({
        caseId: evaluationCase.caseId,
        caseType: evaluationCase.caseType,
        scenario: evaluationCase.scenario,
        status: "success",
        latencyMs,
        expectedWarningCodes: evaluationCase.expectedWarnings.map((warning) => warning.code),
        detectedRuleIssueIds: issueIds(payload),
        warningOutcomes,
      });
    } catch {
      results.push({ caseId: evaluationCase.caseId, caseType: evaluationCase.caseType, scenario: evaluationCase.scenario, status: "failed", failureCategory: "network_or_response_error" });
    }
  }

  const metricSummary = metricSet(accumulator);
  const successCases = results.filter((item) => item.status === "success");
  const failedCases = results.filter((item) => item.status === "failed");
  const excludedCases = results.filter((item) => item.status === "excluded");
  const evaluatedAt = new Date().toISOString();
  const result = {
    schemaVersion: "pathoscribe-gemini-evaluation-v1",
    evaluatedAt,
    model: observedModels.size === 1 ? [...observedModels][0] : observedModels.size ? [...observedModels].join(", ") : (process.env.GEMINI_MODEL ?? "gemini-3.6-flash"),
    promptVersion,
    caseVersion: evaluationData.fixtureVersion,
    observedCaseVersions: [...observedCaseVersions],
    totalCases: evaluationData.cases.length,
    successCases: successCases.length,
    failedCases: failedCases.length,
    excludedCases: excludedCases.length,
    latency: {
      totalMs: Date.now() - startedAt,
      successfulTotalMs: successCases.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0),
      averageSuccessfulMs: successCases.length ? Math.round(successCases.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0) / successCases.length) : null,
    },
    metrics: metricSummary.metrics,
    displayedMetricKeys: metricSummary.displayedMetricKeys,
    byCaseType: {
      gross: summarizeType(results, "gross"),
      pathology: summarizeType(results, "pathology"),
      outsourced: summarizeType(results, "outsourced"),
    },
    errorTypeResults: summarizeErrorTypes(results),
    methodComparison: {
      ruleBased: { evaluated: false, reason: "이번 실행은 기존 공개 Route의 Gemini+규칙 하이브리드 응답만 측정합니다." },
      geminiOnly: { evaluated: false, reason: "Gemini 원출력을 별도 저장하지 않아 독립 비교를 생성하지 않습니다." },
      hybrid: { evaluated: true, description: "Gemini 구조화 결과에 기존 서버의 근거 검증·병기 제한·규칙 기반 검수를 적용한 응답" },
    },
    evaluationExclusions: {
      failedCallsExcludedFromSuccessMetrics: failedCases.length,
      warningExpectationsWithoutImplementedMatcher: metricSummary.excludedWarningExpectations,
      rules: "구현된 규칙과 명시적 매처가 있는 오류 유형만 불일치 탐지율 분모에 포함합니다.",
    },
    representativeSuccessCases: successCases.slice(0, maxRepresentativeCases).map((item) => item.caseId),
    representativeFailureCases: failedCases.slice(0, maxRepresentativeCases).map((item) => item.caseId),
    normalization: {
      nullAndNotFound: "null, 빈 문자열, not_found, N/A는 null로 정규화",
      whitespaceAndCase: "Unicode NFKC, 앞뒤 공백 제거, 연속 공백 축소, 대소문자 무시",
      units: "×는 x로, cm/mm/% 주변 공백만 정규화하며 cm와 mm 간 단위 환산은 하지 않음",
      synonyms: "진단명·병기·의학용어 동의어는 자동 동치 처리하지 않음",
    },
    limitations: [
      "고정 교육용 합성·가상 사례의 필드 단위 평가이며 실제 임상 성능을 의미하지 않습니다.",
      "실패한 호출은 성공 사례와 지표 분자에 포함하지 않습니다.",
      "규칙 기반 단독 및 Gemini 단독 비교는 별도 실행 전까지 N/A로 유지합니다.",
    ],
    cases: results,
  };

  await mkdir(resultsDirectory, { recursive: true });
  const safeTimestamp = evaluatedAt.replace(/[:.]/g, "-");
  const file = `${evaluationData.fixtureVersion}-${safeTimestamp}.json`;
  await writeFile(join(resultsDirectory, file), `${JSON.stringify(result, null, 2)}\n`, "utf8");

  let index = { schemaVersion: "pathoscribe-evaluation-results-index-v1", latest: null, results: [] };
  try {
    index = JSON.parse(await readFile(resultsIndexPath, "utf8"));
  } catch {
    // The versioned result is still saved even when a local index does not yet exist.
  }
  const entry = {
    id: basename(file, ".json"),
    file,
    evaluatedAt: result.evaluatedAt,
    model: result.model,
    promptVersion: result.promptVersion,
    caseVersion: result.caseVersion,
    totalCases: result.totalCases,
    successCases: result.successCases,
    failedCases: result.failedCases,
    excludedCases: result.excludedCases,
    metrics: result.metrics,
    displayedMetricKeys: result.displayedMetricKeys,
    detail: {
      byCaseType: result.byCaseType,
      errorTypeResults: result.errorTypeResults,
      methodComparison: result.methodComparison,
      evaluationExclusions: result.evaluationExclusions,
      representativeSuccessCases: result.representativeSuccessCases,
      representativeFailureCases: result.representativeFailureCases,
      normalization: result.normalization,
      limitations: result.limitations,
    },
  };
  const priorEntries = Array.isArray(index.results) ? index.results.filter((item) => item.id !== entry.id) : [];
  await writeFile(resultsIndexPath, `${JSON.stringify({ schemaVersion: index.schemaVersion ?? "pathoscribe-evaluation-results-index-v1", latest: entry, results: [entry, ...priorEntries].slice(0, 10) }, null, 2)}\n`, "utf8");
  console.log(`평가 결과 저장: data/evaluation/results/${file}`);
  console.log(`성공 ${result.successCases}건 · 실패 ${result.failedCases}건 · 제외 ${result.excludedCases}건`);
}

await run();
