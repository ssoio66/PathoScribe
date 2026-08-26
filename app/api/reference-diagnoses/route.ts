import { NextResponse } from "next/server";
import referenceSnapshot from "@/data/processed/ncc-lung-diagnosis-reference.json";
import { assertSyntheticInput } from "@/lib/safety";

export const runtime = "nodejs";

type DiagnosisTarget = (typeof referenceSnapshot.targets)[number];

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko").replace(/[\s()[\]{}·,._/-]+/g, "");
}

function scoreTarget(query: string, target: DiagnosisTarget) {
  const normalizedQuery = normalize(query);
  const code = normalize(target.code);
  const name = normalize(target.name);
  const raw = normalize(target.raw);
  if (!normalizedQuery) return 0;
  if (normalizedQuery === code || normalizedQuery === name || normalizedQuery === raw) return 100;
  if (code.startsWith(normalizedQuery) || name.startsWith(normalizedQuery)) return 80;
  if (raw.includes(normalizedQuery) || normalizedQuery.includes(name)) return 60;
  return 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { diagnosis?: string };
    const diagnosis = body.diagnosis?.trim() ?? "";
    if (!diagnosis) {
      return NextResponse.json({ error: "대조할 가상 진단명이 필요합니다." }, { status: 400 });
    }
    if (diagnosis.length > 200) {
      return NextResponse.json({ error: "진단명은 200자 이내로 입력하세요." }, { status: 413 });
    }
    assertSyntheticInput(diagnosis);

    const candidates = referenceSnapshot.targets
      .map((target) => ({ target, score: scoreTarget(diagnosis, target) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.target.code.localeCompare(right.target.code, "en", { numeric: true }))
      .slice(0, 8)
      .map(({ target }) => target);

    return NextResponse.json({
      candidates,
      source: {
        ...referenceSnapshot.source,
        fetchedAt: referenceSnapshot.fetchedAt,
        apiRows: referenceSnapshot.statistics.apiRows,
        uniqueTargets: referenceSnapshot.statistics.uniqueTargets,
        filters: referenceSnapshot.filters,
      },
      disclaimer: "공공 집계에서 관찰된 진단 분류의 참고 대조 결과입니다. 표준 진단 확정이나 자동 입력에 사용하지 마세요.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "진단 참조 대조 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
