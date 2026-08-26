import fs from "node:fs";
import path from "node:path";

const ENDPOINT = "https://apis.data.go.kr/B551172/Lung13/lulDiagByType";
const SOURCE_PAGE = "https://www.data.go.kr/data/15077056/openapi.do";
const PAGE_SIZE = 100;
const CONCURRENCY = 4;
const CENTER_NAME = "국립암센터";
const FROM_YEAR = "2010";
const TO_YEAR = "2019";
const OUTPUT_PATH = path.join(process.cwd(), "data", "processed", "ncc-lung-diagnosis-reference.json");

function readLocalEnv(name) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? "";
}

const apiKey =
  process.env.LUNG_CANCER_LIBRARY_DETAILED_DIAGNOSIS_API_KEY ||
  readLocalEnv("LUNG_CANCER_LIBRARY_DETAILED_DIAGNOSIS_API_KEY");
if (!apiKey) {
  throw new Error("LUNG_CANCER_LIBRARY_DETAILED_DIAGNOSIS_API_KEY가 필요합니다. 서버 전용 .env에 설정하세요.");
}

async function fetchPage(pageNo) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const url = new URL(ENDPOINT);
      url.searchParams.set("serviceKey", apiKey);
      url.searchParams.set("pageNo", String(pageNo));
      url.searchParams.set("numOfRows", String(PAGE_SIZE));
      url.searchParams.set("centerNm", CENTER_NAME);
      url.searchParams.set("fromYear", FROM_YEAR);
      url.searchParams.set("toYear", TO_YEAR);
      url.searchParams.set("type", "json");

      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (String(data.resultCode) !== "200" || !Array.isArray(data.items)) {
        throw new Error(`응답 코드 ${data.resultCode ?? data.errorCode ?? "UNKNOWN"}`);
      }
      return data;
    } catch (error) {
      if (attempt === 3) {
        const reason = error instanceof Error ? error.message : "알 수 없는 오류";
        throw new Error(`공공데이터 API ${pageNo}페이지 동기화 실패: ${reason}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error(`공공데이터 API ${pageNo}페이지 동기화 실패`);
}

const firstPage = await fetchPage(1);
const totalCount = Number(firstPage.totalCount);
const pageCount = Math.ceil(totalCount / PAGE_SIZE);
const items = [...firstPage.items];

for (let startPage = 2; startPage <= pageCount; startPage += CONCURRENCY) {
  const pageNumbers = Array.from({ length: Math.min(CONCURRENCY, pageCount - startPage + 1) }, (_, index) => startPage + index);
  const pages = await Promise.all(pageNumbers.map((pageNo) => fetchPage(pageNo)));
  pages.forEach((page) => items.push(...page.items));
  console.log(`동기화 진행: ${Math.min(startPage + CONCURRENCY - 1, pageCount)} / ${pageCount}페이지`);
}

if (items.length !== totalCount) {
  throw new Error(`API 전체 건수와 수집 건수가 다릅니다: ${totalCount} / ${items.length}`);
}

const targetMap = new Map();
for (const item of items) {
  const raw = String(item.statsTrgtNm ?? "").trim();
  if (!raw) continue;
  const match = raw.match(/^([A-Z]\d+(?:\.\d+)?)\s*\((.+)\)$/u);
  const code = match?.[1] ?? raw;
  const name = match?.[2] ?? raw;
  const current = targetMap.get(raw) ?? {
    code,
    name,
    raw,
    observedRows: 0,
    centers: new Set(),
    years: new Set(),
  };
  current.observedRows += 1;
  if (item.centerNm) current.centers.add(String(item.centerNm));
  if (item.critYr) current.years.add(String(item.critYr));
  targetMap.set(raw, current);
}

const targets = [...targetMap.values()]
  .map((target) => ({
    code: target.code,
    name: target.name,
    raw: target.raw,
    observedRows: target.observedRows,
    centers: [...target.centers].sort((left, right) => left.localeCompare(right, "ko")),
    years: [...target.years].sort(),
  }))
  .sort((left, right) => left.code.localeCompare(right.code, "en", { numeric: true }));

const centers = [...new Set(items.map((item) => String(item.centerNm ?? "")).filter(Boolean))].sort((left, right) => left.localeCompare(right, "ko"));
const years = [...new Set(items.map((item) => String(item.critYr ?? "")).filter(Boolean))].sort();
const snapshot = {
  version: 1,
  fetchedAt: new Date().toISOString(),
  source: {
    provider: "국립암센터",
    service: "폐암 라이브러리 세부진단 종류별",
    sourcePage: SOURCE_PAGE,
    endpoint: ENDPOINT,
    license: "공공저작물 출처표시 제1유형",
  },
  interpretation: "폐암 환자 집계에서 관찰된 ICD 계열 통계 대상명 참조 목록입니다. 조직학적 진단 표준 사전이나 확정 진단 코드가 아닙니다.",
  filters: {
    centerNm: CENTER_NAME,
    fromYear: FROM_YEAR,
    toYear: TO_YEAR,
  },
  statistics: {
    apiRows: items.length,
    uniqueTargets: targets.length,
    centers,
    yearRange: years.length ? { from: years[0], to: years.at(-1) } : null,
  },
  targets,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`진단 참조 스냅샷 생성 완료: ${items.length}행, ${targets.length}개 통계 대상`);
