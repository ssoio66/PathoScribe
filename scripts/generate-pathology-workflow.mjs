import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_HEADERS = [
  "순번(No)",
  "진단시연령(AGE)",
  "조직학적진단명 코드 설명(Adenocarcinoma)",
  "조직학적진단명 코드 설명(Large cell carcinoma)",
  "조직학적진단명 코드 설명(Squamous cell carcinoma)",
  "병기STAGE(TX)",
  "병기STAGE(T0)",
  "병기STAGE(T1)",
  "병기STAGE(T1a)",
  "병기STAGE(T1b)",
  "병기STAGE(T1c)",
  "병기STAGE(T2)",
  "병기STAGE(T2a)",
  "병기STAGE(T2b)",
  "병기STAGE(T3)",
  "병기STAGE(T4)",
  "병기STAGE(N1)",
  "병기STAGE(N2)",
  "병기STAGE(N3)",
  "병기STAGE(M1a)",
  "병기STAGE(M1b)",
  "병기STAGE(M1c)",
  "음주종류(Type of Drink)",
  "흡연여부(Smoke)",
  "신장값(Height)",
  "체중측정값(Weight)",
  "FEV 검사 값(FEV1_FVC_P)",
  "DLCO 검사 값(DLCO_VA_P)",
  "EGFR mutation 발견 여부(EGFR mutation Detection)",
  "수술여부(Operation)",
  "항암치료여부(Chemotherapy)",
  "방사선치료여부(Radiation Therapy)",
  "사망여부(Death)",
  "암진단후생존일수(Survival period)",
];

const REQUIRED_SHEETS = new Map([
  ["Adjusted_synlung_trainset", "train"],
  ["Adjusted_synlung_test", "test"],
]);

const PUBLIC_SYNTHETIC = "public_synthetic";
const GENERATED_DEMO = "generated_demo";
const HISTOLOGY_COLUMNS = [
  [3, "Adenocarcinoma"],
  [4, "Large cell carcinoma"],
  [5, "Squamous cell carcinoma"],
];
const T_COLUMNS = [
  [6, "TX"], [7, "T0"], [8, "T1"], [9, "T1a"], [10, "T1b"], [11, "T1c"],
  [12, "T2"], [13, "T2a"], [14, "T2b"], [15, "T3"], [16, "T4"],
];
const N_COLUMNS = [[17, "N1"], [18, "N2"], [19, "N3"]];
const M_COLUMNS = [[20, "M1a"], [21, "M1b"], [22, "M1c"]];

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const openXmlRoot = args.get("--open-xml");
const archivePath = args.get("--archive");
const workbookPath = args.get("--workbook");
const workbookEntry = args.get("--workbook-entry");
const outputDirectory = args.get("--output-directory");
if (!openXmlRoot || !archivePath || !workbookPath || !workbookEntry || !outputDirectory) {
  throw new Error("필수 인자가 누락되었습니다.");
}

const decodeXml = (value) => value
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'");
const sha256 = async (filePath) => createHash("sha256").update(await readFile(filePath)).digest("hex").toUpperCase();
const columnNumber = (letters) => [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
const excelColumn = (number) => {
  let result = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
    result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  }
  return result;
};
const writeJson = async (fileName, value) => writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const padded = (value) => String(value).padStart(5, "0");
const activeLabels = (values, columns) => columns.flatMap(([index, label]) => Number(values.get(index)) === 1 ? [label] : []);
const evaluationDataset = JSON.parse(await readFile(path.join(process.cwd(), "data", "evaluation", "evaluation-cases.json"), "utf8"));
const evaluationSourceRowIds = new Set(evaluationDataset.cases.map((item) => item.sourceRowId));
const reviewFlagState = (flags) => flags.length === 1 ? "single_flag" : flags.length === 0 ? "no_flag_review_required" : "multiple_flags_review_required";

const sharedStringsPath = path.join(openXmlRoot, "xl", "sharedStrings.xml");
let sharedStrings = [];
try {
  const sharedXml = await readFile(sharedStringsPath, "utf8");
  sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join("")),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const workbookXml = await readFile(path.join(openXmlRoot, "xl", "workbook.xml"), "utf8");
const relationshipsXml = await readFile(path.join(openXmlRoot, "xl", "_rels", "workbook.xml.rels"), "utf8");
const relationships = new Map(
  [...relationshipsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)]
    .map((match) => [match[1], match[2]]),
);
const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
  .map((match) => ({ name: decodeXml(match[1]), target: relationships.get(match[2]) }));
const missingSheets = [...REQUIRED_SHEETS.keys()].filter((required) => !sheets.some(({ name }) => name === required));
if (missingSheets.length) throw new Error(`필수 시트가 없습니다: ${missingSheets.join(", ")}`);

const pathologyOrders = [];
const specimens = [];
const grossDescriptions = [];
const blocks = [];
const pathologyReports = [];
const immunohistochemistryResults = [];
const molecularPathologyResults = [];
const outsourcedTestResults = [];
const transcriptionReviews = [];
const evaluationPreviewCases = [];
const unlinkedPreviewCases = [];
const sheetManifest = [];
let globalCaseNumber = 0;

for (const sheet of sheets.filter(({ name }) => REQUIRED_SHEETS.has(name))) {
  if (!sheet.target) throw new Error(`${sheet.name}의 워크시트 관계를 찾을 수 없습니다.`);
  const partition = REQUIRED_SHEETS.get(sheet.name);
  const prefix = partition === "train" ? "TRN" : "TST";
  const sheetPath = path.join(openXmlRoot, "xl", sheet.target.replace(/^\/?xl\//, ""));
  const sheetXml = await readFile(sheetPath, "utf8");
  const dimension = sheetXml.match(/<dimension\b[^>]*ref="([^"]+)"/)?.[1] ?? null;
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  if (!rowMatches.length) throw new Error(`${sheet.name} 시트가 비어 있습니다.`);

  const parsedRows = rowMatches.map((row) => {
    const values = new Map();
    for (const cell of row[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g)) {
      const valueMatch = cell[0].match(/<v>([\s\S]*?)<\/v>/);
      const inlineMatch = cell[0].match(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/);
      if (!valueMatch && !inlineMatch) continue;
      const rawValue = valueMatch?.[1] ?? inlineMatch?.[1] ?? "";
      const value = /\bt="s"/.test(cell[0]) ? sharedStrings[Number(rawValue)] : decodeXml(rawValue);
      values.set(columnNumber(cell[1]), value);
    }
    return values;
  });

  const actualHeaders = EXPECTED_HEADERS.map((_, index) => parsedRows[0].get(index + 1) ?? null);
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) => actualHeaders[index] === expected ? [] : [{
    excelColumn: excelColumn(index + 1), expected, actual: actualHeaders[index],
  }]);
  if (mismatches.length) throw new Error(`${sheet.name} 헤더 불일치: ${JSON.stringify(mismatches)}`);

  const sourceNumbers = new Set();
  for (const values of parsedRows.slice(1)) {
    globalCaseNumber += 1;
    const sourceRowNumber = Number(values.get(1));
    if (!Number.isInteger(sourceRowNumber) || sourceNumbers.has(sourceRowNumber)) {
      throw new Error(`${sheet.name}의 순번(No)이 유일한 정수가 아닙니다: ${values.get(1)}`);
    }
    sourceNumbers.add(sourceRowNumber);

    const suffix = padded(globalCaseNumber);
    const sourceSuffix = padded(sourceRowNumber);
    const sourceRecordId = `NCC-LUNG-${prefix}-${sourceSuffix}`;
    const orderId = `ORD-LUNG-2026-${suffix}`;
    const specimenId = `SPC-LUNG-2026-${suffix}`;
    const grossId = `GRS-LUNG-2026-${suffix}`;
    const reportId = `RPT-LUNG-2026-${suffix}`;
    const blockAId = `BLK-LUNG-2026-${suffix}-A1`;
    const blockBId = `BLK-LUNG-2026-${suffix}-B1`;
    const ihcResultId = `IHC-LUNG-2026-${suffix}`;
    const molecularResultId = `MOL-LUNG-2026-${suffix}`;
    const outsourcedResultId = `EXT-LUNG-2026-${suffix}`;
    const reviewId = `REV-LUNG-2026-${suffix}`;
    const operationValue = Number(values.get(30));
    const histologyFlags = activeLabels(values, HISTOLOGY_COLUMNS);
    const tFlags = activeLabels(values, T_COLUMNS);
    const nFlags = activeLabels(values, N_COLUMNS);
    const mFlags = activeLabels(values, M_COLUMNS);
    const egfrValue = Number(values.get(29));
    if (![0, 1].includes(operationValue)) throw new Error(`${sourceRecordId}의 수술여부 값이 0/1이 아닙니다.`);
    if (![0, 1, 99].includes(egfrValue)) throw new Error(`${sourceRecordId}의 EGFR 값이 0/1/99가 아닙니다.`);

    const order = {
      order_id: orderId,
      source_record_id: sourceRecordId,
      order_category: operationValue === 1 ? "surgical_pathology_simulation" : "biopsy_pathology_simulation",
      requested_workflow: "lung_pathology_transcription_review",
      workflow_sequence: globalCaseNumber,
      review_status: "staff_source_comparison_required",
      source_type: GENERATED_DEMO,
    };
    const specimen = {
      specimen_id: specimenId,
      order_id: orderId,
      source_record_id: sourceRecordId,
      organ: "lung_virtual",
      specimen_category: operationValue === 1 ? "resection_specimen_virtual" : "biopsy_specimen_virtual",
      laterality: "review_required",
      specimen_count: 1,
      source_type: GENERATED_DEMO,
    };
    const gross = {
      gross_description_id: grossId,
      order_id: orderId,
      specimen_id: specimenId,
      source_record_id: sourceRecordId,
      gross_text: operationValue === 1
        ? `가상 폐 절제 검체 1개. 크기 ${(4 + (sourceRowNumber % 30) / 10).toFixed(1)} x ${(2 + (sourceRowNumber % 18) / 10).toFixed(1)} x ${(1 + (sourceRowNumber % 10) / 10).toFixed(1)} cm. 병변 위치와 절제연은 담당자 확인 필요.`
        : `가상 폐 생검 검체 ${2 + (sourceRowNumber % 4)}조각. 전체 크기 ${(0.3 + (sourceRowNumber % 7) / 10).toFixed(1)} cm. 병변 위치는 담당자 확인 필요.`,
      lesion_location: "review_required",
      margin_description: "review_required",
      review_status: "staff_source_comparison_required",
      source_type: GENERATED_DEMO,
    };
    const blockRows = [
      {
        block_id: blockAId,
        order_id: orderId,
        specimen_id: specimenId,
        source_record_id: sourceRecordId,
        block_label: "A1",
        material_type: "ffpe_block_virtual",
        purpose: "routine_pathology_simulation",
        source_type: GENERATED_DEMO,
      },
      {
        block_id: blockBId,
        order_id: orderId,
        specimen_id: specimenId,
        source_record_id: sourceRecordId,
        block_label: "B1",
        material_type: "ffpe_block_virtual",
        purpose: "ancillary_test_simulation",
        source_type: GENERATED_DEMO,
      },
    ];
    const report = {
      report_id: reportId,
      order_id: orderId,
      specimen_id: specimenId,
      source_record_id: sourceRecordId,
      histology_source_flags: histologyFlags,
      histology_flag_status: reviewFlagState(histologyFlags),
      stage_t_source_flags: tFlags,
      stage_n_source_flags: nFlags,
      stage_m_source_flags: mFlags,
      stage_flag_status: {
        t: reviewFlagState(tFlags),
        n: reviewFlagState(nFlags),
        m: reviewFlagState(mFlags),
      },
      operation_source_value: operationValue,
      report_status: "staff_source_comparison_required",
      source_type: PUBLIC_SYNTHETIC,
    };
    const markerCycle = ["TTF-1", "Napsin A", "p40", "CK7"];
    const resultCycle = ["positive_virtual", "negative_virtual", "equivocal_virtual"];
    const ihc = {
      ihc_result_id: ihcResultId,
      order_id: orderId,
      specimen_id: specimenId,
      block_id: blockAId,
      report_id: reportId,
      source_record_id: sourceRecordId,
      marker_name: markerCycle[sourceRowNumber % markerCycle.length],
      result_value: resultCycle[sourceRowNumber % resultCycle.length],
      interpretation: null,
      review_status: "staff_source_comparison_required",
      source_type: GENERATED_DEMO,
    };
    const molecular = {
      molecular_result_id: molecularResultId,
      order_id: orderId,
      specimen_id: specimenId,
      block_id: blockBId,
      report_id: reportId,
      source_record_id: sourceRecordId,
      test_name: "EGFR mutation detection",
      egfr_detection_source_value: egfrValue,
      detected: egfrValue === 99 ? null : egfrValue === 1,
      result_status: egfrValue === 99 ? "not_applicable_in_source" : "source_value_available",
      review_status: "staff_source_comparison_required",
      source_type: PUBLIC_SYNTHETIC,
    };
    const outsourced = {
      outsourced_id: outsourcedResultId,
      outsourced_result_id: outsourcedResultId,
      external_request_id: outsourcedResultId,
      order_id: orderId,
      internal_order_id: orderId,
      specimen_id: specimenId,
      internal_specimen_id: specimenId,
      block_id: blockBId,
      report_id: reportId,
      source_record_id: sourceRecordId,
      organization: "virtual_outsourced_laboratory",
      test_name: sourceRowNumber % 2 === 0 ? "PD-L1 22C3_virtual" : "ALK rearrangement_virtual",
      result_value: sourceRowNumber % 3 === 0 ? "positive_virtual" : sourceRowNumber % 3 === 1 ? "negative_virtual" : "review_required",
      interpretation: null,
      review_status: "staff_source_comparison_required",
      source_type: GENERATED_DEMO,
    };
    const review = {
      review_id: reviewId,
      order_id: orderId,
      specimen_id: specimenId,
      gross_description_id: grossId,
      report_id: reportId,
      ihc_result_id: ihcResultId,
      molecular_result_id: molecularResultId,
      outsourced_id: outsourcedResultId,
      source_record_id: sourceRecordId,
      reviewer_role: "health_information_manager_demo",
      review_step: "검수 완료",
      review_status: "staff_confirmed_after_source_comparison",
      confirmed_value_policy: "원문·AI 추출값·담당자 확정값 3단 비교 후 교육용 확정",
      issue_count: histologyFlags.length === 1 && tFlags.length <= 1 && nFlags.length <= 1 && mFlags.length <= 1 ? 0 : 1,
      source_type: GENERATED_DEMO,
    };

    pathologyOrders.push(order);
    specimens.push(specimen);
    grossDescriptions.push(gross);
    blocks.push(...blockRows);
    pathologyReports.push(report);
    immunohistochemistryResults.push(ihc);
    molecularPathologyResults.push(molecular);
    outsourcedTestResults.push(outsourced);
    transcriptionReviews.push(review);
    const previewCase = { partition, order, specimen, gross_description: gross, blocks: blockRows, pathology_report: report, immunohistochemistry_result: ihc, molecular_pathology_result: molecular, outsourced_test_result: outsourced, transcription_review: review };
    if (evaluationSourceRowIds.has(sourceRecordId)) evaluationPreviewCases.push(previewCase);
    else if (unlinkedPreviewCases.length < 13) unlinkedPreviewCases.push(previewCase);
  }

  sheetManifest.push({
    name: sheet.name,
    partition,
    dimension,
    data_rows: parsedRows.length - 1,
    columns: EXPECTED_HEADERS.map((sourceHeader, index) => ({ excel_column: excelColumn(index + 1), source_header: sourceHeader })),
  });
}

const webPreviewCases = [...evaluationPreviewCases, ...unlinkedPreviewCases].slice(0, 48);

const tableCounts = {
  pathology_orders: pathologyOrders.length,
  specimens: specimens.length,
  gross_descriptions: grossDescriptions.length,
  blocks: blocks.length,
  pathology_reports: pathologyReports.length,
  immunohistochemistry_results: immunohistochemistryResults.length,
  molecular_pathology_results: molecularPathologyResults.length,
  outsourced_test_results: outsourcedTestResults.length,
  transcription_reviews: transcriptionReviews.length,
};
const generatedAt = new Date().toISOString();
const manifest = {
  schema_version: 1,
  generated_at: generatedAt,
  dataset_scope: "prototype_only_no_real_patient_information",
  all_ids_are_virtual: true,
  source_type_values: {
    [PUBLIC_SYNTHETIC]: "국립암센터 공개 폐암 합성데이터 XLSX의 실제 컬럼에서 직접 매핑한 값입니다. 연결 ID와 검수 상태는 여전히 가상 값입니다.",
    [GENERATED_DEMO]: "원본 XLSX에 없는 병리 업무 흐름을 시제품에서 구동하기 위해 생성한 가상 값입니다.",
    public_aggregate: "공공데이터 API의 집계 응답에서 온 값입니다. 이 연결 테이블에는 환자별 값으로 사용하지 않습니다.",
    reference_metadata: "메타정보 또는 용어사전에서 온 항목 정의·참고 설명입니다. 이 연결 테이블에는 환자별 값으로 사용하지 않습니다.",
  },
  source: {
    provider: "국립암센터",
    title: "암 임상 라이브러리 합성데이터 (폐암)",
    archive_date: "2025-01-07",
    archive_sha256: await sha256(archivePath),
    workbook_entry: workbookEntry,
    workbook_sha256: await sha256(workbookPath),
  },
  workbook: { sheets: sheetManifest, column_count: EXPECTED_HEADERS.length },
  table_counts: tableCounts,
  foreign_keys: [
    "specimens.order_id -> pathology_orders.order_id",
    "gross_descriptions.order_id -> pathology_orders.order_id",
    "gross_descriptions.specimen_id -> specimens.specimen_id",
    "blocks.order_id -> pathology_orders.order_id",
    "blocks.specimen_id -> specimens.specimen_id",
    "pathology_reports.order_id -> pathology_orders.order_id",
    "pathology_reports.specimen_id -> specimens.specimen_id",
    "immunohistochemistry_results.(order_id,specimen_id,block_id,report_id) -> related tables",
    "molecular_pathology_results.(order_id,specimen_id,block_id,report_id) -> related tables",
    "outsourced_test_results.(order_id,specimen_id,block_id,report_id) -> related tables",
    "transcription_reviews.(order_id,specimen_id,gross_description_id,report_id,ihc_result_id,molecular_result_id,outsourced_id) -> related tables",
  ],
  limitations: [
    "원본 XLSX에는 order_id, specimen_id, block_id, report_id, 면역병리 결과, 위탁검사 결과가 없습니다.",
    "병기STAGE 플래그를 병리학적 병기로 재해석하거나 확정하지 않습니다.",
    "EGFR 컬럼은 발견 여부만 제공하며 변이명, 검사법, 검체, 보고서 원문은 제공하지 않습니다.",
    "가상 연결 데이터는 진단·판독·치료 판단 또는 실제 병원 시스템 연계에 사용할 수 없습니다.",
  ],
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeJson("manifest.json", manifest),
  writeJson("pathology_orders.json", pathologyOrders),
  writeJson("specimens.json", specimens),
  writeJson("gross_descriptions.json", grossDescriptions),
  writeJson("blocks.json", blocks),
  writeJson("pathology_reports.json", pathologyReports),
  writeJson("immunohistochemistry_results.json", immunohistochemistryResults),
  writeJson("molecular_pathology_results.json", molecularPathologyResults),
  writeJson("outsourced_test_results.json", outsourcedTestResults),
  writeJson("transcription_reviews.json", transcriptionReviews),
  writeJson("web_preview.json", { generated_at: generatedAt, all_ids_are_virtual: true, table_counts: tableCounts, cases: webPreviewCases }),
]);

console.log(`가상 병리 업무 데이터 ${pathologyOrders.length.toLocaleString("ko-KR")}건을 ${outputDirectory}에 생성했습니다.`);
