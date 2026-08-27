import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTypeScriptModule(relativePath) {
  const filePath = path.resolve(relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filePath,
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", "require", output)(loaded.exports, loaded, require);
  return loaded.exports;
}

const matcher = loadTypeScriptModule("lib/medical-term-matcher.ts");
const decisions = loadTypeScriptModule("lib/term-review-state.ts");
const confirmedControls = loadTypeScriptModule("lib/confirmed-value-controls.ts");
const reviewPermissions = loadTypeScriptModule("lib/review-permissions.ts");
const geminiErrors = loadTypeScriptModule("lib/gemini-error.ts");

const terms = [
  { term: "adenocarcinoma", normalizedTerm: matcher.normalizeMedicalTerm("adenocarcinoma"), aliases: ["선암"] },
  { term: "squamous cell carcinoma", normalizedTerm: matcher.normalizeMedicalTerm("squamous cell carcinoma"), aliases: ["편평세포암"] },
];

assert.equal(matcher.normalizeMedicalTerm("  ADENOCARCINOMA  "), "adenocarcinoma", "대소문자와 바깥 공백을 정규화해야 합니다.");
assert.equal(matcher.normalizeMedicalTerm("TTF - 1"), "ttf-1", "용어 내부 공백을 정규화해야 합니다.");
assert.equal(matcher.findMedicalTermCandidates("Adenocarcinoma", terms).exact?.term, "adenocarcinoma", "정상 용어를 수정 후보로 오탐하면 안 됩니다.");
assert.equal(matcher.findMedicalTermCandidates("선암", terms).exact?.term, "adenocarcinoma", "등록 별칭을 정상 용어로 인식해야 합니다.");
assert.equal(matcher.findMedicalTermCandidates("adenocarcioma", terms).candidates[0]?.term, "adenocarcinoma", "단순 철자 오류 후보를 찾아야 합니다.");
assert.equal(matcher.findMedicalTermCandidates("unlisted-expression", terms).candidates.length, 0, "미등재 표현에 임의 후보를 만들면 안 됩니다.");

const highRiskCases = [
  ["diagnosis", "positive"], ["diagnosis", "negative"], ["diagnosis", "left"], ["diagnosis", "right"],
  ["pathologicT", "pT1c"], ["pathologicN", "pN1"], ["pathologicM", "pM0"],
  ["tumorSize", "2.4 cm"], ["margin", "negative"], ["lymphNodes", "1/12"],
  ["immunopathology", "TTF-1 positive"], ["molecularPathology", "EGFR detected"],
  ["order_number", "EXT-001"], ["specimen", "lung biopsy"],
];
for (const [fieldName, value] of highRiskCases) {
  assert.equal(matcher.isHighRiskMedicalTerm(fieldName, value), true, `${fieldName}은 고위험 자동수정 차단 대상이어야 합니다.`);
}
assert.equal(matcher.isHighRiskMedicalTerm("diagnosis", "adenocarcioma"), false, "단순 철자 오류는 낮은 위험 후보로 남아야 합니다.");

const accepted = decisions.createTermReviewDecision("accepted", "adenocarcinoma", "2026-08-25T00:00:00.000Z");
const rejected = decisions.createTermReviewDecision("rejected", undefined, "2026-08-25T00:00:00.000Z");
const manuallyEdited = decisions.createTermReviewDecision("manually_edited", "adenocarcinoma, NOS", "2026-08-25T00:00:00.000Z");
const needsReview = decisions.createTermReviewDecision("needs_review", undefined, "2026-08-25T00:00:00.000Z");
assert.equal(decisions.confirmedValueFromDecision(accepted), "adenocarcinoma", "제안 적용은 확정값 후보에만 값을 제공해야 합니다.");
assert.equal(decisions.confirmedValueFromDecision(manuallyEdited), "adenocarcinoma, NOS", "직접 수정값만 확정값 후보에 반영해야 합니다.");
assert.equal(decisions.confirmedValueFromDecision(rejected), null, "원문 유지는 새 확정값을 만들면 안 됩니다.");
assert.equal(decisions.confirmedValueFromDecision(needsReview), null, "확인 필요는 새 확정값을 만들면 안 됩니다.");
assert.equal(decisions.applyUniqueTermReviewDecision(accepted, rejected), accepted, "이미 결정된 제안을 중복 승인하거나 덮어쓰면 안 됩니다.");
assert.equal(decisions.applyUniqueTermReviewDecision(undefined, needsReview), needsReview, "첫 결정은 정상 반영되어야 합니다.");

const grossLaterality = confirmedControls.getConfirmedValueControl("gross", "laterality", "우측");
const pathologyStage = confirmedControls.getConfirmedValueControl("pathology", "pathologicT", "pT1c");
const pathologyDiagnosis = confirmedControls.getConfirmedValueControl("pathology", "diagnosis", "adenocarcinoma");
const pathologySize = confirmedControls.getConfirmedValueControl("pathology", "tumorSize", "2.4 cm");
const missingGrossLaterality = confirmedControls.getConfirmedValueControl("gross", "laterality", null);
const missingPathologyDiagnosis = confirmedControls.getConfirmedValueControl("pathology", "diagnosis", null);
const missingPathologyStage = confirmedControls.getConfirmedValueControl("pathology", "pathologicStage", null);
assert.equal(grossLaterality.type, "select", "좌우는 자유 입력이 아닌 선택형 확인 항목이어야 합니다.");
assert.equal(grossLaterality.allowOther, false, "좌우에는 기타 직접 입력 경로를 두면 안 됩니다.");
assert.equal(grossLaterality.options.find((option) => option.value === "우측")?.label, "우측 (right)", "한글·영어 좌우 표기를 하나의 선택지로 병기해야 합니다.");
assert.equal(pathologyStage.allowOther, false, "병기는 원문 추출값 외의 기타 입력 경로를 두면 안 됩니다.");
assert.deepEqual(pathologyStage.options.map((option) => option.value), ["pT1c"], "병기 선택지는 원문에서 추출된 값만 포함해야 합니다.");
assert.equal(pathologyDiagnosis.allowOther, true, "진단명은 원문 표현을 보존할 수 있도록 기타 직접 입력을 허용해야 합니다.");
assert.equal(pathologyDiagnosis.options.find((option) => option.value === "선암")?.label, "선암 (adenocarcinoma)", "진단 후보는 한글·영어를 하나의 선택지로 병기해야 합니다.");
assert.equal(confirmedControls.isConfirmedValueOption(pathologyDiagnosis, "adenocarcinoma"), true, "영문 원문 표현도 병기 선택지의 별칭으로 인식해야 합니다.");
assert.equal(pathologySize.type, "text", "복합 크기·단위 표기는 원문 표기 직접 입력으로 유지해야 합니다.");
for (const missingControl of [missingGrossLaterality, missingPathologyDiagnosis, missingPathologyStage]) {
  assert.equal(missingControl.type, "text", "원문 값이 null이면 선택 후보가 아닌 빈 자유 입력으로 표시해야 합니다.");
  assert.deepEqual(missingControl.options, [], "원문 값이 null이면 선택 후보를 노출하면 안 됩니다.");
  assert.equal(missingControl.allowOther, false, "원문 값이 null이면 기타 선택지도 노출하면 안 됩니다.");
}

const errorFieldControls = [
  ["gross", "size", "4.4 x 2.9 x 1.4", "text"],
  ["gross", "laterality", "우측", "select"],
  ["gross", "cutSurface", "회백색이며 단단하다", "select"],
  ["gross", "lesionLocation", "하엽 말초", "text"],
  ["gross", "blockCount", "3개", "text"],
  ["pathology", "tumorSize", "4.2", "text"],
  ["pathology", "laterality", "우측", "select"],
  ["pathology", "margin", "절제연 음성", "select"],
  ["pathology", "lymphNodes", "2개/22개", "text"],
  ["pathology", "pathologicM", "pM1a", "select"],
  ["pathology", "immunopathology", "TTF-1 검사 시행", "text"],
];
for (const [kind, fieldName, sourceValue, expectedType] of errorFieldControls) {
  assert.equal(
    confirmedControls.getConfirmedValueControl(kind, fieldName, sourceValue).type,
    expectedType,
    `${kind}.${fieldName} 오류 사례의 담당자 확정값 입력 형식이 유지되어야 합니다.`,
  );
}

const publicHimPermissions = reviewPermissions.getReviewPermissions("him", true);
assert.equal(publicHimPermissions.canEditSource, false, "공개 배포에서는 자유 원문 편집을 차단해야 합니다.");
assert.equal(publicHimPermissions.canEditConfirmedValues, true, "공개 배포에서도 담당자 확정값은 세션 내에서 편집할 수 있어야 합니다.");
const localHimPermissions = reviewPermissions.getReviewPermissions("him", false);
assert.equal(localHimPermissions.canEditSource, true, "로컬 비공개 환경의 보건의료정보관리사는 가상 원문을 편집할 수 있어야 합니다.");
assert.equal(localHimPermissions.canEditConfirmedValues, true, "로컬 환경의 담당자 확정값 편집을 허용해야 합니다.");
for (const role of ["pathologist", "lab", "quality"]) {
  const permissions = reviewPermissions.getReviewPermissions(role, true);
  assert.equal(permissions.canEditSource, false, `${role} 역할은 원문 편집이 불가해야 합니다.`);
  assert.equal(permissions.canEditConfirmedValues, false, `${role} 역할은 담당자 확정값 편집이 불가해야 합니다.`);
}

const appSource = fs.readFileSync("components/pathoscribe-app.tsx", "utf8");
assert.match(appSource, /source-textarea[\s\S]*readOnly=\{!canEditSource\}/, "원문 입력은 공개 배포의 원문 편집 권한을 따라야 합니다.");
assert.match(appSource, /confirmed-value-control[\s\S]*readOnly=\{!canEditConfirmedValues\}/, "육안·병리 담당자 확정값은 세션 편집 권한을 따라야 합니다.");
assert.match(appSource, /referral-confirmed-value[\s\S]*readOnly=\{!canEditConfirmedValues\}/, "위탁검사 담당자 확정값은 세션 편집 권한을 따라야 합니다.");
assert.doesNotMatch(appSource, /const canEdit = role === "him" && !publicDeployment/, "공개 배포 여부로 모든 편집을 함께 차단하는 이전 권한 결합이 남아 있으면 안 됩니다.");

assert.equal(geminiErrors.classifyGeminiFailure({ status: 429, message: "RESOURCE_EXHAUSTED" }), "quota", "Gemini 할당량 오류를 quota로 분류해야 합니다.");
assert.equal(geminiErrors.classifyGeminiFailure({ status: 503, message: "service unavailable" }), "upstream", "Gemini 상위 API 5xx를 upstream으로 분류해야 합니다.");
assert.equal(geminiErrors.classifyGeminiFailure({ name: "AbortError", message: "The operation timed out" }), "timeout", "Gemini 시간 초과를 timeout으로 분류해야 합니다.");
assert.equal(geminiErrors.classifyGeminiFailure({ message: "Gemini response schema is invalid" }), "schema", "잘못된 Gemini 응답 스키마를 schema로 분류해야 합니다.");
assert.match(geminiErrors.geminiFailureMessage("quota"), /무료 API 할당량이 소진되어 실시간 분석을 잠시 사용할 수 없습니다/);

console.log(`v1.1 단위 검증 통과: 용어 정규화·오탈자·미등재 6건, 고위험 차단 ${highRiskCases.length}건, 승인 상태 6건.`);
