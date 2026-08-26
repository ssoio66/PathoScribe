import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourcePath = path.resolve(process.argv[2] ?? "data/raw/ncc-lung-registry-metadata-20200110.csv");
const outputPath = path.resolve(process.argv[3] ?? "data/processed/ncc-lung-registry-metadata.json");
const EXPECTED_HEADERS = ["NUM", "gpId", "gpNm", "tblId", "tblNm", "colId", "colNm", "dataType", "colDesc", "colCnt", "dispFormat"];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV 따옴표가 닫히지 않았습니다.");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some(Boolean));
}

const sourceBuffer = await readFile(sourcePath);
const decoded = new TextDecoder("euc-kr", { fatal: true }).decode(sourceBuffer);
const [headers, ...dataRows] = parseCsv(decoded);
if (JSON.stringify(headers) !== JSON.stringify(EXPECTED_HEADERS)) {
  throw new Error(`CSV 헤더가 예상과 다릅니다. 실제: ${JSON.stringify(headers)}`);
}

const records = dataRows.map((values, rowIndex) => {
  if (values.length !== EXPECTED_HEADERS.length) {
    throw new Error(`CSV ${rowIndex + 2}행의 컬럼 수가 ${values.length}개입니다.`);
  }
  const record = Object.fromEntries(EXPECTED_HEADERS.map((header, index) => [header, values[index]]));
  const sequence = Number(record.NUM);
  const reportedCount = Number(record.colCnt);
  if (!Number.isInteger(sequence) || !Number.isInteger(reportedCount) || reportedCount < 0) {
    throw new Error(`CSV ${rowIndex + 2}행의 NUM 또는 colCnt가 유효한 정수가 아닙니다.`);
  }
  return { ...record, NUM: sequence, colCnt: reportedCount };
});

const sequenceIds = new Set(records.map(({ NUM }) => NUM));
if (sequenceIds.size !== records.length) throw new Error("NUM 값이 중복되었습니다.");

const tableMap = new Map();
for (const record of records) {
  const existing = tableMap.get(record.tblId) ?? {
    groupId: record.gpId,
    groupName: record.gpNm,
    tableId: record.tblId,
    tableName: record.tblNm,
    fields: [],
  };
  if (existing.groupId !== record.gpId || existing.tableName !== record.tblNm) {
    throw new Error(`${record.tblId}의 그룹 또는 테이블명이 일관되지 않습니다.`);
  }
  if (existing.fields.some(({ columnId }) => columnId === record.colId)) {
    throw new Error(`${record.tblId}.${record.colId}가 중복되었습니다.`);
  }
  existing.fields.push({
    sequence: record.NUM,
    columnId: record.colId,
    columnName: record.colNm,
    dataType: record.dataType,
    description: record.colDesc,
    reportedCount: record.colCnt,
    displayFormat: record.dispFormat,
    sourceRecordId: `${record.tblId}.${record.colId}`,
  });
  tableMap.set(record.tblId, existing);
}

const tables = [...tableMap.values()];
const getField = (tableId, columnId) => {
  const table = tableMap.get(tableId);
  const field = table?.fields.find((candidate) => candidate.columnId === columnId);
  if (!table || !field) throw new Error(`필수 메타정보가 없습니다: ${tableId}.${columnId}`);
  return { table, field };
};

const pathologyMappings = [
  ["tumorSize", "종양 크기", "LUNG_PE_SPR", "TUMR_SIZE_VL"],
  ["diagnosis", "조직학적 진단명", "LUNG_PE_SPR", "CELL_TYPE_CMNT"],
  ["adenocarcinomaSubtype", "선암 아형", "LUNG_PE_SPR", "ADC_SUB_TYPE_CMNT"],
  ["grade", "분화도", "LUNG_PE_SPR", "CELL_DIFF_CMNT"],
  ["bronchialMargin", "기관지 절제연", "LUNG_PE_SPR", "BRON_MRGN_CMNT"],
  ["safetyMargin", "안전 절제연", "LUNG_PE_SPR", "SAFE_MRGN_VL"],
  ["dissectedNodes", "절제 림프절", "LUNG_PE_SPR", "LYMP_DSCT_CMNT"],
  ["metastaticNodeCount", "전이 림프절 수", "LUNG_PE_SPR", "MTST_LN_CNT"],
  ["pathologicStage", "병리학적 병기", "LUNG_PE_SPR", "PATH_STAG"],
  ["pathologicT", "병리 T 병기", "LUNG_PE_SPR", "PATH_T_STAG"],
  ["pathologicN", "병리 N 병기", "LUNG_PE_SPR", "PATH_N_STAG"],
  ["pathologicM", "병리 M 병기", "LUNG_PE_SPR", "PATH_M_STAG"],
  ["molecularTestName", "분자검사 종류", "LUNG_PE_MUTA", "MUTA_CLSF_NM"],
  ["molecularResult", "분자검사 결과", "LUNG_PE_MUTA", "MUTA_RSLT_CMNT"],
].map(([targetKey, label, tableId, columnId]) => {
  const { table, field } = getField(tableId, columnId);
  return { targetKey, label, tableId, tableName: table.tableName, ...field };
});

const referralMappings = [
  ["receivedDate", "LUNG_PE_BX_INIT", "BX_ACPT_YMD"],
  ["reportedDate", "LUNG_PE_BX_INIT", "BX_READ_YMD"],
  ["internalExternal", "LUNG_PE_BX_INIT", "BX_INHS_YN"],
  ["site", "LUNG_PE_BX_INIT", "BX_SITE_CMNT"],
  ["method", "LUNG_PE_BX_INIT", "BX_MTHD_CMNT"],
  ["result", "LUNG_PE_BX_INIT", "BX_RSLT_CMNT"],
].map(([targetKey, tableId, columnId]) => {
  const { table, field } = getField(tableId, columnId);
  return { targetKey, tableId, tableName: table.tableName, ...field };
});

const surgicalPathology = tableMap.get("LUNG_PE_SPR");
const surgicalPathologyDenominator = surgicalPathology?.fields.find(({ columnId }) => columnId === "PT_SBST_NO")?.reportedCount;
if (!surgicalPathology || !surgicalPathologyDenominator) throw new Error("외과병리 기준 건수를 찾을 수 없습니다.");
const dashboardFieldIds = ["TUMR_SIZE_VL", "CELL_TYPE_CMNT", "CELL_DIFF_CMNT", "BRON_MRGN_CMNT", "MTST_LN_CNT", "PATH_STAG"];
const dashboardFields = dashboardFieldIds.map((columnId) => {
  const field = surgicalPathology.fields.find((candidate) => candidate.columnId === columnId);
  if (!field) throw new Error(`대시보드 필드가 없습니다: ${columnId}`);
  const mappedField = pathologyMappings.find((mapping) => mapping.sourceRecordId === field.sourceRecordId);
  return {
    tableId: surgicalPathology.tableId,
    tableName: surgicalPathology.tableName,
    columnId: field.columnId,
    columnName: field.columnName,
    label: mappedField?.label ?? field.columnName,
    reportedCount: field.reportedCount,
    denominatorColumnId: "PT_SBST_NO",
    denominatorReportedCount: surgicalPathologyDenominator,
    reportedAvailabilityRate: field.reportedCount / surgicalPathologyDenominator,
  };
});

const coreTimelineTableIds = ["LUNG_PT_TRGT", "LUNG_RG_CNDX", "LUNG_PE_BX_INIT", "LUNG_PE_OPRT", "LUNG_PE_SPR", "LUNG_PE_MUTA", "LUNG_PE_CHMO", "LUNG_PE_RTX", "LUNG_PT_DEAD"];
const coreTimelineTables = coreTimelineTableIds.map((tableId) => {
  const table = tableMap.get(tableId);
  const patientKey = table?.fields.find(({ columnId }) => columnId === "PT_SBST_NO");
  if (!table || !patientKey) throw new Error(`핵심 테이블의 PT_SBST_NO가 없습니다: ${tableId}`);
  return { tableId, tableName: table.tableName, patientKey: patientKey.columnId, patientKeyReportedCount: patientKey.reportedCount };
});

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    provider: "국립암센터",
    collection: "폐암 레지스트리 메타정보",
    sourceFile: "국립암센터_폐암 레지스트리 메타정보_20200110.csv",
    localFile: path.basename(sourcePath),
    sourceDate: "2020-01-10",
    encoding: "CP949",
    acquisition: "사용자 제공 로컬 CSV",
    sourceSha256: createHash("sha256").update(sourceBuffer).digest("hex").toUpperCase(),
    redistribution: "원본 배포 조건 확인 전 GitHub 재배포 보류",
  },
  csvSchema: { headers: EXPECTED_HEADERS },
  statistics: {
    metadataRows: records.length,
    groups: new Set(records.map(({ gpId }) => gpId)).size,
    tables: tables.length,
    tablesWithPatientSubstituteKey: tables.filter(({ fields }) => fields.some(({ columnId }) => columnId === "PT_SBST_NO")).length,
  },
  tables,
  mappings: {
    pathologyReview: pathologyMappings,
    referralSupport: referralMappings,
    dashboard: dashboardFields,
    patientTimeline: {
      key: "PT_SBST_NO",
      scope: "핵심 테이블의 환자 단위 연관 후보",
      tables: coreTimelineTables,
      missingKeys: ["specimen_id", "material_id", "surgical_report_id", "molecular_order_id", "molecular_result_id"],
    },
  },
  interpretation: {
    supported: [
      "병리 결과 구조화 필드와 데이터 형식의 근거 참조",
      "레지스트리 데이터 항목 정의 RAG",
      "colCnt 기반 메타정보상 보고 건수와 제공 비율 표시",
      "향후 합성 레코드의 환자 단위 치료 타임라인 스키마 설계",
    ],
    unsupported: [
      "이 메타정보만을 이용한 환자별 치료 경로 또는 생존율 계산",
      "검체·블록·보고서·분자검사 결과 단위 연결",
      "진단·판독·병기 산출 또는 자동 확정",
    ],
    reportedCountCaution: "colCnt의 공식 산정 정의가 파일에 없으므로 결측률이 아니라 메타정보상 보고 건수·제공 비율로 표시합니다.",
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`레지스트리 메타정보 ${records.length}행, ${tables.length}개 테이블을 ${outputPath}에 저장했습니다.`);
