import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const loadJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const [preview, evaluation] = await Promise.all([
  loadJson("data/generated/web_preview.json"),
  loadJson("data/evaluation/evaluation-cases.json"),
]);

const issues = [];
const previewBySourceRowId = new Map();
for (const item of preview.cases ?? []) {
  const sourceRowId = item?.order?.source_record_id;
  const orderId = item?.order?.order_id;
  if (typeof sourceRowId !== "string" || typeof orderId !== "string") {
    issues.push("web_preview에 order_id 또는 source_record_id가 없습니다.");
    continue;
  }
  if (previewBySourceRowId.has(sourceRowId)) issues.push(`web_preview source_record_id 중복: ${sourceRowId}`);
  else previewBySourceRowId.set(sourceRowId, item);
}

const evaluationBySourceRowId = new Map();
for (const item of evaluation.cases ?? []) {
  if (evaluationBySourceRowId.has(item.sourceRowId)) issues.push(`평가사례 sourceRowId 중복: ${item.sourceRowId}`);
  else evaluationBySourceRowId.set(item.sourceRowId, item);
  const previewItem = previewBySourceRowId.get(item.sourceRowId);
  if (!previewItem) issues.push(`${item.caseId}: web_preview에 정확히 일치하는 source_record_id가 없습니다.`);
}

const linkedPreviewCount = [...previewBySourceRowId.keys()].filter((sourceRowId) => evaluationBySourceRowId.has(sourceRowId)).length;
if (linkedPreviewCount !== evaluationBySourceRowId.size) {
  issues.push(`연결된 web_preview 건수 ${linkedPreviewCount}건이 평가사례 ${evaluationBySourceRowId.size}건과 다릅니다.`);
}

if (issues.length) {
  console.error(`작업목록-평가사례 연결 검증 실패 (${issues.length}건)`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`작업목록-평가사례 연결 검증 통과: 평가사례 ${evaluationBySourceRowId.size}건, 정확한 source_record_id 연결 ${linkedPreviewCount}건, 미연결 미리보기 ${previewBySourceRowId.size - linkedPreviewCount}건.`);
