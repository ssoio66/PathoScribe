import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { NCC_LUNG_REGISTRY_METADATA } from "@/lib/data/ncc-lung-registry-metadata";
import { PROJECT_RAG_ENTRIES, type ProjectRagEntry } from "@/lib/data/project-rag";
import { assertSyntheticInput } from "@/lib/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DICTIONARY_CORPUS_PATH = path.join(process.cwd(), "data", "processed", "cancer-dictionary-rag.json");
const STOP_WORDS = new Set(["무엇", "무엇인가요", "알려주세요", "설명", "설명해", "뜻은", "의미", "인가요", "대한", "어떻게", "필드", "항목"]);

type DictionaryEntry = {
  id: string;
  termKo: string;
  termEn: string | null;
  definition: string;
  source: {
    provider: string;
    collection: string;
    sourcePage: string;
    sourceEndpoint: string;
    sourceRecordId: string;
  };
};

type DictionaryCorpus = {
  generatedAt: string;
  source: {
    provider: string;
    collection: string;
    sourcePage: string;
    sourceEndpoint: string;
    acquisition: string;
    sourceSha256: string;
  };
  interpretation: string;
  statistics: {
    entries: number;
    missingEnglishTerms: number;
    normalizedDuplicateKoreanTerms: number;
  };
  entries: DictionaryEntry[];
};

type RegistryField = (typeof NCC_LUNG_REGISTRY_METADATA.tables)[number]["fields"][number];
type RegistrySearchEntry = RegistryField & {
  tableId: string;
  tableName: string;
  groupName: string;
  aliases: string[];
};

type ProjectSearchMatch = { entry: ProjectRagEntry; score: number };

let dictionaryCache: DictionaryCorpus | null = null;

function loadDictionary() {
  if (dictionaryCache) return dictionaryCache;
  if (!fs.existsSync(DICTIONARY_CORPUS_PATH)) return null;
  const parsed = JSON.parse(fs.readFileSync(DICTIONARY_CORPUS_PATH, "utf8")) as DictionaryCorpus;
  if (!Array.isArray(parsed.entries) || parsed.entries.length !== parsed.statistics.entries) {
    throw new Error("암정보사전 검색 자료의 항목 수 검증에 실패했습니다.");
  }
  dictionaryCache = parsed;
  return dictionaryCache;
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[^0-9a-z가-힣]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, "");
}

function queryTokens(query: string) {
  return normalize(query)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function scoreDictionaryEntry(query: string, entry: DictionaryEntry) {
  const queryCompact = compact(query);
  const koreanCompact = compact(entry.termKo);
  const englishCompact = compact(entry.termEn ?? "");
  if (!queryCompact) return 0;
  if (queryCompact === koreanCompact || (englishCompact && queryCompact === englishCompact)) return 120;
  if (koreanCompact.length >= 2 && queryCompact.includes(koreanCompact)) return 100 + Math.min(15, koreanCompact.length);
  if (englishCompact.length >= 2 && queryCompact.includes(englishCompact)) return 100 + Math.min(15, englishCompact.length);
  if (queryCompact.length >= 2 && (koreanCompact.includes(queryCompact) || englishCompact.includes(queryCompact))) return 85;

  const normalizedDefinition = normalize(entry.definition);
  let score = 0;
  for (const token of queryTokens(query)) {
    if (koreanCompact.includes(compact(token)) || englishCompact.includes(compact(token))) score += 30;
    else if (normalizedDefinition.includes(token)) score += /^[a-z0-9-]+$/i.test(token) && token.length <= 8 ? 20 : 5;
  }
  return score;
}

const registryAliasMap = new Map(
  NCC_LUNG_REGISTRY_METADATA.mappings.pathologyReview.map((mapping) => [mapping.sourceRecordId, [mapping.label, mapping.targetKey]]),
);

const registryEntries: RegistrySearchEntry[] = NCC_LUNG_REGISTRY_METADATA.tables.flatMap((table) =>
  table.fields.map((field) => ({
    ...field,
    tableId: table.tableId,
    tableName: table.tableName,
    groupName: table.groupName,
    aliases: registryAliasMap.get(field.sourceRecordId) ?? [],
  })),
);

function scoreRegistryEntry(query: string, entry: RegistrySearchEntry) {
  const queryCompact = compact(query);
  const columnId = compact(entry.columnId);
  const columnName = compact(entry.columnName);
  const aliases = entry.aliases.map(compact);
  if (!queryCompact) return 0;
  if (queryCompact === columnId) return 140;
  if (queryCompact === columnName || aliases.includes(queryCompact)) return 130;
  if ([columnId, columnName, ...aliases].some((value) => value.length >= 2 && queryCompact.includes(value))) return 105;

  const primary = normalize(`${entry.columnId} ${entry.columnName} ${entry.aliases.join(" ")}`);
  const context = normalize(`${entry.description} ${entry.tableId} ${entry.tableName} ${entry.groupName} ${entry.displayFormat}`);
  let score = 0;
  for (const token of queryTokens(query)) {
    if (primary.includes(token)) score += 20;
    else if (context.includes(token)) score += 7;
  }
  return score;
}

function scoreProjectEntry(query: string, entry: ProjectRagEntry) {
  const queryCompact = compact(query);
  if (!queryCompact) return 0;
  const searchable = compact(`${entry.title} ${entry.subtitle ?? ""} ${entry.definition} ${entry.source.collection}`);
  if (searchable.includes(queryCompact)) return 100;
  let score = 0;
  for (const token of queryTokens(query)) {
    if (searchable.includes(compact(token))) score += 20;
  }
  return score;
}

function dictionarySourceSummary(corpus: DictionaryCorpus) {
  return {
    kind: "dictionary" as const,
    provider: corpus.source.provider,
    collection: corpus.source.collection,
    sourcePage: corpus.source.sourcePage,
    sourceFile: null,
    acquisition: corpus.source.acquisition,
    generatedAt: corpus.generatedAt,
    statistics: { entries: corpus.statistics.entries, tables: null },
  };
}

function registrySourceSummary() {
  return {
    kind: "registry_metadata" as const,
    provider: NCC_LUNG_REGISTRY_METADATA.source.provider,
    collection: NCC_LUNG_REGISTRY_METADATA.source.collection,
    sourcePage: null,
    sourceFile: NCC_LUNG_REGISTRY_METADATA.source.sourceFile,
    acquisition: NCC_LUNG_REGISTRY_METADATA.source.acquisition,
    generatedAt: NCC_LUNG_REGISTRY_METADATA.generatedAt,
    statistics: {
      entries: NCC_LUNG_REGISTRY_METADATA.statistics.metadataRows,
      tables: NCC_LUNG_REGISTRY_METADATA.statistics.tables,
    },
  };
}

function projectSourceSummary() {
  return {
    kind: "project_reference" as const,
    provider: "PathoScribe 서비스",
    collection: "서비스 자체 교육 자료",
    sourcePage: null,
    sourceFile: "README.md 및 서비스 코드/문서",
    acquisition: "서비스 규칙에서 선별한 로컬 근거 항목",
    generatedAt: "2026-08-24",
    statistics: { entries: PROJECT_RAG_ENTRIES.length, tables: null },
  };
}

export async function GET() {
  try {
    const dictionary = loadDictionary();
    const sources = [...(dictionary ? [dictionarySourceSummary(dictionary)] : []), registrySourceSummary(), projectSourceSummary()];
    return NextResponse.json({
      available: sources.length > 0,
      sources,
      interpretation: "암 용어 설명과 폐암 레지스트리 데이터 항목 정의를 출처별로 구분해 검색합니다.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "근거 자료 상태 확인 중 오류가 발생했습니다.";
    return NextResponse.json({ available: false, message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { query?: string };
    const query = body.query?.trim() ?? "";
    if (!query) return NextResponse.json({ error: "검색할 가상 용어 또는 데이터 항목 질문이 필요합니다." }, { status: 400 });
    if (query.length > 120) return NextResponse.json({ error: "검색 질문은 120자 이내로 입력하세요." }, { status: 413 });
    assertSyntheticInput(query);

    const dictionary = loadDictionary();
    const dictionaryMatches = dictionary ? dictionary.entries
      .map((entry) => ({ entry, score: scoreDictionaryEntry(query, entry) }))
      .filter(({ score }) => score >= 30)
      .map(({ entry, score }) => ({
        kind: "dictionary" as const,
        id: `dictionary:${entry.id}`,
        title: entry.termKo,
        subtitle: entry.termEn,
        definition: entry.definition,
        score,
        source: {
          provider: entry.source.provider,
          collection: entry.source.collection,
          sourcePage: entry.source.sourcePage,
          sourceFile: null,
          sourceRecordId: entry.source.sourceRecordId,
        },
      })) : [];

    const registryMatches = registryEntries
      .map((entry) => ({ entry, score: scoreRegistryEntry(query, entry) }))
      .filter(({ score }) => score >= 20)
      .map(({ entry, score }) => ({
        kind: "registry_metadata" as const,
        id: `registry:${entry.sourceRecordId}`,
        title: entry.columnName,
        subtitle: entry.columnId,
        definition: `${entry.tableName}의 ${entry.columnName}(${entry.columnId}) 항목입니다. 정의: ${entry.description}. 데이터 형식: ${entry.dataType}. 표시 형식: ${entry.displayFormat}. 메타정보상 보고 건수: ${entry.reportedCount.toLocaleString("ko-KR")}건.`,
        score,
        source: {
          provider: NCC_LUNG_REGISTRY_METADATA.source.provider,
          collection: `${NCC_LUNG_REGISTRY_METADATA.source.collection} · ${entry.tableName}`,
          sourcePage: null,
          sourceFile: NCC_LUNG_REGISTRY_METADATA.source.sourceFile,
          sourceRecordId: entry.sourceRecordId,
        },
      }));

    const projectMatches = PROJECT_RAG_ENTRIES
      .map((entry) => ({ entry, score: scoreProjectEntry(query, entry) }))
      .filter(({ score }) => score >= 20)
      .map(({ entry, score }: ProjectSearchMatch) => ({
        kind: "project_reference" as const,
        id: `project:${entry.id}`,
        title: entry.title,
        subtitle: entry.subtitle,
        definition: entry.definition,
        score,
        source: {
          provider: entry.source.provider,
          collection: entry.source.collection,
          sourcePage: entry.source.sourcePage,
          sourceFile: entry.source.sourceFile,
          sourceRecordId: entry.source.sourceRecordId,
          asOf: entry.source.asOf,
        },
      }));

    const matches = [...dictionaryMatches, ...registryMatches, ...projectMatches]
      .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "ko"))
      .slice(0, 5);
    const sources = [...(dictionary ? [dictionarySourceSummary(dictionary)] : []), registrySourceSummary(), projectSourceSummary()];

    return NextResponse.json({
      query,
      answer: matches[0]?.definition ?? null,
      matches,
      sources,
      disclaimer: "등록된 용어 설명 또는 레지스트리 메타정보만 표시합니다. 진단·판독·자동 입력·자동 확정의 근거가 아니며 담당자의 원문 대조가 필요합니다.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "근거 자료 검색 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
