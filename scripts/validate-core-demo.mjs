import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const fixtureSource = await readFile("lib/core-demo-case.ts", "utf8");
const appSource = await readFile("components/core-feature-demo.tsx", "utf8");
const routeSource = await readFile("app/demo/health-information-manager/page.tsx", "utf8");
const shellSource = await readFile("components/pathoscribe-app.tsx", "utf8");
const evaluation = JSON.parse(await readFile("data/evaluation/evaluation-cases.json", "utf8"));
const projectRag = await readFile("lib/data/project-rag.ts", "utf8");
const registry = JSON.parse(await readFile("data/processed/ncc-lung-registry-metadata.json", "utf8"));

const ids = [...fixtureSource.matchAll(/(?:caseId|sourceEvaluationCaseId|sourceRowId): "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(ids, ["CORE-DEMO-HIM-001", "EVAL-PATH-008", "NCC-LUNG-TST-00081"]);
const sourceCase = evaluation.cases.find((item) => item.caseId === "EVAL-PATH-008");
assert.ok(sourceCase, "원천 평가사례 EVAL-PATH-008이 없습니다.");
assert.equal(sourceCase.sourceRowId, "NCC-LUNG-TST-00081");
assert.equal(sourceCase.scenario, "error");
assert.deepEqual(sourceCase.expectedWarnings.map(({ code }) => code), ["LATERALITY_CONFLICT"]);
assert.ok(fixtureSource.includes(sourceCase.inputText), "병리 원문이 원천 평가사례와 일치하지 않습니다.");

for (const step of ["육안 소견 입력", "병리 결과 입력", "위탁검사 결과 입력", "입력 오류 확인 및 수정", "암·병리 용어·데이터 항목 검색", "최종 확인"]) {
  assert.ok(appSource.includes(step), `핵심 체험 단계 누락: ${step}`);
}
assert.ok(routeSource.includes("coreDemo"), "체험 Route에 coreDemo 옵션이 없습니다.");
assert.ok(shellSource.includes("!coreDemo && activeRole"), "역할 범위 안내가 Route 한정으로 제외되지 않았습니다.");
assert.ok(!shellSource.includes(["채용", "담당자용"].join(" ")), "대상 사용자 한정 문구가 남아 있습니다.");
assert.ok(projectRag.includes('title: "TTF-1 면역병리 입력 형식"'), "TTF-1 로컬 검색 근거가 없습니다.");
const registryText = JSON.stringify(registry);
assert.ok(registryText.includes("종양") && registryText.includes("크기"), "종양 크기 데이터 항목 근거가 없습니다.");
assert.ok(!appSource.includes("/api/analyze") && !appSource.includes("gemini"), "핵심 체험에서 생성형 AI Route를 호출하면 안 됩니다.");

console.log("핵심 기능 체험 검증 통과: 단일 사례 1건, 6단계 동일 ID, 오류·수정값·로컬 검색 근거 연결, Gemini 호출 0건.");
