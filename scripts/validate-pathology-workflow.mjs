import { readFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] ?? "data/generated");
const load = async (name) => JSON.parse(await readFile(path.join(outputDirectory, `${name}.json`), "utf8"));
const tables = {
  pathology_orders: await load("pathology_orders"),
  specimens: await load("specimens"),
  gross_descriptions: await load("gross_descriptions"),
  blocks: await load("blocks"),
  pathology_reports: await load("pathology_reports"),
  immunohistochemistry_results: await load("immunohistochemistry_results"),
  molecular_pathology_results: await load("molecular_pathology_results"),
  outsourced_test_results: await load("outsourced_test_results"),
  transcription_reviews: await load("transcription_reviews"),
};
const manifest = await load("manifest");
const issues = [];
const indexes = {};
const primaryKeys = {
  pathology_orders: "order_id",
  specimens: "specimen_id",
  gross_descriptions: "gross_description_id",
  blocks: "block_id",
  pathology_reports: "report_id",
  immunohistochemistry_results: "ihc_result_id",
  molecular_pathology_results: "molecular_result_id",
  outsourced_test_results: "outsourced_result_id",
  transcription_reviews: "review_id",
};
const allowedSourceTypes = new Set(["public_synthetic", "generated_demo", "public_aggregate", "reference_metadata"]);
const forbiddenPrivacyKeys = /^(patient(_.*)?|person(_.*)?|patient_name|person_name|full_name|birth(_.*)?|date_of_birth|dob|resident(_.*)?|hospital_registration(_.*)?|mrn)$/i;
const idPatterns = {
  pathology_orders: /^ORD-LUNG-2026-\d{5}$/,
  specimens: /^SPC-LUNG-2026-\d{5}$/,
  gross_descriptions: /^GRS-LUNG-2026-\d{5}$/,
  blocks: /^BLK-LUNG-2026-\d{5}-[AB]1$/,
  pathology_reports: /^RPT-LUNG-2026-\d{5}$/,
  immunohistochemistry_results: /^IHC-LUNG-2026-\d{5}$/,
  molecular_pathology_results: /^MOL-LUNG-2026-\d{5}$/,
  outsourced_test_results: /^EXT-LUNG-2026-\d{5}$/,
  transcription_reviews: /^REV-LUNG-2026-\d{5}$/,
};

for (const [tableName, rows] of Object.entries(tables)) {
  if (!Array.isArray(rows) || rows.length === 0) issues.push(`${tableName}: 데이터가 없습니다.`);
  const primaryKey = primaryKeys[tableName];
  const index = new Map();
  for (const [rowIndex, row] of rows.entries()) {
    const id = row[primaryKey];
    if (typeof id !== "string" || !idPatterns[tableName].test(id)) issues.push(`${tableName}[${rowIndex}]: 요청 형식의 가상 기본 ID가 없습니다.`);
    else if (index.has(id)) issues.push(`${tableName}: 중복 ID ${id}`);
    else index.set(id, row);
    if (!row.source_type) issues.push(`${tableName}[${rowIndex}]: source_type이 누락되었습니다.`);
    else if (!allowedSourceTypes.has(row.source_type)) issues.push(`${tableName}[${rowIndex}]: source_type이 유효하지 않습니다.`);
    for (const key of Object.keys(row)) if (forbiddenPrivacyKeys.test(key)) issues.push(`${tableName}[${rowIndex}]: 개인정보 형식 컬럼 ${key}`);
  }
  indexes[tableName] = index;
  if (manifest.table_counts[tableName] !== rows.length) issues.push(`${tableName}: manifest 건수와 실제 건수가 다릅니다.`);
}

const has = (table, id, owner, field) => {
  if (!indexes[table].has(id)) issues.push(`${owner}: 존재하지 않는 ${field} ${id}`);
};
for (const row of tables.specimens) has("pathology_orders", row.order_id, row.specimen_id, "order_id");
for (const row of tables.gross_descriptions) {
  has("pathology_orders", row.order_id, row.gross_description_id, "order_id");
  has("specimens", row.specimen_id, row.gross_description_id, "specimen_id");
}
for (const row of tables.blocks) {
  has("pathology_orders", row.order_id, row.block_id, "order_id");
  has("specimens", row.specimen_id, row.block_id, "specimen_id");
}
for (const row of tables.pathology_reports) {
  has("pathology_orders", row.order_id, row.report_id, "order_id");
  has("specimens", row.specimen_id, row.report_id, "specimen_id");
}
for (const [tableName, rows] of Object.entries({
  immunohistochemistry_results: tables.immunohistochemistry_results,
  molecular_pathology_results: tables.molecular_pathology_results,
  outsourced_test_results: tables.outsourced_test_results,
})) {
  for (const row of rows) {
    const owner = row[primaryKeys[tableName]];
    has("pathology_orders", row.order_id, owner, "order_id");
    has("specimens", row.specimen_id, owner, "specimen_id");
    has("blocks", row.block_id, owner, "block_id");
    has("pathology_reports", row.report_id, owner, "report_id");
    const specimen = indexes.specimens.get(row.specimen_id);
    const block = indexes.blocks.get(row.block_id);
    const report = indexes.pathology_reports.get(row.report_id);
    if (specimen && specimen.order_id !== row.order_id) issues.push(`${owner}: specimen-order 연결 불일치`);
    if (block && (block.specimen_id !== row.specimen_id || block.order_id !== row.order_id)) issues.push(`${owner}: block 연결 불일치`);
    if (report && (report.specimen_id !== row.specimen_id || report.order_id !== row.order_id)) issues.push(`${owner}: report 연결 불일치`);
    if (tableName === "outsourced_test_results") {
      if (row.outsourced_id !== row.outsourced_result_id) issues.push(`${owner}: outsourced_id와 outsourced_result_id가 다릅니다.`);
      if (row.external_request_id !== row.outsourced_result_id) issues.push(`${owner}: 위탁검사 외부 의뢰번호가 결과 ID와 연결되지 않았습니다.`);
      if (row.internal_order_id !== row.order_id) issues.push(`${owner}: 위탁검사와 내부 의뢰정보 order_id 불일치`);
      if (row.internal_specimen_id !== row.specimen_id) issues.push(`${owner}: 위탁검사와 내부 의뢰정보 specimen_id 불일치`);
    }
  }
}

for (const row of tables.pathology_reports) {
  const specimen = indexes.specimens.get(row.specimen_id);
  if (specimen && specimen.order_id !== row.order_id) issues.push(`${row.report_id}: specimen-order 연결 불일치`);
}
for (const row of tables.transcription_reviews) {
  has("pathology_orders", row.order_id, row.review_id, "order_id");
  has("specimens", row.specimen_id, row.review_id, "specimen_id");
  has("gross_descriptions", row.gross_description_id, row.review_id, "gross_description_id");
  has("pathology_reports", row.report_id, row.review_id, "report_id");
  has("immunohistochemistry_results", row.ihc_result_id, row.review_id, "ihc_result_id");
  has("molecular_pathology_results", row.molecular_result_id, row.review_id, "molecular_result_id");
  has("outsourced_test_results", row.outsourced_id, row.review_id, "outsourced_id");
  const specimen = indexes.specimens.get(row.specimen_id);
  const gross = indexes.gross_descriptions.get(row.gross_description_id);
  const report = indexes.pathology_reports.get(row.report_id);
  const ihc = indexes.immunohistochemistry_results.get(row.ihc_result_id);
  const molecular = indexes.molecular_pathology_results.get(row.molecular_result_id);
  const outsourced = indexes.outsourced_test_results.get(row.outsourced_id);
  for (const [label, linked] of Object.entries({ specimen, gross, report, ihc, molecular, outsourced })) {
    if (linked && linked.order_id !== row.order_id) issues.push(`${row.review_id}: 검수 완료 레코드의 ${label} 검사번호 불일치`);
  }
}
const countByOrder = (rows) => {
  const counts = new Map();
  for (const row of rows) counts.set(row.order_id, (counts.get(row.order_id) ?? 0) + 1);
  return counts;
};
const expectedRelations = [
  ["specimens", countByOrder(tables.specimens), 1],
  ["gross_descriptions", countByOrder(tables.gross_descriptions), 1],
  ["blocks", countByOrder(tables.blocks), 2],
  ["pathology_reports", countByOrder(tables.pathology_reports), 1],
  ["immunohistochemistry_results", countByOrder(tables.immunohistochemistry_results), 1],
  ["molecular_pathology_results", countByOrder(tables.molecular_pathology_results), 1],
  ["outsourced_test_results", countByOrder(tables.outsourced_test_results), 1],
  ["transcription_reviews", countByOrder(tables.transcription_reviews), 1],
];
for (const order of tables.pathology_orders) {
  for (const [tableName, counts, expected] of expectedRelations) {
    const actual = counts.get(order.order_id) ?? 0;
    if (actual !== expected) issues.push(`${order.order_id}: ${tableName} 연결이 ${actual}건이며 예상 ${expected}건과 다릅니다.`);
  }
}

if (!manifest.all_ids_are_virtual) issues.push("manifest: all_ids_are_virtual 표시가 없습니다.");
if (issues.length) {
  console.error(`가상 병리 업무 데이터 무결성 검증 실패 (${issues.length}건)`);
  for (const issue of issues.slice(0, 100)) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`무결성 검증 통과: 9개 테이블, ${Object.values(tables).reduce((sum, rows) => sum + rows.length, 0).toLocaleString("ko-KR")}행, 중복 ID 0건, 끊어진 외래키 0건, 존재하지 않는 검사번호 0건, 보고서-검체 불일치 0건, 위탁검사-의뢰정보 불일치 0건, source_type 누락 0건.`);
