import { NextResponse } from "next/server";
import { NCC_LUNG_LINKAGE } from "@/lib/data/ncc-lung-linkage";
import { PATHOLOGY_MOLECULAR_TARGET_SCHEMA } from "@/lib/pathology-molecular-linkage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    source: NCC_LUNG_LINKAGE.source,
    workbook: NCC_LUNG_LINKAGE.workbook,
    mapping: NCC_LUNG_LINKAGE.mapping,
    statistics: NCC_LUNG_LINKAGE.statistics,
    linkageAssessment: NCC_LUNG_LINKAGE.linkageAssessment,
    targetSchema: PATHOLOGY_MOLECULAR_TARGET_SCHEMA,
    disclaimer: "동일 합성 원본 행의 분석용 연관 집계입니다. 환자·검체·보고서 단위 연결이나 진단·판독 근거가 아닙니다.",
  }, { headers: { "Cache-Control": "no-store" } });
}
