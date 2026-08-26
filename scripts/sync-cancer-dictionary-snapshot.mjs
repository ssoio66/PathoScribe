import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { convert } from "html-to-text";

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "data", "raw", "cancer-dictionary-source.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "processed", "cancer-dictionary-rag.json");
const SOURCE_PAGE = "https://www.cancer.go.kr/lay1/S1T523C850/contents.do";
const SOURCE_ENDPOINT = "https://www.cancer.go.kr/api/dictionaryworks.do";
const fetchOfficial = process.argv.includes("--fetch-official");
const positionalInput = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const inputPath = path.resolve(positionalInput || DEFAULT_INPUT_PATH);

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\r/g, "").trim();
}

function cleanDefinition(html) {
  return convert(String(html ?? ""), {
    wordwrap: false,
    preserveNewlines: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "iframe", format: "skip" },
    ],
  })
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function normalizedTerm(value) {
  return normalizeText(value).toLocaleLowerCase("ko").replace(/\s+/g, " ");
}

let sourceBuffer;
let acquisition;
if (fs.existsSync(inputPath)) {
  sourceBuffer = fs.readFileSync(inputPath);
  acquisition = "사용자가 제공한 고정 JSON/HTML 스냅샷";
} else if (fetchOfficial) {
  const response = await fetch(SOURCE_ENDPOINT, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`암정보사전 공식 OPEN API 호출 실패: HTTP ${response.status}`);
  sourceBuffer = Buffer.from(await response.arrayBuffer());
  acquisition = "배포 빌드 시 국가암지식정보센터 공식 OPEN API 동기화";
} else {
  throw new Error("암정보사전 원본을 찾을 수 없습니다: " + inputPath);
}
const parsed = JSON.parse(sourceBuffer.toString("utf8"));
if (!parsed || !Array.isArray(parsed.result)) {
  throw new Error("암정보사전 원본의 result 배열을 찾을 수 없습니다.");
}

const seenIds = new Set();
const normalizedKoreanTerms = new Map();
const entries = parsed.result.map((item, index) => {
  const id = String(item.seq ?? "").trim();
  const termKo = normalizeText(item.work_kor);
  const termEn = normalizeText(item.work_eng);
  const definition = cleanDefinition(item.sense_kor);

  if (!id || !termKo || !definition) {
    throw new Error("필수 필드가 비어 있습니다. 원본 배열 위치: " + index);
  }
  if (seenIds.has(id)) {
    throw new Error("중복된 seq가 있습니다: " + id);
  }
  if (/<\/?[a-z][^>]*>/i.test(definition)) {
    throw new Error("정제 후 HTML 태그가 남아 있습니다: " + id);
  }
  seenIds.add(id);

  const normalizedKo = normalizedTerm(termKo);
  const termGroup = normalizedKoreanTerms.get(normalizedKo) ?? [];
  termGroup.push(id);
  normalizedKoreanTerms.set(normalizedKo, termGroup);

  return {
    id,
    termKo,
    termEn: termEn || null,
    definition,
    source: {
      provider: "국가암지식정보센터",
      collection: "암정보사전",
      sourcePage: SOURCE_PAGE,
      sourceEndpoint: SOURCE_ENDPOINT,
      sourceRecordId: id,
    },
  };
});

const duplicateTerms = [...normalizedKoreanTerms.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([term, ids]) => ({ term, ids }));
const definitions = entries.map((entry) => entry.definition.length).sort((left, right) => left - right);
const percentile = (ratio) => definitions[Math.floor((definitions.length - 1) * ratio)] ?? 0;
const snapshot = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: {
    provider: "국가암지식정보센터",
    collection: "암정보사전",
    sourcePage: SOURCE_PAGE,
    sourceEndpoint: SOURCE_ENDPOINT,
    acquisition,
    sourceSha256: crypto.createHash("sha256").update(sourceBuffer).digest("hex").toUpperCase(),
  },
  interpretation: "암·의학 용어의 일반 설명 자료입니다. 병리 표준 사전, 검사별 입력 지침, 진단 기준 또는 기관 업무 매뉴얼이 아닙니다.",
  statistics: {
    entries: entries.length,
    missingEnglishTerms: entries.filter((entry) => !entry.termEn).length,
    normalizedDuplicateKoreanTerms: duplicateTerms.length,
    definitionLength: {
      minimum: definitions[0] ?? 0,
      median: percentile(0.5),
      p95: percentile(0.95),
      maximum: definitions.at(-1) ?? 0,
    },
  },
  duplicateTerms,
  entries,
};

if (entries.length !== parsed.result.length) {
  throw new Error("원본 항목 수와 정제 항목 수가 다릅니다.");
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log(
  "암정보사전 RAG 스냅샷 생성 완료: " +
    entries.length +
    "개 용어, 영문 누락 " +
    snapshot.statistics.missingEnglishTerms +
    "개, 정규화 중복 " +
    duplicateTerms.length +
    "종",
);
