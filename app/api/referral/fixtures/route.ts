import { NextResponse } from "next/server";
import fixtures from "@/data/fixtures/outsourced-test/referral-fixtures.json";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    fixtures: fixtures.map(({ id, label, file_name, asset_path, format, quality, watermark, evaluation_case_id }) => ({ id, label, file_name, asset_path, format, quality, watermark, evaluation_case_id })),
    disclaimer: "개인정보 없는 교육용 가상 위탁검사 자료 목록입니다. 실제 결과를 확정하거나 저장하지 않습니다.",
  }, { headers: { "Cache-Control": "no-store" } });
}
