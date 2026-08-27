import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import fixtures from "@/data/fixtures/outsourced-test/referral-fixtures.json";
import orders from "@/data/fixtures/outsourced-test/internal-referral-orders.json";
import { enforceDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { applyEvaluationCaseReview } from "@/lib/evaluation-case-review";
import { findEvaluationCase } from "@/lib/evaluation-cases";
import { runReferralRuleReview } from "@/lib/hybrid-review";
import { classifyGeminiFailure, geminiFailureLogDetails, geminiFailureMessage, geminiFailureStatus } from "@/lib/gemini-error";
import { GEMINI_REQUEST_TIMEOUT_MS, MAX_REFERRAL_FIXTURE_BYTES, MAX_REFERRAL_REQUEST_BYTES, PROMPT_VERSION, getGeminiAvailability, isPublicDeployment } from "@/lib/public-runtime";

export const runtime = "nodejs";

const FIELD_KEYS = ["order_number", "institution", "specimen", "test_name", "received_date", "reported_date", "amendment_status", "result", "reference_note"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

async function readFixtureRequest(request: Request) {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REFERRAL_REQUEST_BYTES) throw new Error("request_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REFERRAL_REQUEST_BYTES) throw new Error("request_too_large");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
}

const FIELD_LABELS: Record<FieldKey, string> = {
  order_number: "가상 의뢰번호",
  institution: "검사기관명",
  specimen: "검체",
  test_name: "검사명",
  received_date: "접수일",
  reported_date: "보고일",
  amendment_status: "수정 보고서 상태",
  result: "결과",
  reference_note: "참고사항",
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: FIELD_KEYS },
          value: { type: "string", nullable: true },
          evidenceText: { type: "string", nullable: true },
          status: { type: "string", enum: ["extracted", "needs_review", "not_found"] },
        },
        required: ["key", "value", "evidenceText", "status"],
        additionalProperties: false,
      },
    },
  },
  required: ["fields"],
  additionalProperties: false,
};

function normalizeGeminiFields(payload: unknown, sourceText: string) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { fields?: unknown }).fields)) throw new Error("Gemini response is missing fields");
  const fields = (payload as { fields: unknown[] }).fields;
  if (fields.length !== FIELD_KEYS.length) throw new Error("Gemini response has an incomplete field set");
  const seen = new Set<string>();
  const extracted: Record<string, string | null> = {};

  for (const item of fields) {
    if (!item || typeof item !== "object") throw new Error("Gemini field is invalid");
    const field = item as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key : "";
    if (!FIELD_KEYS.includes(key as FieldKey) || seen.has(key)) throw new Error("Gemini field key is invalid");
    seen.add(key);
    const value = field.value === null ? null : typeof field.value === "string" ? field.value.trim() : undefined;
    const evidenceText = field.evidenceText;
    const status = field.status;
    if (value === undefined) throw new Error("Gemini field value is invalid");
    if (value === null) {
      if (evidenceText !== null || status !== "not_found") throw new Error("Gemini not_found field is invalid");
      extracted[key] = null;
      continue;
    }
    if (!value || typeof evidenceText !== "string" || !evidenceText || !sourceText.includes(evidenceText) || (status !== "extracted" && status !== "needs_review")) {
      throw new Error("Gemini field evidence is invalid");
    }
    extracted[key] = value;
  }
  if (seen.size !== FIELD_KEYS.length) throw new Error("Gemini response is missing fields");
  return extracted as Record<FieldKey, string | null>;
}

export async function POST(request: Request) {
  const evaluatedAt = new Date().toISOString();
  try {
    const body = await readFixtureRequest(request);
    if (isPublicDeployment() && Object.keys(body).some((key) => key !== "fixtureId")) {
      return NextResponse.json(
        { error: "공개 배포에서는 서비스가 제공하는 고정 가상 문서만 분석할 수 있습니다.", analysisState: "live_failed", evaluatedAt },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const fixture = fixtures.find((item) => item.id === body.fixtureId);
    if (!fixture) return NextResponse.json({ error: "검증된 교육용 가상 문서를 찾을 수 없습니다." }, { status: 404 });
    const availability = getGeminiAvailability();
    if (availability.demoMode) {
      return NextResponse.json({ error: "교육 데모 모드에서는 Gemini 문서 재추출을 실행하지 않습니다. 사전 검증된 fixture 추출값만 사용합니다.", analysisState: "live_failed", evaluatedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (!availability.liveAvailable) return NextResponse.json({ error: "실시간 Gemini 분석 설정이 필요합니다.", analysisState: "live_failed", evaluatedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Gemini API 환경변수가 없어 문서 재추출을 실행하지 않습니다.", analysisState: "live_failed", evaluatedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });

    let rateLimitHeaders: Record<string, string> = {};
    if (isPublicDeployment()) {
      try {
        const rate = await enforceDistributedRateLimit(request, "gemini-referral-document");
        rateLimitHeaders = { "X-RateLimit-Remaining": String(rate.remaining), "X-RateLimit-Reset": String(rate.retryAfterSeconds) };
        if (!rate.allowed) return NextResponse.json({ error: "실시간 분석 호출 한도에 도달했습니다. 잠시 후 다시 시도하세요.", analysisState: "live_failed", retryAfterSeconds: rate.retryAfterSeconds, evaluatedAt }, { status: 429, headers: { "Cache-Control": "no-store" } });
      } catch {
        return NextResponse.json({ error: "공개 배포 호출 제한 설정을 확인할 수 없어 실시간 분석을 실행하지 않았습니다.", analysisState: "live_failed", evaluatedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
    }

    const publicRoot = resolve(process.cwd(), "public");
    const assetPath = resolve(publicRoot, `.${fixture.asset_path}`);
    if (!assetPath.startsWith(`${publicRoot}${sep}`)) return NextResponse.json({ error: "허용되지 않은 문서 경로입니다." }, { status: 400 });
    const bytes = await readFile(assetPath);
    if (bytes.byteLength > MAX_REFERRAL_FIXTURE_BYTES) return NextResponse.json({ error: "교육용 문서 파일이 허용 크기를 초과했습니다.", analysisState: "live_failed", evaluatedAt }, { status: 413, headers: { "Cache-Control": "no-store" } });
    const mimeType = fixture.format === "pdf" ? "application/pdf" : "image/png";
    const sourceText = FIELD_KEYS.map((key) => `${FIELD_LABELS[key]} ${fixture.extracted[key] ?? ""}`).join("\n");

    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const startedAt = Date.now();
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType, data: bytes.toString("base64") } },
        { text: "This is an educational synthetic outsourced pathology test document with no real patient information. Extract only text visibly present in the document. Return every schema field exactly once. If absent, return value null, evidenceText null, status not_found. Do not infer results, diagnosis, stage, treatment, or confirmation. Do not emit confidence." },
      ] }],
      config: { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, temperature: 0, httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS } },
    });
    const extracted = normalizeGeminiFields(JSON.parse(response.text ?? "{}"), sourceText);
    const order = orders.find((item) => item.fixture_id === fixture.id);
    if (!order) throw new Error("Internal referral fixture is missing");
    const fields = FIELD_KEYS.map((key) => ({ key, label: FIELD_LABELS[key], value: extracted[key], evidence: extracted[key], evidenceText: extracted[key], status: extracted[key] === null ? "not_found" as const : "extracted" as const }));
    const baseRuleIssues = runReferralRuleReview(extracted, order as unknown as Record<string, string>);
    const evaluationCase = findEvaluationCase(fixture.evaluation_case_id, "outsourced");
    return NextResponse.json({
      mode: "gemini",
      fields,
      ruleIssues: applyEvaluationCaseReview(evaluationCase, fields, baseRuleIssues),
      disclaimer: "교육용 가상 문서의 Gemini 재추출 결과입니다. 담당자 확인 전 자동 저장 또는 확정하지 않습니다.",
      model,
      latencyMs: Date.now() - startedAt,
      promptVersion: PROMPT_VERSION,
      caseVersion: fixture.template_version,
      evaluatedAt,
      analysisState: "live",
    }, { headers: { "Cache-Control": "no-store", ...rateLimitHeaders } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini 문서 재추출에 실패했습니다.";
    if (message === "request_too_large") return NextResponse.json({ error: "요청 크기가 허용 범위를 초과했습니다.", analysisState: "live_failed", evaluatedAt }, { status: 413, headers: { "Cache-Control": "no-store" } });
    if (message === "invalid_json") return NextResponse.json({ error: "요청 형식이 올바르지 않습니다.", analysisState: "live_failed", evaluatedAt }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const failureKind = classifyGeminiFailure(error);
    const details = geminiFailureLogDetails(error);
    const safeMessage = process.env.GEMINI_API_KEY ? details.message.replaceAll(process.env.GEMINI_API_KEY, "[REDACTED]") : details.message;
    console.error(`[referral/gemini-extract] failed (kind=${failureKind}; status=${details.status}; code=${details.code}; message=${safeMessage})`);
    return NextResponse.json({ error: geminiFailureMessage(failureKind), analysisState: "live_failed", evaluatedAt }, { status: geminiFailureStatus(failureKind), headers: { "Cache-Control": "no-store" } });
  }
}
