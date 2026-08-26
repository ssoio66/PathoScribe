import assert from "node:assert/strict";
import { evaluationComparisonStatus } from "../lib/evaluation-comparison.ts";

const equivalentCases = [
  ["specimen", "우측 폐 중엽 폐 생검", "폐 생검"],
  ["diagnosis", "편평세포암, keratinizing type, 중등도 분화", "편평세포암"],
  ["histologicType", "편평세포암, keratinizing type", "keratinizing type"],
];

for (const [fieldKey, actual, expected] of equivalentCases) {
  assert.equal(evaluationComparisonStatus(fieldKey, actual, expected), "equivalent", `${fieldKey}: 확장 표현은 의미상 일치여야 합니다.`);
}

assert.equal(evaluationComparisonStatus("diagnosis", "편평세포암, 선암", "편평세포암"), "mismatch", "서로 다른 진단명이 함께 있으면 불일치여야 합니다.");
assert.equal(evaluationComparisonStatus("laterality", "우측", "좌측"), "mismatch", "좌우는 느슨하게 비교하면 안 됩니다.");
assert.equal(evaluationComparisonStatus("tumorSize", "4.2 cm", "4.2"), "mismatch", "단위가 다른 크기는 불일치여야 합니다.");
assert.equal(evaluationComparisonStatus("specimen", null, "폐 생검"), "missing", "원문 추출값이 없으면 누락이어야 합니다.");
assert.equal(evaluationComparisonStatus("specimen", "폐 생검", null), "generated", "정답에 없는 값은 생성값으로 표시해야 합니다.");

console.log("평가 비교 기준 검증 통과: 확장 표현, 충돌 후보, 고위험 필드, null 상태를 확인했습니다.");
