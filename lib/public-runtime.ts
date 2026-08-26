export const PROMPT_VERSION = "public-evaluation-v1";
export const MAX_ANALYZE_REQUEST_BYTES = 2_048;
export const MAX_REFERRAL_REQUEST_BYTES = 1_024;
export const MAX_REFERRAL_FIXTURE_BYTES = 5_000_000;

export function isPublicDeployment() {
  return process.env.PATHOSCRIBE_PUBLIC_DEPLOYMENT === "true" || process.env.VERCEL === "1";
}

export function isDemoMode() {
  return process.env.PATHOSCRIBE_DEMO_MODE !== "false";
}

export function getRedisRestConfiguration() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN,
  };
}

export function hasPublicRateLimitConfiguration() {
  const redis = getRedisRestConfiguration();
  return Boolean(
    redis.url
      && redis.token
      && process.env.PATHOSCRIBE_RATE_LIMIT_SALT,
  );
}

export function getGeminiAvailability() {
  const publicDeployment = isPublicDeployment();
  const demoMode = isDemoMode();
  const apiKeyConfigured = Boolean(process.env.GEMINI_API_KEY);
  const rateLimitConfigured = !publicDeployment || hasPublicRateLimitConfiguration();
  const liveAvailable = !demoMode && apiKeyConfigured && rateLimitConfigured;

  return {
    publicDeployment,
    demoMode,
    apiKeyConfigured,
    rateLimitConfigured,
    liveAvailable,
    canAnalyze: demoMode || liveAvailable,
    reason: demoMode
      ? "demo_mode"
      : !apiKeyConfigured
        ? "gemini_not_configured"
        : !rateLimitConfigured
          ? "rate_limit_not_configured"
          : null,
  };
}
