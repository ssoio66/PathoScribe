export type GeminiFailureKind = "quota" | "upstream" | "timeout" | "schema" | "unknown";

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { message: String(error ?? ""), name: "", status: null, code: "" };
  const candidate = error as { message?: unknown; status?: unknown; code?: unknown; name?: unknown; response?: { status?: unknown } };
  const statusValue = candidate.status ?? candidate.response?.status;
  const status = typeof statusValue === "number" ? statusValue : Number.parseInt(String(statusValue ?? ""), 10);
  return {
    message: typeof candidate.message === "string" ? candidate.message : "",
    name: typeof candidate.name === "string" ? candidate.name : "",
    code: typeof candidate.code === "string" ? candidate.code : String(candidate.code ?? ""),
    status: Number.isFinite(status) ? status : null,
  };
}

export function classifyGeminiFailure(error: unknown): GeminiFailureKind {
  const { message, name, code, status } = errorDetails(error);
  const text = `${name} ${code} ${message}`;
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests/i.test(text)) return "quota";
  if (name === "AbortError" || /timeout|timed out|deadline exceeded|aborted/i.test(text)) return "timeout";
  if (/schema|invalid[ _-]?json|unexpected (?:end|token)|json parse|missing fields|field shape|field evidence|not.?found field/i.test(text)) return "schema";
  if ((status !== null && status >= 500) || /internal|unavailable|overloaded|bad gateway|service unavailable/i.test(text)) return "upstream";
  return "unknown";
}

export function geminiFailureMessage(kind: GeminiFailureKind) {
  switch (kind) {
    case "quota":
      return "무료 API 할당량이 소진되어 실시간 분석을 잠시 사용할 수 없습니다. 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있습니다.";
    case "timeout":
      return "실시간 분석 시간이 초과되었습니다. 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있습니다.";
    case "schema":
      return "실시간 분석 응답 형식을 확인하지 못했습니다. 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있습니다.";
    case "upstream":
      return "Gemini 서비스가 일시적으로 응답하지 않습니다. 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있습니다.";
    default:
      return "실시간 분석에 실패했습니다. 저장된 교육용 사례와 검수 화면은 계속 확인할 수 있습니다.";
  }
}

export function geminiFailureStatus(kind: GeminiFailureKind) {
  switch (kind) {
    case "quota": return 429;
    case "timeout": return 504;
    case "upstream": return 502;
    case "schema": return 502;
    default: return 502;
  }
}

export function geminiFailureLogDetails(error: unknown) {
  const { message, status, code } = errorDetails(error);
  const safeMessage = message.replace(/AIza[\w-]{20,}/g, "[REDACTED]");
  return { status: status ?? "unknown", code: code || "unknown", message: safeMessage || "unknown" };
}
