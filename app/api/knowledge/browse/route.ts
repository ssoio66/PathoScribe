import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DICTIONARY_CORPUS_PATH = path.join(process.cwd(), "data", "processed", "cancer-dictionary-rag.json");
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 50;

type DictionaryEntry = {
  id: string;
  termKo: string;
  termEn: string | null;
  definition: string;
};

type DictionaryCorpus = {
  generatedAt: string;
  statistics: { entries: number };
  entries: DictionaryEntry[];
};

const CATEGORY_DEFINITIONS = [
  { id: "all", label: "전체 용어", pattern: null },
  { id: "lung", label: "폐·흉부", pattern: /(폐|기관지|흉막|흉부|lung|bronch|pleura|thorac)/i },
  { id: "pathology", label: "병리·조직", pattern: /(병리|조직학|세포학|patholog|histolog|cytolog)/i },
  { id: "immuno", label: "면역·표지자", pattern: /(면역|항체|표지자|immuno|antibody|marker|ttf|pd-l1|p40)/i },
  { id: "molecular", label: "분자·유전", pattern: /(분자|유전자|돌연변이|molecular|gene|mutation|egfr|alk|kras)/i },
] as const;

type CategoryId = (typeof CATEGORY_DEFINITIONS)[number]["id"];

const INITIAL_GROUPS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;
const CHOSEONG_TO_GROUP = ["ㄱ", "ㄱ", "ㄴ", "ㄷ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅂ", "ㅅ", "ㅅ", "ㅇ", "ㅈ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;
const INITIAL_IDS = new Set(["all", "latin", ...INITIAL_GROUPS]);

let dictionaryCache: DictionaryCorpus | null = null;

function loadDictionary() {
  if (dictionaryCache) return dictionaryCache;
  if (!fs.existsSync(DICTIONARY_CORPUS_PATH)) return null;
  const parsed = JSON.parse(fs.readFileSync(DICTIONARY_CORPUS_PATH, "utf8")) as DictionaryCorpus;
  if (!Array.isArray(parsed.entries) || parsed.entries.length !== parsed.statistics.entries) {
    throw new Error("암정보사전 탐색 자료의 항목 수 검증에 실패했습니다.");
  }
  dictionaryCache = parsed;
  return dictionaryCache;
}

function categoryMatches(entry: DictionaryEntry, categoryId: CategoryId) {
  const category = CATEGORY_DEFINITIONS.find((item) => item.id === categoryId) ?? CATEGORY_DEFINITIONS[0];
  if (!category.pattern) return true;
  return category.pattern.test(`${entry.termKo} ${entry.termEn ?? ""} ${entry.definition}`);
}

function initialGroup(value: string) {
  const first = value.normalize("NFKC").trim().charAt(0);
  if (!first) return "other";
  if (/[0-9a-z]/i.test(first)) return "latin";
  const code = first.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "other";
  const choseongIndex = Math.floor((code - 0xac00) / 588);
  return CHOSEONG_TO_GROUP[choseongIndex] ?? "other";
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  try {
    const dictionary = loadDictionary();
    if (!dictionary) {
      return NextResponse.json({ available: false, message: "암정보사전 탐색 자료가 준비되지 않았습니다." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const requestedCategory = searchParams.get("category") ?? "all";
    const category = CATEGORY_DEFINITIONS.some((item) => item.id === requestedCategory)
      ? requestedCategory as CategoryId
      : "all";
    const requestedInitial = searchParams.get("initial") ?? "all";
    const initial = INITIAL_IDS.has(requestedInitial) ? requestedInitial : "all";
    const pageSize = Math.min(positiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const requestedPage = positiveInteger(searchParams.get("page"), 1);

    const categoryEntries = dictionary.entries.filter((entry) => categoryMatches(entry, category));
    const filteredEntries = initial === "all"
      ? categoryEntries
      : categoryEntries.filter((entry) => initialGroup(entry.termKo) === initial);
    const sortedEntries = [...filteredEntries].sort((left, right) =>
      left.termKo.localeCompare(right.termKo, "ko", { numeric: true, sensitivity: "base" }),
    );
    const total = sortedEntries.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const start = (page - 1) * pageSize;

    const categoryCounts = Object.fromEntries(
      CATEGORY_DEFINITIONS.map((definition) => [
        definition.id,
        dictionary.entries.filter((entry) => categoryMatches(entry, definition.id)).length,
      ]),
    );

    return NextResponse.json({
      available: true,
      category,
      initial,
      page,
      pageSize,
      total,
      totalPages,
      rangeStart: total === 0 ? 0 : start + 1,
      rangeEnd: Math.min(start + pageSize, total),
      corpusTotal: dictionary.statistics.entries,
      generatedAt: dictionary.generatedAt,
      classificationNote: "화면의 분류는 등록 용어를 찾기 위한 교육용 키워드 분류이며 공식 의학 분류체계가 아닙니다.",
      categories: CATEGORY_DEFINITIONS.map(({ id, label }) => ({ id, label, count: categoryCounts[id] })),
      items: sortedEntries.slice(start, start + pageSize).map((entry) => ({
        id: entry.id,
        termKo: entry.termKo,
        termEn: entry.termEn,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "암정보사전 목차를 불러오는 중 오류가 발생했습니다.";
    return NextResponse.json({ available: false, message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
