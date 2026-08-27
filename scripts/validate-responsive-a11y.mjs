import fs from "node:fs";

const css = fs.readFileSync("app/globals.css", "utf8");
const app = fs.readFileSync("components/pathoscribe-app.tsx", "utf8");

const checks = [
  ["어절 단위 줄바꿈", /word-break:\s*keep-all/],
  ["의미 단위 줄바꿈", /text-wrap:\s*balance/],
  ["키보드 포커스 표시", /:focus-visible[^}]*outline:/],
  ["데스크톱·태블릿 반응형 기준", /@media\s*\(max-width:\s*1100px\)[\s\S]*@media\s*\(max-width:\s*760px\)/],
  ["모바일 평가사례 선택창 1열", /@media\s*\(max-width:\s*720px\)[\s\S]*evaluation-case-picker\s*\{\s*grid-template-columns:1fr/],
  ["평가사례 긴 ID 말줄임", /evaluation-case-picker strong[^}]*text-overflow:\s*ellipsis/],
  ["평가사례 전체 ID title", /title=\{loadedEvaluationCase/],
  ["표 가로 넘침 보호", /intro-problem-table-wrap[^}]*overflow-x:\s*auto/],
  ["모바일 표 재배치", /@media\s*\(max-width:\s*760px\)[\s\S]*intro-problem-table thead\s*\{\s*display:none/],
  ["역할 요약 모바일 줄바꿈", /role-scope-summary[^}]*flex-wrap:\s*wrap/],
  ["역할 범위 토글 ARIA", /role-scope-toggle[^\n]*aria-expanded=\{expanded\}[^\n]*aria-controls=\{detailId\}/],
  ["상세 아코디언 native details", /<details className="panel service-detail-panel">[\s\S]*<summary>개발 상세 보기<\/summary>/],
  ["상태 텍스트 라벨", /function StatusChip[\s\S]*status-chip/],
  ["중복 클릭 방지 상태", /disabled=\{loading/],
];

const results = checks.map(([name, pattern]) => {
  const target = name === "역할 4종 선택" ? app : `${css}\n${app}`;
  const passed = name === "역할 4종 선택" ? (target.match(pattern) ?? []).length === 4 : pattern.test(target);
  return { name, passed };
});
const roleCount = ["him", "pathologist", "lab", "quality"].filter((role) => new RegExp(`(?:\\r?\\n)\\s+${role}:\\s*\\{`).test(app)).length;
results[results.length - 1] = { name: "역할 4종 선택", passed: roleCount === 4 };
for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
const failed = results.filter((result) => !result.passed);
console.log(`${results.length - failed.length}/${results.length} responsive/accessibility static checks passed`);
if (failed.length) process.exitCode = 1;
