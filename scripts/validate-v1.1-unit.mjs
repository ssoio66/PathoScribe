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

console.log(`v1.1 단위 검증 통과: 용어 정규화·오탈자·미등재 6건, 고위험 차단 ${highRiskCases.length}건, 승인 상태 6건.`);
