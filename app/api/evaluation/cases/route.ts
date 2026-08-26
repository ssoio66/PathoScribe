import { NextResponse } from "next/server";
import evaluationData from "@/data/evaluation/evaluation-cases.json";

export const runtime = "nodejs";

type EvaluationCaseType = "gross" | "pathology" | "outsourced";

function isCaseType(value: string | null): value is EvaluationCaseType {
  return value === "gross" || value === "pathology" || value === "outsourced";
}

function isSourceRowId(value: string | null) {
  return value === null || /^NCC-LUNG-(TRN|TST)-\d{5}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedType = searchParams.get("type");
  const requestedSourceRowId = searchParams.get("sourceRowId");
  if (requestedType && !isCaseType(requestedType)) {
    return NextResponse.json({ error: "지원하지 않는 평가사례 유형입니다." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  if (!isSourceRowId(requestedSourceRowId)) {
    return NextResponse.json({ error: "sourceRowId 형식이 올바르지 않습니다." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const cases = evaluationData.cases.filter((item) =>
    (!requestedType || item.caseType === requestedType)
    && (!requestedSourceRowId || item.sourceRowId === requestedSourceRowId),
  );
  return NextResponse.json({
    fixtureVersion: evaluationData.fixtureVersion,
    generationMode: evaluationData.generationMode,
    cases,
    disclaimer: "개인정보 없는 교육용 평가사례입니다. 원본 합성 셀과 서비스 생성 문장값은 sourceFields·generatedFields에서 구분하며, 실제 진단·판독·공식 의료기록에 사용할 수 없습니다.",
  }, { headers: { "Cache-Control": "no-store" } });
}
