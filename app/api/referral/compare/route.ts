import { NextResponse } from "next/server";
import fixtures from "@/data/fixtures/outsourced-test/referral-fixtures.json";
import orders from "@/data/fixtures/outsourced-test/internal-referral-orders.json";
import { applyEvaluationCaseReview } from "@/lib/evaluation-case-review";
import { findEvaluationCase } from "@/lib/evaluation-cases";
import { runReferralRuleReview } from "@/lib/hybrid-review";

export const runtime = "nodejs";

type Fixture = (typeof fixtures)[number];
type Order = (typeof orders)[number];
type CompareKey = "order_number" | "test_name" | "specimen" | "received_date" | "reported_date" | "amendment_status" | "result";

const COMPARE_FIELDS: Array<{ key: CompareKey; label: string; expectedKey: keyof Order }> = [
  { key: "order_number", label: "의뢰번호", expectedKey: "order_id" },
  { key: "test_name", label: "검사명", expectedKey: "test_name" },
  { key: "specimen", label: "검체", expectedKey: "specimen" },
  { key: "received_date", label: "접수일", expectedKey: "received_date" },
  { key: "reported_date", label: "보고일", expectedKey: "reported_date" },
  { key: "amendment_status", label: "수정 보고서 상태", expectedKey: "amendment_status" },
  { key: "result", label: "결과", expectedKey: "expected_result" },
];

function normalize(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function findFixture(body: { fixtureId?: string; fileName?: string }): Fixture | undefined {
  const requested = body.fixtureId?.trim();
  const fileName = body.fileName?.trim();
  return fixtures.find((fixture) => fixture.id === requested || fixture.file_name === fileName);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { fixtureId?: string; fileName?: string };
    const fixture = findFixture(body);
    if (!fixture) {
      return NextResponse.json({ error: "검증된 교육용 가상 PDF·이미지 파일명을 찾지 못했습니다. 원문을 담당자가 직접 확인하세요." }, { status: 404 });
    }
    const order = orders.find((candidate) => candidate.fixture_id === fixture.id);
    if (!order) {
      return NextResponse.json({ error: "가상 내부 의뢰정보가 없습니다." }, { status: 500 });
    }

    const comparisons = COMPARE_FIELDS.map(({ key, label, expectedKey }) => {
      const extracted = fixture.extracted[key] as string | null;
      const expected = order[expectedKey] as string;
      const status = extracted === null || extracted.trim() === "" ? "missing" : normalize(extracted) === normalize(expected) ? "match" : "mismatch";
      return { key, label, extracted, expected, status };
    });
    const overall = comparisons.some(({ status }) => status === "missing")
      ? "needs_review"
      : comparisons.some(({ status }) => status === "mismatch") ? "mismatch" : "match";
    const baseRuleIssues = runReferralRuleReview(
      fixture.extracted as Record<string, string | null>,
      order as unknown as Record<string, string>,
    );
    const evaluationCase = findEvaluationCase(fixture.evaluation_case_id, "outsourced");
    const evaluationFields = Object.entries(fixture.extracted).map(([key, value]) => ({
      key,
      label: COMPARE_FIELDS.find((field) => field.key === key)?.label ?? key,
      value,
      evidence: value,
      evidenceText: value,
      status: value === null ? "not_found" as const : "extracted" as const,
    }));
    const ruleIssues = applyEvaluationCaseReview(evaluationCase, evaluationFields, baseRuleIssues);

    return NextResponse.json({
      fixture: { id: fixture.id, label: fixture.label, fileName: fixture.file_name, assetPath: fixture.asset_path, format: fixture.format, quality: fixture.quality, watermark: fixture.watermark },
      extracted: fixture.extracted,
      internal: order,
      comparisons,
      ruleIssues,
      overall,
      revisedReport: {
        status: fixture.quality === "poor" || !fixture.extracted.amendment_status ? "needs_review" : fixture.extracted.amendment_status === "수정 보고서" ? "revised" : "not_marked",
        label: fixture.quality === "poor" || !fixture.extracted.amendment_status ? "확인 필요" : fixture.extracted.amendment_status === "수정 보고서" ? "수정 보고서" : "수정 보고서 아님",
        evidence: fixture.quality === "poor" ? null : fixture.extracted.amendment_status,
      },
      canConfirm: false,
      disclaimer: "교육용 가상 위탁검사 결과의 문자열 대조입니다. 담당자가 원문을 확인하기 전에는 결과를 확정하지 않으며, 이 요청과 결과를 저장하지 않습니다.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "위탁검사 결과 대조 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
