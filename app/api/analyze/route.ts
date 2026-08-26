import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { analyzeDemo, validateEvidence } from "@/lib/demo-engine";
import { enforceDistributedRateLimit } from "@/lib/distributed-rate-limit";
import { applyEvaluationCaseReview, applyEvaluationFieldReviewStatus } from "@/lib/evaluation-case-review";
import { findEvaluationCase, getEvaluationCaseVersion, type EvaluationCaseType } from "@/lib/evaluation-cases";
import { buildMedicalTermReviews } from "@/lib/medical-term-review";
import { MAX_ANALYZE_REQUEST_BYTES, PROMPT_VERSION, getGeminiAvailability, isPublicDeployment } from "@/lib/public-runtime";
import { assertSyntheticInput } from "@/lib/safety";
import type { AnalyzeKind, AnalyzeResponse, ExtractedField, ReviewIssue } from "@/lib/types";

export const runtime = "nodejs";

const FIELD_DEFINITIONS: Record<AnalyzeKind, Array<{ key: string; label: string }>> = {
  gross: [
    { key: "organ", label: "장기" }, { key: "specimen", label: "검체" }, { key: "site", label: "부위" },
    { key: "laterality", label: "좌우" }, { key: "size", label: "크기" }, { key: "count", label: "개수" },
    { key: "cutSurface", label: "절단면" }, { key: "lesionLocation", label: "병변 위치" }, { key: "blockCount", label: "블록 수" },
  ],
  pathology: [
    { key: "laterality", label: "좌우·부위" }, { key: "site", label: "부위" }, { key: "procedure", label: "시술 또는 수술 종류" },
    { key: "organ", label: "장기" }, { key: "specimen", label: "검체" }, { key: "diagnosis", label: "조직학적 진단명" },
    { key: "histologicType", label: "조직학적 유형" }, { key: "tumorSize", label: "종양 크기" }, { key: "grade", label: "분화도" },
    { key: "margin", label: "절제연" }, { key: "lymphNodes", label: "림프절" }, { key: "pathologicT", label: "pT" },
    { key: "pathologicN", label: "pN" }, { key: "pathologicM", label: "pM" }, { key: "pathologicStage", label: "Stage" },
    { key: "immunopathology", label: "면역병리" }, { key: "molecularPathology", label: "분자병리" },
  ],
};

function responseSchemaFor(kind: AnalyzeKind) {
  const keys = FIELD_DEFINITIONS[kind].map((field) => field.key);
  return {
    type: "object",
    properties: {
      fields: {
        type: "array", minItems: keys.length, maxItems: keys.length,
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: keys },
            value: { type: "string", nullable: true },
            evidenceText: { type: "string", nullable: true },
            status: { type: "string", enum: ["extracted", "needs_review", "not_found"] },
          },
          required: ["key", "value", "evidenceText", "status"],
          additionalProperties: false,
        },
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" }, severity: { type: "string", enum: ["error", "warning", "info"] },
            title: { type: "string" }, detail: { type: "string" }, evidence: { type: "string", nullable: true },
          },
          required: ["id", "severity", "title", "detail"],
          additionalProperties: false,
        },
      },
    },
    required: ["fields", "issues"],
    additionalProperties: false,
  };
}

function normalizeGeminiResponse(payload: unknown, kind: AnalyzeKind): AnalyzeResponse {
  if (!payload || typeof payload !== "object") throw new Error("Gemini response is not an object");
  const data = payload as { fields?: unknown; issues?: unknown };
  if (!Array.isArray(data.fields) || !Array.isArray(data.issues)) throw new Error("Gemini response is missing fields or issues");
  const definitions = FIELD_DEFINITIONS[kind];
  if (data.fields.length !== definitions.length) throw new Error("Gemini response has an incomplete field set");
  const definitionByKey = new Map(definitions.map((field) => [field.key, field]));
  const seen = new Set<string>();
  const fields: ExtractedField[] = data.fields.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Gemini field is invalid");
    const field = candidate as Record<string, unknown>;
    const key = typeof field.key === "string" ? field.key : "";
    const definition = definitionByKey.get(key);
    if (!definition || seen.has(key)) throw new Error("Gemini returned an unsupported or duplicated field");
    seen.add(key);
    const value = field.value === null ? null : typeof field.value === "string" ? field.value.trim() : undefined;
    const evidenceText = field.evidenceText;
    const status = field.status;
    if (value === undefined || (evidenceText !== null && typeof evidenceText !== "string")) throw new Error("Gemini field shape is invalid");
    if (value === null) {
      if (evidenceText !== null || status !== "not_found") throw new Error("Gemini not-found field is invalid");
      return { key, label: definition.label, value: null, evidence: null, evidenceText: null, status: "not_found" };
    }
    if (!value || typeof evidenceText !== "string" || !evidenceText || !["extracted", "needs_review"].includes(String(status))) {
      throw new Error("Gemini extracted field lacks source evidence");
    }
    return { key, label: definition.label, value, evidence: evidenceText, evidenceText, status: status as "extracted" | "needs_review" };
  });
  if (seen.size !== definitions.length) throw new Error("Gemini response is missing an allowed field");
  const issues: ReviewIssue[] = data.issues.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Gemini issue is invalid");
    const issue = candidate as Record<string, unknown>;
    if (typeof issue.id !== "string" || typeof issue.title !== "string" || typeof issue.detail !== "string" || !["error", "warning", "info"].includes(String(issue.severity))) {
      throw new Error("Gemini issue shape is invalid");
    }
    return { id: issue.id, severity: issue.severity as ReviewIssue["severity"], title: issue.title, detail: issue.detail, evidence: typeof issue.evidence === "string" ? issue.evidence : undefined, origin: "gemini" };
  });
  return { fields, issues, mode: "gemini", disclaimer: "교육용 가상 원문을 실시간 Gemini로 구조화한 결과입니다. 담당자 원문 대조 전에는 자동 확정하지 않습니다." };
}

function isAnalyzeKind(value: unknown): value is AnalyzeKind {
  return value === "gross" || value === "pathology";
}

function caseTypeForKind(kind: AnalyzeKind): EvaluationCaseType {
  return kind;
}

async function readRequestBody(request: Request) {
  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYZE_REQUEST_BYTES) throw new Error("request_too_large");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_ANALYZE_REQUEST_BYTES) throw new Error("request_too_large");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("invalid_json");
  }
}

function errorResponse(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, analysisState: "live_failed", ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const evaluatedAt = new Date().toISOString();
  try {
    const body = await readRequestBody(request);
    const kind = body.kind;
    if (!isAnalyzeKind(kind)) return errorResponse("분석 유형이 올바르지 않습니다.", 400);

    const publicDeployment = isPublicDeployment();
    const requestedCaseId = typeof body.caseId === "string" ? body.caseId.trim() : "";
    if (publicDeployment && (Object.keys(body).some((key) => key !== "caseId" && key !== "kind") || !requestedCaseId)) {
      return errorResponse("공개 배포에서는 서비스의 고정 평가사례만 분석할 수 있습니다.", 403);
    }

    const selectedCase = requestedCaseId ? findEvaluationCase(requestedCaseId, caseTypeForKind(kind)) : null;
    if (requestedCaseId && !selectedCase) return errorResponse("허용되지 않은 평가사례입니다.", 404);
    const sourceText = selectedCase
      ? selectedCase.inputText
      : typeof body.text === "string" && !publicDeployment
        ? body.text.trim()
        : "";
    if (!sourceText) return errorResponse("분석할 원문 또는 허용된 평가사례가 필요합니다.", 400);
    if (sourceText.length > 20_000) return errorResponse("원문이 허용 길이를 초과했습니다.", 413);
    assertSyntheticInput(sourceText);

    const availability = getGeminiAvailability();
    const caseVersion = selectedCase ? getEvaluationCaseVersion(selectedCase.caseId) : null;
    if (!availability.canAnalyze) {
      return errorResponse("실시간 Gemini 분석 설정이 필요합니다.", 503, { availability: availability.reason, caseVersion, evaluatedAt });
    }

    if (availability.demoMode) {
      const demo = validateEvidence(sourceText, analyzeDemo(sourceText, kind), kind);
      const issues = applyEvaluationCaseReview(selectedCase, demo.fields, demo.issues);
      const fields = applyEvaluationFieldReviewStatus(selectedCase, demo.fields, issues);
      return NextResponse.json({ ...demo, fields, issues, termReviews: buildMedicalTermReviews(fields, kind), model: null, latencyMs: 0, promptVersion: PROMPT_VERSION, caseVersion, evaluatedAt, analysisState: "demo" }, { headers: { "Cache-Control": "no-store" } });
    }

    let rateLimitHeaders: Record<string, string> = {};
    if (publicDeployment) {
      try {
        const rate = await enforceDistributedRateLimit(request, "gemini-analysis");
        rateLimitHeaders = { "X-RateLimit-Remaining": String(rate.remaining), "X-RateLimit-Reset": String(rate.retryAfterSeconds) };
        if (!rate.allowed) return errorResponse("실시간 분석 호출 한도에 도달했습니다. 잠시 후 다시 시도하세요.", 429, { retryAfterSeconds: rate.retryAfterSeconds, caseVersion, evaluatedAt });
      } catch {
        return errorResponse("공개 배포 호출 제한 설정을 확인할 수 없어 실시간 분석을 실행하지 않았습니다.", 503, { caseVersion, evaluatedAt });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return errorResponse("실시간 Gemini 분석 설정이 필요합니다.", 503, { caseVersion, evaluatedAt });
    const model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
    const startedAt = Date.now();
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model,
      contents: [
        "You extract fields from an educational synthetic pathology transcription case.",
        "Extract only exact information explicitly present in the source. Do not infer, diagnose, assign stage, recommend treatment, or confirm results.",
        `Return every allowed field exactly once: ${FIELD_DEFINITIONS[kind].map((field) => field.key).join(", ")}.`,
        "For absent information return value null, evidenceText null, and status not_found. For non-null values, evidenceText must be an exact substring of the source.",
        "Copy pT, pN, pM, and Stage only when explicitly present. Never calculate a stage.",
        `Source text:\n${sourceText}`,
      ].join("\n\n"),
      config: { responseMimeType: "application/json", responseJsonSchema: responseSchemaFor(kind), temperature: 0 },
    });
    const parsed = validateEvidence(sourceText, normalizeGeminiResponse(JSON.parse(response.text ?? "{}"), kind), kind);
    const issues = applyEvaluationCaseReview(selectedCase, parsed.fields, parsed.issues);
    const fields = applyEvaluationFieldReviewStatus(selectedCase, parsed.fields, issues);
    return NextResponse.json({ ...parsed, fields, issues, termReviews: buildMedicalTermReviews(fields, kind), model, latencyMs: Date.now() - startedAt, promptVersion: PROMPT_VERSION, caseVersion, evaluatedAt, analysisState: "live" }, { headers: { "Cache-Control": "no-store", ...rateLimitHeaders } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const safeMessage = process.env.GEMINI_API_KEY ? message.replaceAll(process.env.GEMINI_API_KEY, "[REDACTED]") : message;
    const status = error && typeof error === "object" && "status" in error ? String((error as { status?: unknown }).status ?? "unknown") : "unknown";
    console.error(`[analyze] live analysis failed (status=${status}; message=${safeMessage})`);
    if (message === "request_too_large") return errorResponse("요청 크기가 허용 범위를 초과했습니다.", 413);
    if (message === "invalid_json") return errorResponse("요청 형식이 올바르지 않습니다.", 400);
    return errorResponse("실시간 분석에 실패했습니다. 저장된 예시 결과로 대체하지 않았습니다.", 502, { evaluatedAt });
  }
}
