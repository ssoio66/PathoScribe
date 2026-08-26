import { readFile } from "node:fs/promises";

const casesPath = process.argv[2] ?? "data/evaluation/evaluation-cases.json";
const generatedDirectory = process.argv[3] ?? "data/generated";
const load = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const dataset = await load(casesPath);
const reports = await load(`${generatedDirectory}/pathology_reports.json`);
const molecular = await load(`${generatedDirectory}/molecular_pathology_results.json`);
const manifest = await load(`${generatedDirectory}/manifest.json`);
const issues = [];

const expectedHeaders = new Set(manifest.workbook.sheets.flatMap((sheet) => sheet.columns.map((column) => column.source_header)));
const reportBySource = new Map(reports.map((row) => [row.source_record_id, row]));
const molecularBySource = new Map(molecular.map((row) => [row.source_record_id, row]));
const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
const idSet = new Set();
const rowSet = new Set();
const injectedErrorCodes = new Set();
const expectedDistribution = {
  gross: { total: 10, normal: 4, error: 6 },
  pathology: { total: 15, normal: 5, error: 10 },
  outsourced: { total: 10, normal: 3, error: 7 },
};
const requiredInjectedErrorCodes = new Set([
  "LATERALITY_CONFLICT",
  "MISSING_UNIT",
  "SPECIMEN_COUNT_MISMATCH",
  "BLOCK_COUNT_MISSING",
  "MARGIN_MISSING",
  "LYMPH_NODE_FRACTION_INCONSISTENCY",
  "PATHOLOGIC_T_MISMATCH",
  "PATHOLOGIC_N_MISMATCH",
  "IMMUNOPATHOLOGY_RESULT_MISSING",
  "ORDER_NUMBER_MISMATCH",
  "SPECIMEN_MISMATCH",
  "REPORT_DATE_MISSING",
  "AMENDMENT_STATUS_MISSING",
]);

const activeLabels = (sourceFields, key, labelPattern) => sourceFields
  .filter((field) => field.key === key && Number(field.rawValue) === 1)
  .map((field) => field.sourceHeader.match(labelPattern)?.[1] ?? null)
  .filter(Boolean);
const requiredKeys = ["caseId", "caseType", "sourceType", "sourceRowId", "sourceFields", "templateVersion", "inputText", "groundTruth", "injectedErrors", "expectedWarnings", "expectedReview", "disclaimer"];
const privacyPattern = /\b\d{6}-?[1-4]\d{6}\b|\b01[016789]-?\d{3,4}-?\d{4}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

for (const [index, item] of cases.entries()) {
  const owner = item.caseId ?? `cases[${index}]`;
  for (const key of requiredKeys) if (!(key in item)) issues.push(`${owner}: ${key} 누락`);
  if (!/^EVAL-(GROSS|PATH|OUT)-\d{3}$/.test(item.caseId ?? "")) issues.push(`${owner}: caseId 형식 오류`);
  if (idSet.has(item.caseId)) issues.push(`${owner}: 중복 caseId`);
  else idSet.add(item.caseId);
  if (rowSet.has(item.sourceRowId)) issues.push(`${owner}: 중복 sourceRowId ${item.sourceRowId}`);
  else rowSet.add(item.sourceRowId);
  if (item.sourceType !== "generated_demo") issues.push(`${owner}: 사례 sourceType은 generated_demo여야 합니다.`);
  if (!item.disclaimer?.includes("실제 환자정보") || !item.disclaimer?.includes("담당자의 원문 대조")) issues.push(`${owner}: 안전 고지 누락`);
  if (privacyPattern.test(item.inputText ?? "")) issues.push(`${owner}: 개인정보 형식 문자열 발견`);
  if (item.scenario === "normal" && (item.injectedErrors.length || item.expectedWarnings.length)) issues.push(`${owner}: 정상 사례에 오류 또는 경고가 있습니다.`);
  if (item.scenario === "error" && (!item.injectedErrors.length || !item.expectedWarnings.length)) issues.push(`${owner}: 오류 사례의 오류 또는 기대 경고가 비었습니다.`);
  if (item.injectedErrors.map(({ code }) => code).join("|") !== item.expectedWarnings.map(({ code }) => code).join("|")) issues.push(`${owner}: 주입 오류와 기대 경고 코드가 다릅니다.`);
  if (typeof item.expectedReview?.required !== "boolean") issues.push(`${owner}: expectedReview.required type is invalid`);
  if (item.expectedReview?.required && !item.expectedReview?.reason) issues.push(`${owner}: expectedReview reason is missing`);
  for (const { code } of item.injectedErrors) injectedErrorCodes.add(code);
  if (!Array.isArray(item.sourceFields) || item.sourceFields.length !== 22) issues.push(`${owner}: 추적 가능한 원본 필드는 22개여야 합니다.`);

  const cells = new Set();
  for (const field of item.sourceFields ?? []) {
    if (field.sourceType !== "public_synthetic") issues.push(`${owner}: sourceFields는 public_synthetic이어야 합니다.`);
    if (!expectedHeaders.has(field.sourceHeader)) issues.push(`${owner}: 원본에 없는 헤더 ${field.sourceHeader}`);
    if (cells.has(field.excelCell)) issues.push(`${owner}: 중복 원본 셀 ${field.excelCell}`);
    cells.add(field.excelCell);
    if (!field.excelCell.endsWith(String(item.sourceLocation.excelRow))) issues.push(`${owner}: sourceLocation과 셀 행 불일치 ${field.excelCell}`);
  }
  for (const field of item.generatedFields ?? []) if (field.sourceType !== "generated_demo") issues.push(`${owner}: generatedFields는 generated_demo이어야 합니다.`);

  const report = reportBySource.get(item.sourceRowId);
  const molecularRow = molecularBySource.get(item.sourceRowId);
  if (!report || !molecularRow) {
    issues.push(`${owner}: 기존 원본 매핑 테이블에서 sourceRowId를 찾을 수 없습니다.`);
  } else {
    const histology = activeLabels(item.sourceFields, "histologyFlag", /\((.+)\)$/);
    const t = activeLabels(item.sourceFields, "stageTFlag", /\((T[^)]+)\)$/);
    const n = activeLabels(item.sourceFields, "stageNFlag", /\((N[^)]+)\)$/);
    const m = activeLabels(item.sourceFields, "stageMFlag", /\((M[^)]+)\)$/);
    if (JSON.stringify(histology) !== JSON.stringify(report.histology_source_flags)) issues.push(`${owner}: 조직학 플래그 원본 매핑 불일치`);
    if (JSON.stringify(t) !== JSON.stringify(report.stage_t_source_flags)) issues.push(`${owner}: T 플래그 원본 매핑 불일치`);
    if (JSON.stringify(n) !== JSON.stringify(report.stage_n_source_flags)) issues.push(`${owner}: N 플래그 원본 매핑 불일치`);
    if (JSON.stringify(m) !== JSON.stringify(report.stage_m_source_flags)) issues.push(`${owner}: M 플래그 원본 매핑 불일치`);
    const operation = item.sourceFields.find((field) => field.key === "operation")?.rawValue;
    const egfr = item.sourceFields.find((field) => field.key === "egfrDetection")?.rawValue;
    if (operation !== report.operation_source_value) issues.push(`${owner}: 수술여부 원본값 불일치`);
    if (egfr !== molecularRow.egfr_detection_source_value) issues.push(`${owner}: EGFR 원본값 불일치`);
  }

  const referenceKeys = new Set(item.groundTruth?.referenceFields?.map(({ key }) => key) ?? []);
  const extractionKeys = new Set(item.groundTruth?.expectedExtraction?.map(({ key }) => key) ?? []);
  if (referenceKeys.size !== extractionKeys.size || [...referenceKeys].some((key) => !extractionKeys.has(key))) issues.push(`${owner}: referenceFields와 expectedExtraction 키 구성이 다릅니다.`);
  if (item.groundTruth?.sourceContext?.length !== 6 || item.groundTruth.sourceContext.some((field) => field.sourceType !== "public_synthetic")) issues.push(`${owner}: 원본 구조화 ground truth sourceContext가 올바르지 않습니다.`);
  for (const field of item.groundTruth?.sourceContext ?? []) {
    if (field.sourceHeader && !item.sourceFields.some((source) => source.sourceHeader === field.sourceHeader)) issues.push(`${owner}: ${field.key} sourceContext의 원본 헤더를 찾을 수 없습니다.`);
  }
  for (const field of item.groundTruth?.referenceFields ?? []) {
    if (field.sourceType === "public_synthetic" && field.sourceHeader && !item.sourceFields.some((source) => source.sourceHeader === field.sourceHeader)) issues.push(`${owner}: ${field.key}의 sourceHeader를 sourceFields에서 찾을 수 없습니다.`);
  }
  for (const field of item.groundTruth?.expectedExtraction ?? []) {
    if (field.value === null && (field.evidenceText !== null || field.status !== "missing")) issues.push(`${owner}: ${field.key} null 값의 evidence/status가 올바르지 않습니다.`);
    if (field.value !== null && (!field.evidenceText || !item.inputText.includes(field.evidenceText))) issues.push(`${owner}: ${field.key} evidenceText가 inputText에 없습니다.`);
  }
  if (item.caseType === "pathology") {
    const stage = item.groundTruth.referenceFields.find(({ key }) => key === "pathologicStage");
    if (!stage || stage.value !== null) issues.push(`${owner}: 원본에 없는 최종 Stage를 생성하면 안 됩니다.`);
  }
}

for (const [caseType, expected] of Object.entries(expectedDistribution)) {
  const selected = cases.filter((item) => item.caseType === caseType);
  const actual = { total: selected.length, normal: selected.filter((item) => item.scenario === "normal").length, error: selected.filter((item) => item.scenario === "error").length };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push(`${caseType}: 분포 불일치 ${JSON.stringify(actual)}`);
}
if (cases.length !== 35) issues.push(`전체 평가사례는 35건이어야 합니다: ${cases.length}`);
if (dataset.source?.sheets?.length !== 2 || dataset.source?.inspectedHeaders?.length !== 34) issues.push("원본 XLSX 시트 2개·컬럼 34개 검증 정보가 없습니다.");
if (dataset.fixtureVersion !== "evaluation-fixtures-v1.1.3" || dataset.generationMode !== "deterministic_fixed_selection_and_templates") issues.push("고정 fixture 생성 정보가 올바르지 않습니다.");
if ("generatedAt" in dataset) issues.push("평가사례 출력에는 실행마다 달라지는 생성 시각을 저장하면 안 됩니다.");
for (const code of requiredInjectedErrorCodes) if (!injectedErrorCodes.has(code)) issues.push(`필수 오류 유형 누락: ${code}`);

if (issues.length) {
  console.error(`평가사례 검증 실패 (${issues.length}건)`);
  for (const issue of issues.slice(0, 100)) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("평가사례 검증 통과: 35건, 정상 12건, 오류 23건, sourceRowId 중복 0건, 원본 매핑 불일치 0건, provenance 누락 0건.");
