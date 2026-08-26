import { NextResponse } from "next/server";
import { NCC_LUNG_BRONCHOSCOPY } from "@/lib/data/ncc-lung-bronchoscopy";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...NCC_LUNG_BRONCHOSCOPY,
    disclaimer: "국립암센터 공개 집계 API 스냅샷입니다. 개별 검사 이력, 검체 채취 사실, 병리 결과 또는 진단 판단에 사용하지 마세요.",
  }, { headers: { "Cache-Control": "no-store" } });
}
