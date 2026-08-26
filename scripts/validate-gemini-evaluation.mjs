import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const runner = await readFile(join(root, "scripts", "run-gemini-evaluation.mjs"), "utf8");
const index = JSON.parse(await readFile(join(root, "data", "evaluation", "results", "index.json"), "utf8"));
const analyzeRoute = await readFile(join(root, "app", "api", "analyze", "route.ts"), "utf8");
const referralRoute = await readFile(join(root, "app", "api", "referral", "gemini-extract", "route.ts"), "utf8");

const checks = [
  ["explicit confirmation required", runner.includes("--confirm") && runner.includes("실제 Gemini 호출은 실행하지 않았습니다")],
  ["local development target only", runner.includes("전체 평가는 로컬 개발 서버에서만 실행") && runner.includes("PATHOSCRIBE_PUBLIC_DEPLOYMENT")],
  ["fixed case route only", runner.includes('postJson("/api/analyze", { caseId: evaluationCase.caseId, kind: evaluationCase.caseType })')],
  ["registered fixture route only", runner.includes('postJson("/api/referral/gemini-extract", { fixtureId: fixture.id })')],
  ["runner does not use API key", !runner.includes("GEMINI_API_KEY") && !runner.includes("GoogleGenAI")],
  ["versioned result output", runner.includes("evaluatedAt") && runner.includes("displayedMetricKeys") && runner.includes("resultsIndexPath")],
  ["empty result index is valid", index.schemaVersion === "pathoscribe-evaluation-results-index-v1" && index.latest === null && Array.isArray(index.results)],
  ["analyze public case guard remains",
    analyzeRoute.includes("const publicDeployment = isPublicDeployment()")
      && analyzeRoute.includes("Object.keys(body).some((key) => key !== \"caseId\" && key !== \"kind\")")
      && analyzeRoute.includes("findEvaluationCase(requestedCaseId, caseTypeForKind(kind))")
      && analyzeRoute.includes("if (requestedCaseId && !selectedCase)")],
  ["referral fixture guard remains",
    referralRoute.includes("Object.keys(body).some((key) => key !== \"fixtureId\")")
      && referralRoute.includes("검증된 교육용 가상 문서를 찾을 수 없습니다.")
      && referralRoute.includes("MAX_REFERRAL_FIXTURE_BYTES")],
];

for (const [name, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
if (checks.some(([, passed]) => !passed)) process.exitCode = 1;
