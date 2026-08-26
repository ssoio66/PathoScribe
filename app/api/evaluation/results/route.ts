import { NextResponse } from "next/server";
import resultIndex from "@/data/evaluation/results/index.json";

export const runtime = "nodejs";

type ResultIndexEntry = {
  id: string;
  file: string;
  evaluatedAt: string;
  model: string;
  promptVersion: string;
  caseVersion: string;
  totalCases: number;
  successCases: number;
  failedCases: number;
  excludedCases: number;
  metrics: Array<{ key: string; label: string; value: number | null; numerator: number; denominator: number }>;
  displayedMetricKeys: string[];
  detail?: {
    byCaseType?: Record<string, { totalCases: number; successCases: number; failedCases: number; excludedCases: number; latencyMs: number }>;
    errorTypeResults?: Array<{ code: string; expected: number; evaluated: number; detected: number }>;
    methodComparison?: Record<string, { evaluated: boolean; reason?: string; description?: string }>;
    evaluationExclusions?: Record<string, string | number>;
    representativeSuccessCases?: string[];
    representativeFailureCases?: string[];
    normalization?: Record<string, string>;
    limitations?: string[];
  };
};

const index = resultIndex as { schemaVersion?: string; latest?: ResultIndexEntry | null; results?: ResultIndexEntry[] };

export async function GET() {
  return NextResponse.json({
    available: Boolean(index.latest),
    latest: index.latest ?? null,
    recent: (index.results ?? []).slice(0, 3),
    disclaimer: "평가 결과는 개발환경에서 고정된 교육용 사례만 명시적으로 실행한 경우에만 기록됩니다. 실제 환자자료나 API 키, 내부 프롬프트는 저장하지 않습니다.",
  }, { headers: { "Cache-Control": "no-store" } });
}
