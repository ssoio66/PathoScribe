import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { WorkflowPreviewResponse } from "@/lib/pathology-workflow";

export const runtime = "nodejs";

let previewPromise: Promise<Omit<WorkflowPreviewResponse, "disclaimer">> | null = null;

function loadPreview() {
  previewPromise ??= readFile(path.join(process.cwd(), "data", "generated", "web_preview.json"), "utf8")
    .then((value) => JSON.parse(value));
  return previewPromise;
}

export async function GET() {
  try {
    const preview = await loadPreview();
    return NextResponse.json({
      ...preview,
      disclaimer: "모든 ORD/SPC/GRS/BLK/RPT/IHC/MOL/EXT/REV-LUNG-2026-* ID와 운영 정보는 시제품용 가상 값입니다. 원본 XLSX 직접 매핑값도 담당자 원문 대조 없이 확정할 수 없습니다.",
    } satisfies WorkflowPreviewResponse, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      error: "가상 연결 데이터가 생성되지 않았습니다.",
      action: "npm.cmd run data:generate:pathology-workflow",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
