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
  ["Adjusted_synlung_trainset", "TRN"],
  ["Adjusted_synlung_test", "TST"],
]);

const HISTOLOGY_COLUMNS = [
  [3, "Adenocarcinoma", "선암"],
  [4, "Large cell carcinoma", "대세포암"],
  [5, "Squamous cell carcinoma", "편평세포암"],
];
const T_COLUMNS = [[6, "TX"], [7, "T0"], [8, "T1"], [9, "T1a"], [10, "T1b"], [11, "T1c"], [12, "T2"], [13, "T2a"], [14, "T2b"], [15, "T3"], [16, "T4"]];
const N_COLUMNS = [[17, "N1"], [18, "N2"], [19, "N3"]];
const M_COLUMNS = [[20, "M1a"], [21, "M1b"], [22, "M1c"]];
const TRACEABLE_COLUMN_INDEXES = [...Array.from({ length: 20 }, (_, index) => index + 3), 29, 30];

const SELECTED_SOURCE_IDS = {
  gross: ["00000", "00001", "00013", "00015", "00028", "00032", "00036", "00037", "00042", "00049"],
  pathology: ["00050", "00053", "00057", "00067", "00070", "00071", "00079", "00081", "00082", "00085", "00089", "00090", "00096", "00110", "00111"],
  outsourced: ["00114", "00116", "00121", "00138", "00146", "00148", "00149", "00151", "00156", "00162"],
};

const COMMON_DISCLAIMER = "교육용 가상 평가사례입니다. 실제 환자정보·실제 병리보고서가 아니며 진단·판독·병기 산출 또는 공식 의료기록에 사용할 수 없습니다. 모든 결과는 담당자의 원문 대조가 필요합니다.";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const openXmlRoot = args.get("--open-xml");
const archivePath = args.get("--archive");
const workbookPath = args.get("--workbook");
const workbookEntry = args.get("--workbook-entry");
const outputPath = args.get("--output");
if (!openXmlRoot || !archivePath || !workbookPath || !workbookEntry || !outputPath) throw new Error("필수 인자가 누락되었습니다.");

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
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(((value - 1) % 26) + 65) + result;
  return result;
};
const padded = (value) => String(value).padStart(5, "0");
const activeLabel = (values, columns) => columns.find(([index]) => Number(values.get(index)) === 1)?.[1] ?? null;

let sharedStrings = [];
try {
  const sharedXml = await readFile(path.join(openXmlRoot, "xl", "sharedStrings.xml"), "utf8");
  sharedStrings = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((text) => text[1]).join("")),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const workbookXml = await readFile(path.join(openXmlRoot, "xl", "workbook.xml"), "utf8");
const relationshipsXml = await readFile(path.join(openXmlRoot, "xl", "_rels", "workbook.xml.rels"), "utf8");
const relationships = new Map([...relationshipsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)].map((match) => [match[1], match[2]]));
const sheets = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)]
  .map((match) => ({ name: decodeXml(match[1]), target: relationships.get(match[2]) }));

const sourceRows = new Map();
const sheetSummary = [];
for (const sheet of sheets.filter(({ name }) => REQUIRED_SHEETS.has(name))) {
  const sheetPath = path.join(openXmlRoot, "xl", sheet.target.replace(/^\/?xl\//, ""));
  const sheetXml = await readFile(sheetPath, "utf8");
  const dimension = sheetXml.match(/<dimension\b[^>]*ref="([^"]+)"/)?.[1] ?? null;
  const rowMatches = [...sheetXml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
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
    return { excelRow: Number(row[1]), values };
  });
  const actualHeaders = EXPECTED_HEADERS.map((_, index) => parsedRows[0].values.get(index + 1) ?? null);
  const mismatches = EXPECTED_HEADERS.flatMap((expected, index) => actualHeaders[index] === expected ? [] : [{ column: excelColumn(index + 1), expected, actual: actualHeaders[index] }]);
  if (mismatches.length) throw new Error(`${sheet.name} 헤더 불일치: ${JSON.stringify(mismatches)}`);

  const prefix = REQUIRED_SHEETS.get(sheet.name);
  for (const row of parsedRows.slice(1)) {
    const sequence = Number(row.values.get(1));
    const sourceRowId = `NCC-LUNG-${prefix}-${padded(sequence)}`;
    sourceRows.set(sourceRowId, { sourceRowId, sheetName: sheet.name, partition: prefix === "TRN" ? "train" : "test", excelRow: row.excelRow, sequence, values: row.values });
  }
  sheetSummary.push({ name: sheet.name, dimension, dataRows: parsedRows.length - 1, columnCount: EXPECTED_HEADERS.length });
}

const sourceFieldsFor = (row) => TRACEABLE_COLUMN_INDEXES.map((index) => ({
  key: index >= 3 && index <= 5 ? "histologyFlag" : index >= 6 && index <= 16 ? "stageTFlag" : index >= 17 && index <= 19 ? "stageNFlag" : index >= 20 && index <= 22 ? "stageMFlag" : index === 29 ? "egfrDetection" : "operation",
  sourceHeader: EXPECTED_HEADERS[index - 1],
  excelCell: `${excelColumn(index)}${row.excelRow}`,
  rawValue: row.values.has(index) ? Number(row.values.get(index)) : null,
  sourceType: "public_synthetic",
}));

const generatedField = (key, value, rationale) => ({ key, value, sourceType: "generated_demo", rationale });
const truthField = (key, label, value, sourceType, options = {}) => ({
  key,
  label,
  value,
  evidenceText: options.evidenceText ?? null,
  status: value === null ? "missing" : options.status ?? "extracted",
  sourceType,
  sourceHeader: options.sourceHeader ?? null,
  derivation: options.derivation ?? (sourceType === "public_synthetic" ? "direct_or_declared_transform" : "project_authored"),
});
const warning = (code, fieldKeys, description) => ({ code, fieldKeys, description });
const error = (code, fieldKeys, description) => ({ code, fieldKeys, description });

function rowFacts(row) {
  const histology = HISTOLOGY_COLUMNS.find(([index]) => Number(row.values.get(index)) === 1);
  const t = activeLabel(row.values, T_COLUMNS);
  const n = activeLabel(row.values, N_COLUMNS);
  const m = activeLabel(row.values, M_COLUMNS);
  const egfr = Number(row.values.get(29));
  const operation = Number(row.values.get(30));
  if (!histology || !t || ![0, 1].includes(egfr) || ![0, 1].includes(operation)) throw new Error(`${row.sourceRowId}: 평가에 필요한 단일 조직학/T 플래그, EGFR, 수술여부가 없습니다.`);
  return {
    diagnosisEnglish: histology[1],
    diagnosisKorean: histology[2],
    diagnosisHeader: EXPECTED_HEADERS[histology[0] - 1],
    pT: `p${t}`,
    pTHeader: EXPECTED_HEADERS[T_COLUMNS.find(([, label]) => label === t)[0] - 1],
    pN: n ? `p${n}` : null,
    pNHeader: n ? EXPECTED_HEADERS[N_COLUMNS.find(([, label]) => label === n)[0] - 1] : null,
    pM: m ? `p${m}` : null,
    pMHeader: m ? EXPECTED_HEADERS[M_COLUMNS.find(([, label]) => label === m)[0] - 1] : null,
    egfr,
    operation,
  };
}

const sourceContextFor = (facts) => [
  truthField("sourceHistology", "원본 조직학 플래그", facts.diagnosisKorean, "public_synthetic", { sourceHeader: facts.diagnosisHeader, derivation: "값이 1인 조직학 플래그를 한글 표시값으로 변환" }),
  truthField("sourceStageT", "원본 T 플래그", facts.pT, "public_synthetic", { sourceHeader: facts.pTHeader, derivation: "값이 1인 T 플래그에 p 접두사를 붙여 추적용 문자열로 변환" }),
  truthField("sourceStageN", "원본 N 플래그", facts.pN, "public_synthetic", { sourceHeader: facts.pNHeader, derivation: facts.pN ? "값이 1인 N 플래그에 p 접두사를 붙여 추적용 문자열로 변환" : "활성 N 플래그 없음" }),
  truthField("sourceStageM", "원본 M 플래그", facts.pM, "public_synthetic", { sourceHeader: facts.pMHeader, derivation: facts.pM ? "값이 1인 M 플래그에 p 접두사를 붙여 추적용 문자열로 변환" : "활성 M 플래그 없음" }),
  truthField("sourceEgfrDetection", "원본 EGFR 발견 여부", facts.egfr, "public_synthetic", { sourceHeader: EXPECTED_HEADERS[28], derivation: "원본 0/1 값을 그대로 보존" }),
  truthField("sourceOperation", "원본 수술 여부", facts.operation, "public_synthetic", { sourceHeader: EXPECTED_HEADERS[29], derivation: "원본 0/1 값을 그대로 보존" }),
];

function baseCase(row, caseId, caseType, scenario, templateVersion) {
  return {
    caseId,
    caseType,
    scenario,
    sourceType: "generated_demo",
    sourceRowId: row.sourceRowId,
    sourceLocation: {
      workbookEntry,
      sheetName: row.sheetName,
      partition: row.partition,
      excelRow: row.excelRow,
      sourceSequence: row.sequence,
    },
    sourceFields: sourceFieldsFor(row),
    generatedFields: [],
    templateVersion,
    inputText: "",
    groundTruth: { sourceContext: [], referenceFields: [], expectedExtraction: [] },
    injectedErrors: [],
    expectedWarnings: [],
    expectedReview: { required: false, reason: null },
    disclaimer: COMMON_DISCLAIMER,
  };
}

function buildGross(row, index) {
  const facts = rowFacts(row);
  const scenario = index < 4 ? "normal" : "error";
  const item = baseCase(row, `EVAL-GROSS-${String(index + 1).padStart(3, "0")}`, "gross", scenario, "gross-eval-v1.1.1");
  const laterality = index % 2 === 0 ? "우측" : "좌측";
  const site = index % 3 === 0 ? "상엽" : index % 3 === 1 ? "하엽" : "중엽";
  const specimen = facts.operation === 1 ? "폐 절제 검체" : "폐 생검 검체";
  const size = `${(3.2 + index * 0.3).toFixed(1)} x ${(2.1 + index * 0.2).toFixed(1)} x ${(1.0 + index * 0.1).toFixed(1)} cm`;
  const count = "1개";
  const cutSurface = "회백색이며 단단하다";
  const lesionLocation = `${site} 말초`;
  const blockCount = `${2 + (index % 3)}개`;
  const generated = { organ: "폐", specimen, site, laterality, size, count, cutSurface, lesionLocation, blockCount };
  item.groundTruth.sourceContext = sourceContextFor(facts);
  item.generatedFields = Object.entries(generated).map(([key, value]) => generatedField(key, value, "원본 XLSX에 해당 자유서술 값이 없어 평가 문장화를 위해 생성"));
  item.groundTruth.referenceFields = [
    truthField("organ", "장기", "폐", "generated_demo"),
    truthField("specimen", "검체", specimen, "generated_demo"),
    truthField("site", "부위", site, "generated_demo"),
    truthField("laterality", "좌우", laterality, "generated_demo"),
    truthField("size", "크기", size, "generated_demo"),
    truthField("count", "개수", count, "generated_demo"),
    truthField("cutSurface", "절단면", cutSurface, "generated_demo"),
    truthField("lesionLocation", "병변 위치", lesionLocation, "generated_demo"),
    truthField("blockCount", "블록 수", blockCount, "generated_demo"),
  ];

  let actual = { ...generated };
  let includeCutSurface = true;
  let includeLesion = true;
  if (index === 4) {
    actual.size = size.replace(/ cm$/, "");
    item.injectedErrors.push(error("MISSING_UNIT", ["size"], "크기에서 cm 단위를 제거"));
    item.expectedWarnings.push(warning("MISSING_UNIT", ["size"], "숫자 크기 표현의 단위 확인 필요"));
  } else if (index === 5) {
    actual.lesionLocation = `${laterality === "우측" ? "좌측" : "우측"} ${site} 말초`;
    item.injectedErrors.push(error("LATERALITY_CONFLICT", ["laterality", "lesionLocation"], "검체와 병변 위치의 좌우 표현을 다르게 작성"));
    item.expectedWarnings.push(warning("LATERALITY_CONFLICT", ["laterality", "lesionLocation"], "좌우 표현 불일치 확인 필요"));
  } else if (index === 6) {
    actual.count = "2개";
    item.injectedErrors.push(error("SPECIMEN_COUNT_MISMATCH", ["count"], "기준 검체 수 1개를 2개로 변경"));
    item.expectedWarnings.push(warning("SPECIMEN_COUNT_MISMATCH", ["count"], "기준값과 검체 수 불일치"));
  } else if (index === 7) {
    includeCutSurface = false;
    item.injectedErrors.push(error("MISSING_FIELD", ["cutSurface"], "절단면 문구를 누락"));
    item.expectedWarnings.push(warning("MISSING_FIELD", ["cutSurface"], "절단면 확인 필요"));
  } else if (index === 8) {
    includeLesion = false;
    item.injectedErrors.push(error("MISSING_FIELD", ["lesionLocation"], "병변 위치 문구를 누락"));
    item.expectedWarnings.push(warning("MISSING_FIELD", ["lesionLocation"], "병변 위치 확인 필요"));
  } else if (index === 9) {
    actual.blockCount = null;
    item.injectedErrors.push(error("BLOCK_COUNT_MISSING", ["blockCount"], "블록 수 문구를 누락"));
    item.expectedWarnings.push(warning("BLOCK_COUNT_MISSING", ["blockCount"], "블록 수 확인 필요"));
  }

  const segments = [
    `${actual.laterality} 폐 ${actual.site} ${actual.specimen} ${actual.count}가 포르말린에 고정되어 접수되었다.`,
    `검체 크기는 ${actual.size}이다.`,
    includeCutSurface ? `절단면은 ${actual.cutSurface}.` : null,
    includeLesion ? `병변은 ${actual.lesionLocation}에 위치한다.` : null,
    actual.blockCount ? `대표 블록 ${actual.blockCount}를 제작하였다.` : null,
  ].filter(Boolean);
  item.inputText = segments.join(" ");
  const evidence = {
    organ: "폐",
    specimen: specimen,
    site,
    laterality,
    size: actual.size,
    count: actual.count,
    cutSurface: includeCutSurface ? actual.cutSurface : null,
    lesionLocation: includeLesion ? actual.lesionLocation : null,
    blockCount: actual.blockCount,
  };
  const reviewKeys = new Set(item.expectedWarnings.flatMap(({ fieldKeys }) => fieldKeys));
  item.groundTruth.expectedExtraction = item.groundTruth.referenceFields.map((field) => truthField(
    field.key,
    field.label,
    evidence[field.key],
    "generated_demo",
    { evidenceText: evidence[field.key], status: evidence[field.key] === null ? "missing" : reviewKeys.has(field.key) ? "needs_review" : "extracted" },
  ));
  return item;
}

function buildPathology(row, index) {
  const facts = rowFacts(row);
  const scenario = index < 5 ? "normal" : "error";
  const item = baseCase(row, `EVAL-PATH-${String(index + 1).padStart(3, "0")}`, "pathology", scenario, "pathology-eval-v1.1.3");
  const laterality = index % 2 === 0 ? "우측" : "좌측";
  const site = index % 3 === 0 ? "상엽" : index % 3 === 1 ? "하엽" : "중엽";
  const procedure = facts.operation === 1 ? "절제술" : "생검";
  const specimen = `폐 ${procedure}`;
  const histologicType = facts.diagnosisEnglish === "Adenocarcinoma" ? "acinar predominant type" : facts.diagnosisEnglish === "Squamous cell carcinoma" ? "keratinizing type" : "large cell type";
  const tumorSize = `${(1.4 + index * 0.2).toFixed(1)} cm`;
  const grade = index % 2 === 0 ? "중등도 분화" : "저분화";
  const margin = "절제연은 종양 음성이다";
  const lymphNodes = `${index % 3}개/${8 + index}개`;
  const immunopathology = index % 2 === 0 ? "TTF-1: 양성" : "TTF-1: 음성";
  const molecularPathology = facts.egfr === 1 ? "EGFR mutation: detected" : "EGFR mutation: not detected";
  item.generatedFields = [
    generatedField("organ", "폐", "원본 XLSX에 자유서술 장기값이 없어 문장화를 위해 생성"),
    generatedField("specimen", specimen, "수술여부 원시값을 직접 검수값으로 쓰지 않고 가상 검체 표현을 생성"),
    generatedField("site", site, "원본 XLSX에 종양 위치가 없어 생성"),
    generatedField("laterality", laterality, "원본 XLSX에 좌우 정보가 없어 생성"),
    generatedField("procedure", procedure, "수술여부 원시값을 직접 시술명으로 쓰지 않고 가상 입력 표현을 생성"),
    generatedField("histologicType", histologicType, "원본 조직학 플래그보다 세부적인 유형은 원본에 없어 생성"),
    generatedField("tumorSize", tumorSize, "원본 XLSX에 종양 크기가 없어 생성"),
    generatedField("grade", grade, "원본 XLSX에 분화도가 없어 생성"),
    generatedField("margin", margin, "원본 XLSX에 절제연이 없어 생성"),
    generatedField("lymphNodes", lymphNodes, "원본 XLSX에 림프절 개수가 없어 생성"),
    generatedField("immunopathology", immunopathology, "원본 XLSX에 면역병리 결과가 없어 생성"),
  ];
  item.groundTruth.sourceContext = sourceContextFor(facts);
  const reference = [
    truthField("laterality", "좌우", laterality, "generated_demo"),
    truthField("site", "부위", site, "generated_demo"),
    truthField("procedure", "시술 또는 수술 종류", procedure, "generated_demo"),
    truthField("organ", "장기", "폐", "generated_demo"),
    truthField("specimen", "검체", specimen, "generated_demo"),
    truthField("diagnosis", "조직학적 진단명", facts.diagnosisKorean, "public_synthetic", { sourceHeader: facts.diagnosisHeader, derivation: "값이 1인 조직학 플래그를 한글 표시값으로 변환" }),
    truthField("histologicType", "조직학적 유형", histologicType, "generated_demo"),
    truthField("tumorSize", "종양 크기", tumorSize, "generated_demo"),
    truthField("grade", "분화도", grade, "generated_demo"),
    truthField("margin", "절제연", margin, "generated_demo"),
    truthField("lymphNodes", "림프절", lymphNodes, "generated_demo"),
    truthField("pathologicT", "pT", facts.pT, "public_synthetic", { sourceHeader: facts.pTHeader, derivation: "값이 1인 T 플래그에 p 접두사를 붙여 입력 문자열로 변환" }),
    truthField("pathologicN", "pN", facts.pN, "public_synthetic", { sourceHeader: facts.pNHeader, derivation: facts.pN ? "값이 1인 N 플래그에 p 접두사를 붙여 입력 문자열로 변환" : "활성 N 플래그 없음" }),
    truthField("pathologicM", "pM", facts.pM, "public_synthetic", { sourceHeader: facts.pMHeader, derivation: facts.pM ? "값이 1인 M 플래그에 p 접두사를 붙여 입력 문자열로 변환" : "활성 M 플래그 없음" }),
    truthField("pathologicStage", "Stage", null, "generated_demo", { derivation: "원본에 병기군 정답이 없어 생성·계산하지 않음" }),
    truthField("immunopathology", "면역병리 결과", immunopathology, "generated_demo"),
    truthField("molecularPathology", "분자병리 결과", molecularPathology, "public_synthetic", { sourceHeader: EXPECTED_HEADERS[28], derivation: "EGFR 1을 detected, 0을 not detected로 변환" }),
  ];
  item.groundTruth.referenceFields = reference;

  let actual = {
    laterality,
    diagnosis: facts.diagnosisKorean,
    tumorSize,
    margin,
    lymphNodes,
    pT: facts.pT,
    pN: facts.pN,
    pM: facts.pM,
    immunopathology,
    molecularPathology,
  };
  let includeMargin = true;
  if (index === 5) {
    actual.diagnosis = facts.diagnosisKorean === "선암" ? "편평세포암" : "선암";
    item.injectedErrors.push(error("SOURCE_VALUE_MISMATCH", ["diagnosis"], "원본 조직학 플래그와 다른 진단 문자열 주입"));
    item.expectedWarnings.push(warning("SOURCE_VALUE_MISMATCH", ["diagnosis"], "원본 합성행의 조직학 플래그와 입력값 불일치"));
  } else if (index === 6) {
    actual.tumorSize = tumorSize.replace(/ cm$/, "");
    item.injectedErrors.push(error("MISSING_UNIT", ["tumorSize"], "종양 크기에서 cm 단위를 제거"));
    item.expectedWarnings.push(warning("MISSING_UNIT", ["tumorSize"], "종양 크기 단위 확인 필요"));
  } else if (index === 7) {
    actual.laterality = `${laterality} 및 ${laterality === "우측" ? "좌측" : "우측"}`;
    item.injectedErrors.push(error("LATERALITY_CONFLICT", ["laterality"], "좌우 표현을 함께 주입"));
    item.expectedWarnings.push(warning("LATERALITY_CONFLICT", ["laterality"], "좌우 부위 불일치 확인 필요"));
  } else if (index === 8) {
    includeMargin = false;
    item.injectedErrors.push(error("MARGIN_MISSING", ["margin"], "절제연 문구를 누락"));
    item.expectedWarnings.push(warning("MARGIN_MISSING", ["margin"], "절제연 확인 필요"));
  } else if (index === 9) {
    actual.lymphNodes = `14개/12개`;
    item.injectedErrors.push(error("LYMPH_NODE_FRACTION_INCONSISTENCY", ["lymphNodes"], "양성 림프절 수가 검사 림프절 수보다 크게 작성"));
    item.expectedWarnings.push(warning("LYMPH_NODE_FRACTION_INCONSISTENCY", ["lymphNodes"], "림프절 수치 관계 확인 필요"));
  } else if (index === 10) {
    actual.pT = facts.pT === "pT4" ? "pT1a" : "pT4";
    item.injectedErrors.push(error("PATHOLOGIC_T_MISMATCH", ["pathologicT"], "원본 T 플래그와 다른 pT 문자열 주입"));
    item.expectedWarnings.push(warning("PATHOLOGIC_T_MISMATCH", ["pathologicT"], "원본 합성행의 T 플래그와 입력값 불일치"));
  } else if (index === 11) {
    if (!facts.pN) throw new Error(`${row.sourceRowId}: pN 불일치 오류 사례에 활성 N 플래그가 필요합니다.`);
    actual.pN = facts.pN === "pN3" ? "pN1" : "pN3";
    item.injectedErrors.push(error("PATHOLOGIC_N_MISMATCH", ["pathologicN"], "원본 N 플래그와 다른 pN 문자열 주입"));
    item.expectedWarnings.push(warning("PATHOLOGIC_N_MISMATCH", ["pathologicN"], "원본 합성행의 N 플래그와 입력값 불일치"));
  } else if (index === 12) {
    if (facts.pM) throw new Error(`${row.sourceRowId}: pM 추가 오류 사례는 활성 M 플래그가 없어야 합니다.`);
    actual.pM = "pM1a";
    item.injectedErrors.push(error("VALUE_NOT_IN_SOURCE", ["pathologicM"], "원본에 활성 M 플래그가 없는데 pM1a를 추가"));
    item.expectedWarnings.push(warning("VALUE_NOT_IN_SOURCE", ["pathologicM"], "원본 근거 없는 병기 문자열 확인 필요"));
  } else if (index === 13) {
    actual.molecularPathology = facts.egfr === 1 ? "EGFR mutation: not detected" : "EGFR mutation: detected";
    item.injectedErrors.push(error("SOURCE_VALUE_MISMATCH", ["molecularPathology"], "원본 EGFR 값과 반대 결과를 주입"));
    item.expectedWarnings.push(warning("SOURCE_VALUE_MISMATCH", ["molecularPathology"], "원본 합성행의 EGFR 값과 입력 결과 불일치"));
  } else if (index === 14) {
    actual.immunopathology = "TTF-1 검사 시행";
    item.injectedErrors.push(error("IMMUNOPATHOLOGY_RESULT_MISSING", ["immunopathology"], "검사명만 남기고 판정값을 누락"));
    item.expectedWarnings.push(warning("IMMUNOPATHOLOGY_RESULT_MISSING", ["immunopathology"], "면역병리 검사 결과 형식 확인 필요"));
  }

  const stageTokens = [actual.pT, actual.pN, actual.pM].filter(Boolean).join(" ");
  item.inputText = [
    `${actual.laterality} 폐 ${site} ${specimen}: ${actual.diagnosis}, ${histologicType}, ${grade}.`,
    `종양 크기: ${actual.tumorSize}.`,
    includeMargin ? `${actual.margin}.` : null,
    `림프절 ${actual.lymphNodes}.`,
    stageTokens ? `병리학적 병기 ${stageTokens}.` : null,
    `${actual.immunopathology}.`,
    `${actual.molecularPathology}.`,
  ].filter(Boolean).join(" ");
  const extractionValues = {
    laterality: actual.laterality,
    site,
    procedure,
    organ: "폐",
    specimen,
    diagnosis: actual.diagnosis,
    histologicType,
    tumorSize: actual.tumorSize,
    grade,
    margin: includeMargin ? actual.margin : null,
    lymphNodes: actual.lymphNodes,
    pathologicT: actual.pT,
    pathologicN: actual.pN,
    pathologicM: actual.pM,
    pathologicStage: null,
    immunopathology: actual.immunopathology,
    molecularPathology: actual.molecularPathology,
  };
  const reviewKeys = new Set(item.expectedWarnings.flatMap(({ fieldKeys }) => fieldKeys));
  item.groundTruth.expectedExtraction = reference.map((field) => {
    const value = extractionValues[field.key];
    const unchangedSourceValue = field.sourceType === "public_synthetic" && value === field.value;
    return truthField(field.key, field.label, value, unchangedSourceValue ? "public_synthetic" : "generated_demo", {
      evidenceText: value,
      status: value === null ? "missing" : reviewKeys.has(field.key) ? "needs_review" : "extracted",
      sourceHeader: unchangedSourceValue ? field.sourceHeader : null,
      derivation: unchangedSourceValue ? field.derivation : "가상 입력문에 실제로 나타난 평가 대상 문자열",
    });
  });
  return item;
}

function buildOutsourced(row, index) {
  const facts = rowFacts(row);
  const scenario = index < 3 ? "normal" : "error";
  const item = baseCase(row, `EVAL-OUT-${String(index + 1).padStart(3, "0")}`, "outsourced", scenario, "outsourced-eval-v1.1.0");
  const suffix = String(index + 1).padStart(3, "0");
  const generated = {
    order_number: `EXT-EVAL-2026-${suffix}`,
    institution: `가상검사기관 ${index % 2 === 0 ? "A" : "B"}`,
    test_name: "EGFR mutation analysis",
    specimen: `FFPE tissue, block ${String.fromCharCode(65 + index)}1`,
    received_date: `2026-05-${String(2 + index).padStart(2, "0")}`,
    reported_date: `2026-05-${String(5 + index).padStart(2, "0")}`,
    amendment_status: index === 2 ? "수정 보고서" : "수정 보고서 아님",
    result: facts.egfr === 1 ? "Detected" : "Not detected",
    reference_note: "교육용 합성 결과. 임상 판정에 사용하지 않음.",
  };
  item.generatedFields = Object.entries(generated).filter(([key]) => key !== "result").map(([key, value]) => generatedField(key, value, "원본 XLSX에 위탁검사 문서 항목이 없어 생성"));
  item.groundTruth.sourceContext = sourceContextFor(facts);
  const reference = [
    truthField("order_number", "의뢰번호", generated.order_number, "generated_demo"),
    truthField("institution", "검사기관", generated.institution, "generated_demo"),
    truthField("test_name", "검사명", generated.test_name, "generated_demo"),
    truthField("specimen", "검체", generated.specimen, "generated_demo"),
    truthField("received_date", "접수일", generated.received_date, "generated_demo"),
    truthField("reported_date", "보고일", generated.reported_date, "generated_demo"),
    truthField("amendment_status", "수정 보고서 상태", generated.amendment_status, "generated_demo"),
    truthField("result", "결과", generated.result, "public_synthetic", { sourceHeader: EXPECTED_HEADERS[28], derivation: "EGFR 1을 Detected, 0을 Not detected로 변환" }),
    truthField("reference_note", "참고사항", generated.reference_note, "generated_demo"),
  ];
  item.groundTruth.referenceFields = reference;
  const actual = { ...generated };
  const omitted = new Set();
  if (index === 1) {
    item.expectedReview = { required: true, reason: "low_quality_document" };
  }
  if (index === 3) {
    actual.order_number = "EXT-EVAL-2026-999";
    item.injectedErrors.push(error("ORDER_NUMBER_MISMATCH", ["order_number"], "내부 가상 의뢰번호와 다른 번호를 주입"));
    item.expectedWarnings.push(warning("ORDER_NUMBER_MISMATCH", ["order_number"], "의뢰번호 불일치"));
  } else if (index === 4) {
    actual.test_name = "ALK rearrangement analysis";
    item.injectedErrors.push(error("TEST_NAME_MISMATCH", ["test_name"], "내부 가상 의뢰정보와 다른 검사명을 주입"));
    item.expectedWarnings.push(warning("TEST_NAME_MISMATCH", ["test_name"], "검사명 불일치"));
  } else if (index === 5) {
    actual.specimen = "FFPE tissue, block Z9";
    item.injectedErrors.push(error("SPECIMEN_MISMATCH", ["specimen"], "내부 가상 의뢰정보와 다른 블록을 주입"));
    item.expectedWarnings.push(warning("SPECIMEN_MISMATCH", ["specimen"], "검체 불일치"));
  } else if (index === 6) {
    actual.received_date = "2026-05-30";
    item.injectedErrors.push(error("DATE_MISMATCH", ["received_date"], "내부 가상 의뢰정보와 다른 접수일을 주입"));
    item.expectedWarnings.push(warning("DATE_MISMATCH", ["received_date"], "접수일 불일치"));
    omitted.add("amendment_status");
    item.injectedErrors.push(error("AMENDMENT_STATUS_MISSING", ["amendment_status"], "수정 보고서 상태를 누락"));
    item.expectedWarnings.push(warning("AMENDMENT_STATUS_MISSING", ["amendment_status"], "수정 보고서 상태 확인 필요"));
  } else if (index === 7) {
    omitted.add("reported_date");
    item.injectedErrors.push(error("REPORT_DATE_MISSING", ["reported_date"], "보고일을 누락"));
    item.expectedWarnings.push(warning("REPORT_DATE_MISSING", ["reported_date"], "보고일 확인 필요"));
  } else if (index === 8) {
    actual.result = facts.egfr === 1 ? "Not detected" : "Detected";
    item.injectedErrors.push(error("SOURCE_VALUE_MISMATCH", ["result"], "원본 EGFR 값과 반대 결과를 주입"));
    item.expectedWarnings.push(warning("SOURCE_VALUE_MISMATCH", ["result"], "원본 합성행의 EGFR 값과 위탁 결과 불일치"));
  } else if (index === 9) {
    omitted.add("result");
    item.injectedErrors.push(error("MISSING_FIELD", ["result"], "결과란을 누락"));
    item.expectedWarnings.push(warning("MISSING_FIELD", ["result"], "검사 결과 확인 필요"));
  }
  const labels = { order_number: "가상 의뢰번호", institution: "가상 검사기관명", specimen: "검체", test_name: "검사명", received_date: "접수일", reported_date: "보고일", amendment_status: "수정 보고서 상태", result: "결과", reference_note: "참고사항" };
  item.inputText = Object.keys(labels).filter((key) => !omitted.has(key)).map((key) => `${labels[key]}: ${actual[key]}`).join("\n");
  item.groundTruth.expectedExtraction = reference.map((field) => {
    const value = omitted.has(field.key) ? null : actual[field.key];
    const unchangedSourceValue = field.sourceType === "public_synthetic" && value === field.value;
    return truthField(field.key, field.label, value, unchangedSourceValue ? "public_synthetic" : "generated_demo", {
      evidenceText: value,
      status: value === null ? "missing" : "extracted",
      sourceHeader: unchangedSourceValue ? field.sourceHeader : null,
      derivation: unchangedSourceValue ? field.derivation : "가상 위탁검사 입력문에 실제로 나타난 문자열",
    });
  });
  return item;
}

const lookupRows = (ids) => ids.map((suffix) => {
  const id = `NCC-LUNG-TST-${suffix}`;
  const row = sourceRows.get(id);
  if (!row) throw new Error(`선택한 원본 행을 찾을 수 없습니다: ${id}`);
  return row;
});
const cases = [
  ...lookupRows(SELECTED_SOURCE_IDS.gross).map(buildGross),
  ...lookupRows(SELECTED_SOURCE_IDS.pathology).map(buildPathology),
  ...lookupRows(SELECTED_SOURCE_IDS.outsourced).map(buildOutsourced),
];

const output = {
  schemaVersion: "1.0.0",
  fixtureVersion: "evaluation-fixtures-v1.1.3",
  generationMode: "deterministic_fixed_selection_and_templates",
  datasetScope: "education_only_no_real_patient_information",
  source: {
    provider: "국립암센터",
    title: "암 임상 라이브러리 합성데이터 (폐암)",
    archiveDate: "2025-01-07",
    archiveSha256: await sha256(archivePath),
    workbookEntry,
    workbookSha256: await sha256(workbookPath),
    sheets: sheetSummary,
    inspectedHeaders: EXPECTED_HEADERS,
  },
  provenancePolicy: {
    public_synthetic: "sourceFields의 sourceHeader·excelCell·rawValue로 원본 합성 XLSX 셀을 추적합니다.",
    generated_demo: "원본에 없는 자유서술·검체·크기·날짜·기관·결과지 문구는 프로젝트가 생성합니다.",
    groundTruth: "referenceFields는 원본 구조화 값과 생성 기준값, expectedExtraction은 inputText에 실제로 존재하는 추출 정답을 뜻합니다.",
  },
  distribution: {
    gross: { total: 10, normal: 4, error: 6 },
    pathology: { total: 15, normal: 5, error: 10 },
    outsourced: { total: 10, normal: 3, error: 7 },
  },
  cases,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`추적 가능한 평가사례 ${cases.length}건을 생성했습니다: ${outputPath}`);
