import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
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

const REQUIRED_SHEETS = {
  Adjusted_synlung_trainset: "train",
  Adjusted_synlung_test: "test",
};

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const openXmlRoot = args.get("--open-xml");
const archivePath = args.get("--archive");
const workbookPath = args.get("--workbook");
const workbookEntry = args.get("--workbook-entry");
const outputPath = args.get("--output");
if (!openXmlRoot || !archivePath || !workbookPath || !workbookEntry || !outputPath) {
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

const sharedXml = await readFile(path.join(openXmlRoot, "xl", "sharedStrings.xml"), "utf8");
const sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
  decodeXml([...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join("")),
);

const workbookXml = await readFile(path.join(openXmlRoot, "xl", "workbook.xml"), "utf8");
const relationshipsXml = await readFile(path.join(openXmlRoot, "xl", "_rels", "workbook.xml.rels"), "utf8");
const relationships = new Map(
  [...relationshipsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)]
    .map((match) => [match[1], match[2]]),
);
const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
  .map((match) => ({ name: decodeXml(match[1]), target: relationships.get(match[2]) }));

const missingSheets = Object.keys(REQUIRED_SHEETS).filter((required) => !sheets.some(({ name }) => name === required));
if (missingSheets.length) throw new Error(`필수 시트가 없습니다: ${missingSheets.join(", ")}`);

const histologyIndexes = [3, 4, 5];
const tIndexes = Array.from({ length: 11 }, (_, index) => index + 6);
const nIndexes = [17, 18, 19];
const mIndexes = [20, 21, 22];
const egfrIndex = 29;
const operationIndex = 30;

const totals = {
  records: 0,
  blankCells: 0,
  histologyCounts: [0, 0, 0],
  histologyNone: 0,
  histologyOne: 0,
  histologyMultiple: 0,
  tNone: 0,
  tMultiple: 0,
  nNone: 0,
  nMultiple: 0,
  mNone: 0,
  mMultiple: 0,
  egfrKnown: 0,
  egfrUnknown99: 0,
  operationPositive: 0,
  knownEgfrWithHistology: 0,
  knownEgfrWithOperation: 0,
  knownEgfrWithOperationAndHistology: 0,
};

const sheetSummaries = [];
for (const sheet of sheets.filter(({ name }) => name in REQUIRED_SHEETS)) {
  if (!sheet.target) throw new Error(`${sheet.name}의 워크시트 관계를 찾을 수 없습니다.`);
  const sheetPath = path.join(openXmlRoot, "xl", sheet.target.replace(/^\/?xl\//, ""));
  const sheetXml = await readFile(sheetPath, "utf8");
  const dimension = sheetXml.match(/<dimension\b[^>]*ref="([^"]+)"/)?.[1] ?? null;
  const rows = [...sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
  if (!rows.length) throw new Error(`${sheet.name} 시트가 비어 있습니다.`);

  const parsedRows = rows.map((row) => {
    const values = new Map();
    for (const cell of row[2].matchAll(/<c\b[^>]*r="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g)) {
      const valueMatch = cell[0].match(/<v>([\s\S]*?)<\/v>/);
      if (!valueMatch) continue;
      const rawValue = valueMatch[1];
      values.set(columnNumber(cell[1]), /\bt="s"/.test(cell[0]) ? sharedStrings[Number(rawValue)] : rawValue);
    }
    return values;
  });

  const headers = EXPECTED_HEADERS.map((_, index) => parsedRows[0].get(index + 1) ?? null);
  const headerMismatches = EXPECTED_HEADERS.flatMap((expected, index) => headers[index] === expected ? [] : [{
    column: excelColumn(index + 1),
    expected,
    actual: headers[index],
  }]);
  if (headerMismatches.length) {
    throw new Error(`${sheet.name} 헤더가 예상과 다릅니다: ${JSON.stringify(headerMismatches)}`);
  }

  const ids = new Set();
  let minSequence = Number.POSITIVE_INFINITY;
  let maxSequence = Number.NEGATIVE_INFINITY;
  for (const values of parsedRows.slice(1)) {
    totals.records += 1;
    totals.blankCells += EXPECTED_HEADERS.reduce((count, _, index) => count + (values.has(index + 1) ? 0 : 1), 0);

    const sequence = Number(values.get(1));
    if (!Number.isInteger(sequence) || ids.has(sequence)) throw new Error(`${sheet.name}의 순번(No)이 유일한 정수가 아닙니다: ${values.get(1)}`);
    ids.add(sequence);
    minSequence = Math.min(minSequence, sequence);
    maxSequence = Math.max(maxSequence, sequence);

    const numericValue = (index) => Number(values.get(index));
    const flagCount = (indexes) => indexes.reduce((count, index) => count + (numericValue(index) === 1 ? 1 : 0), 0);
    for (const [offset, index] of histologyIndexes.entries()) totals.histologyCounts[offset] += numericValue(index) === 1 ? 1 : 0;
    const histologyCount = flagCount(histologyIndexes);
    const tCount = flagCount(tIndexes);
    const nCount = flagCount(nIndexes);
    const mCount = flagCount(mIndexes);
    if (histologyCount === 0) totals.histologyNone += 1;
    else if (histologyCount === 1) totals.histologyOne += 1;
    else totals.histologyMultiple += 1;
    if (tCount === 0) totals.tNone += 1;
    if (tCount > 1) totals.tMultiple += 1;
    if (nCount === 0) totals.nNone += 1;
    if (nCount > 1) totals.nMultiple += 1;
    if (mCount === 0) totals.mNone += 1;
    if (mCount > 1) totals.mMultiple += 1;

    const egfr = numericValue(egfrIndex);
    const operation = numericValue(operationIndex);
    if (![0, 1, 99].includes(egfr)) throw new Error(`${sheet.name}의 EGFR 값이 0/1/99가 아닙니다: ${egfr}`);
    if (![0, 1].includes(operation)) throw new Error(`${sheet.name}의 수술여부 값이 0/1이 아닙니다: ${operation}`);
    const egfrKnown = egfr === 0 || egfr === 1;
    if (egfrKnown) totals.egfrKnown += 1;
    else totals.egfrUnknown99 += 1;
    if (operation === 1) totals.operationPositive += 1;
    if (egfrKnown && histologyCount > 0) totals.knownEgfrWithHistology += 1;
    if (egfrKnown && operation === 1) totals.knownEgfrWithOperation += 1;
    if (egfrKnown && operation === 1 && histologyCount > 0) totals.knownEgfrWithOperationAndHistology += 1;
  }

  sheetSummaries.push({
    name: sheet.name,
    partition: REQUIRED_SHEETS[sheet.name],
    dimension,
    dataRows: parsedRows.length - 1,
    sequence: { sourceHeader: EXPECTED_HEADERS[0], uniqueWithinSheet: true, min: minSequence, max: maxSequence },
  });
}

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: {
    provider: "국립암센터",
    title: "암 임상 라이브러리 합성데이터 (폐암)",
    archiveDate: "2025-01-07",
    archiveSha256: await sha256(archivePath),
    workbookEntry,
    workbookSha256: await sha256(workbookPath),
  },
  workbook: {
    sheets: sheetSummaries,
    columnCount: EXPECTED_HEADERS.length,
    columns: EXPECTED_HEADERS.map((sourceHeader, index) => ({ excelColumn: excelColumn(index + 1), sourceHeader })),
  },
  mapping: {
    sourceRecordId: {
      expression: "ncc-lung:{partition}:{순번(No)}",
      sourceHeaders: [EXPECTED_HEADERS[0]],
      scope: "합성데이터 원본 행 식별용이며 환자·검체·보고서 식별자가 아님",
    },
    pathologyProxy: {
      sourceHeaders: [...EXPECTED_HEADERS.slice(2, 22), EXPECTED_HEADERS[29]],
      scope: "조직형·TNM 플래그와 수술여부의 동일 행 관찰",
    },
    molecularObservation: {
      sourceHeaders: [EXPECTED_HEADERS[28]],
      scope: "EGFR 발견 여부 0/1만 유효 관찰, 99는 해당사항 없음",
    },
    unavailableSourceKeys: [
      "case_id",
      "specimen_id",
      "material_id",
      "surgical_report_id",
      "molecular_order_id",
      "molecular_result_id",
    ],
  },
  statistics: {
    totalRecords: totals.records,
    blankCells: totals.blankCells,
    histology: {
      adenocarcinoma: totals.histologyCounts[0],
      largeCellCarcinoma: totals.histologyCounts[1],
      squamousCellCarcinoma: totals.histologyCounts[2],
      noFlag: totals.histologyNone,
      exactlyOneFlag: totals.histologyOne,
      multipleFlags: totals.histologyMultiple,
    },
    stageFlags: {
      tNoFlag: totals.tNone,
      tMultipleFlags: totals.tMultiple,
      nNoFlag: totals.nNone,
      nMultipleFlags: totals.nMultiple,
      mNoFlag: totals.mNone,
      mMultipleFlags: totals.mMultiple,
    },
    egfr: { known: totals.egfrKnown, notApplicable99: totals.egfrUnknown99 },
    operationPositive: totals.operationPositive,
    sameRowAssociations: {
      egfrKnown: totals.egfrKnown,
      egfrKnownWithHistologyFlag: totals.knownEgfrWithHistology,
      egfrKnownWithOperationPositive: totals.knownEgfrWithOperation,
      egfrKnownWithOperationAndHistologyFlag: totals.knownEgfrWithOperationAndHistology,
      clinicallyConfirmedLinks: 0,
    },
  },
  linkageAssessment: {
    status: "analytical_same_row_only",
    canSupport: ["합성데이터 동일 행에서 조직형/TNM/수술여부와 EGFR 유효값의 동시 존재 집계"],
    cannotSupport: [
      "검체 또는 블록 단위 외과병리·분자병리 연결",
      "외과병리 보고서와 분자검사 결과의 참조 무결성 검증",
      "환자 단위 임상 연계 또는 진단·판독·병기 확정",
    ],
  },
};

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`폐암 합성데이터 ${totals.records.toLocaleString("ko-KR")}행을 검증해 ${outputPath}에 저장했습니다.`);
