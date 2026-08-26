import { NextResponse } from "next/server";
import { NCC_LUNG_PATHOLOGIC_STAGES, type PathologicStageTarget } from "@/lib/data/ncc-lung-pathologic-stages";
import { assertSyntheticInput } from "@/lib/safety";
import { extractStageTokens, isStageValueAllowed, STAGE_FIELD_DEFINITIONS } from "@/lib/stage-review";

export const runtime = "nodejs";

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/[\s()[\]{}·,._/-]+/g, "");
}

function scoreTarget(query: string, target: PathologicStageTarget) {
  const normalizedQuery = normalize(query);
  const normalizedTarget = normalize(target.value);
  if (!normalizedQuery) return 0;
  if (normalizedQuery === normalizedTarget) return 100;
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) return 60;
  return 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { stage?: string };
    const stage = body.stage?.trim() ?? "";
    if (!stage) {
      return NextResponse.json({ error: "대조할 가상 병기값이 필요합니다." }, { status: 400 });
    }
    if (stage.length > 80) {
      return NextResponse.json({ error: "병기값은 80자 이내로 입력하세요." }, { status: 413 });
    }
    assertSyntheticInput(stage);
    const hasAllowedFormat = STAGE_FIELD_DEFINITIONS.some(({ key }) => isStageValueAllowed(stage, key) || extractStageTokens(stage, key).some((token) => token.toLowerCase() === stage.toLowerCase()));
    if (!hasAllowedFormat) {
      return NextResponse.json({ error: "원문에 명시된 pT, pN, pM 또는 Stage 형식만 참고 대조할 수 있습니다." }, { status: 400 });
    }

    const candidates = NCC_LUNG_PATHOLOGIC_STAGES.targets
      .map((target) => ({ target, score: scoreTarget(stage, target) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.target.value.localeCompare(right.target.value, "en", { numeric: true }))
      .slice(0, 8)
      .map(({ target }) => target);

    return NextResponse.json({
      candidates,
      quality: NCC_LUNG_PATHOLOGIC_STAGES.quality,
      source: {
        ...NCC_LUNG_PATHOLOGIC_STAGES.source,
        fetchedAt: NCC_LUNG_PATHOLOGIC_STAGES.fetchedAt,
        apiRows: NCC_LUNG_PATHOLOGIC_STAGES.statistics.apiRows,
        namedRows: NCC_LUNG_PATHOLOGIC_STAGES.statistics.namedRows,
        uniqueTargets: NCC_LUNG_PATHOLOGIC_STAGES.statistics.uniqueTargets,
        filters: NCC_LUNG_PATHOLOGIC_STAGES.filters,
      },
      disclaimer: "공공 집계의 문자열 수동 참고 대조입니다. AJCC/TNM 규칙, 병기 계산, 진단·자동 입력·자동 저장·자동 확정을 구현하지 않습니다.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "병기값 참조 대조 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
