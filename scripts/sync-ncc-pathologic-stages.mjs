import fs from "node:fs";
import path from "node:path";

const ENDPOINT = "https://apis.data.go.kr/B551172/Lung20/luSurgicalByType";
const SOURCE_PAGE = "https://www.data.go.kr/data/15077088/openapi.do";
const ENV_NAME = "LUNG_CANCER_LIBRARY_SURGICAL_PATHOLOGY_PATHOLOGIC_STAGE_API_KEY";
const PAGE_SIZE = 100;
const CONCURRENCY = 4;
const CENTER_NAME = "국립암센터";
const FROM_YEAR = "2010";
const TO_YEAR = "2019";
const OUTPUT_PATH = path.join(process.cwd(), "data", "processed", "ncc-lung-pathologic-stages.json");

function readLocalEnv(name) {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs.readFileSync(envPath, "utf8").split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? "";
}

const apiKey = process.env[ENV_NAME] || readLocalEnv(ENV_NAME);
if (!apiKey) {
  throw new Error(`${ENV_NAME}가 필요합니다. 서버 전용 .env에 설정하세요.`);
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

      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
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
  const pageNumbers = Array.from(
    { length: Math.min(CONCURRENCY, pageCount - startPage + 1) },
    (_, index) => startPage + index,
  );
  const pages = await Promise.all(pageNumbers.map((pageNo) => fetchPage(pageNo)));
  pages.forEach((page) => items.push(...page.items));
  console.log(`동기화 진행: ${Math.min(startPage + CONCURRENCY - 1, pageCount)} / ${pageCount}페이지`);
}

if (items.length !== totalCount) {
  throw new Error(`API 전체 건수와 수집 건수가 다릅니다: ${totalCount} / ${items.length}`);
}

const targetMap = new Map();
for (const item of items) {
  const value = String(item.statsTrgtNm ?? "").trim();
  if (!value) continue;
  const current = targetMap.get(value) ?? {
    value,
    observedRows: 0,
    observedCountSum: 0,
    patientCountSum: 0,
    years: new Set(),
  };
  current.observedRows += 1;
  current.observedCountSum += Number(item.ncsNmvl ?? 0) || 0;
  current.patientCountSum += Number(item.ptCntNmvl ?? 0) || 0;
  if (item.critYr) current.years.add(String(item.critYr));
  targetMap.set(value, current);
}

const targets = [...targetMap.values()]
  .map((target) => ({
    value: target.value,
    observedRows: target.observedRows,
    observedCountSum: target.observedCountSum,
    patientCountSum: target.patientCountSum,
    years: [...target.years].sort(),
  }))
  .sort((left, right) => right.observedCountSum - left.observedCountSum || left.value.localeCompare(right.value, "en", { numeric: true }));

const namedRows = items.filter((item) => String(item.statsTrgtNm ?? "").trim()).length;
const years = [...new Set(items.map((item) => String(item.critYr ?? "")).filter(Boolean))].sort();
const snapshot = {
  version: 1,
  fetchedAt: new Date().toISOString(),
  source: {
    provider: "국립암센터",
    service: "폐암 라이브러리 외과병리 병리학적 병기값",
    sourcePage: SOURCE_PAGE,
    endpoint: ENDPOINT,
    license: "공공저작물 출처표시 제1유형",
  },
  interpretation: "센터·연도·연령·성별·병리학적 병기 통계 대상명별 집계 자료입니다. 병기 표준 규칙, TNM 계산기 또는 개별 환자 병기 정답 데이터가 아닙니다.",
  allowedUse: "병리 결과문에서 원문 근거로 추출한 병기값을 담당자가 수동 참고 대조하는 용도로만 사용합니다.",
  prohibitedUse: "병기 계산, 진단, 입력값 자동 수정, 자동 저장 또는 자동 확정에 사용하지 않습니다.",
  filters: {
    centerNm: CENTER_NAME,
    fromYear: FROM_YEAR,
    toYear: TO_YEAR,
  },
  quality: {
    referenceAvailable: targets.length > 0,
    warning: targets.length > 0
      ? null
      : "공식 API 응답의 통계 대상 명(statsTrgtNm)이 모든 행에서 비어 있어 병기값 참조 목록을 만들 수 없습니다.",
  },
  statistics: {
    apiRows: items.length,
    namedRows,
    unnamedRows: items.length - namedRows,
    uniqueTargets: targets.length,
    observedCountSum: items.reduce((sum, item) => sum + (Number(item.ncsNmvl ?? 0) || 0), 0),
    patientCountSum: items.reduce((sum, item) => sum + (Number(item.ptCntNmvl ?? 0) || 0), 0),
    yearRange: years.length ? { from: years[0], to: years.at(-1) } : null,
  },
  targets,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`병기값 스냅샷 생성 완료: ${items.length}행, 병기값 ${namedRows}행, 고유 값 ${targets.length}개`);
