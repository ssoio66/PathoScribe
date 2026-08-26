import { NextResponse } from "next/server";
import { getGeminiAvailability } from "@/lib/public-runtime";

export const runtime = "nodejs";

export async function GET() {
  const availability = getGeminiAvailability();
  return NextResponse.json({
    publicDeployment: availability.publicDeployment,
    demoMode: availability.demoMode,
    canAnalyze: availability.canAnalyze,
    liveAvailable: availability.liveAvailable,
    reason: availability.reason,
    disclaimer: "실제 환자정보 입력은 금지됩니다. 공개 배포에서는 고정된 교육용 평가사례만 분석할 수 있습니다.",
  }, { headers: { "Cache-Control": "no-store" } });
}
