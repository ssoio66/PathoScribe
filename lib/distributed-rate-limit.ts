import { createHash } from "node:crypto";
import { getRedisRestConfiguration } from "./public-runtime";

const DEFAULT_LIMIT = 12;
const DEFAULT_WINDOW_SECONDS = 3_600;

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number; remaining: number };

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientIdentifier(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0].trim() || "unknown";
}

function hashedKey(request: Request, scope: string) {
  const salt = process.env.PATHOSCRIBE_RATE_LIMIT_SALT;
  if (!salt) throw new Error("Rate-limit salt is not configured");
  const digest = createHash("sha256").update(`${salt}:${scope}:${clientIdentifier(request)}`).digest("hex");
  return `pathoscribe:rate-limit:${scope}:${digest}`;
}

export async function enforceDistributedRateLimit(request: Request, scope: string): Promise<RateLimitResult> {
  const { url, token } = getRedisRestConfiguration();
  if (!url || !token || !process.env.PATHOSCRIBE_RATE_LIMIT_SALT) {
    throw new Error("Distributed rate limiting is not configured");
  }

  const limit = parsePositiveInteger(process.env.PATHOSCRIBE_RATE_LIMIT_REQUESTS, DEFAULT_LIMIT);
  const windowSeconds = parsePositiveInteger(process.env.PATHOSCRIBE_RATE_LIMIT_WINDOW_SECONDS, DEFAULT_WINDOW_SECONDS);
  const script = "local count=redis.call('INCR', KEYS[1]); if count==1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end; local ttl=redis.call('TTL', KEYS[1]); if count>tonumber(ARGV[1]) then return {0,ttl,count} end; return {1,ttl,count}";
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", script, 1, hashedKey(request, scope), String(limit), String(windowSeconds)]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Distributed rate-limit request failed with HTTP ${response.status}`);
  const payload = await response.json() as { result?: [number, number, number] };
  const [allowed, ttl, count] = payload.result ?? [];
  if (typeof allowed !== "number" || typeof ttl !== "number" || typeof count !== "number") {
    throw new Error("Distributed rate-limit response was invalid");
  }
  return { allowed: allowed === 1, retryAfterSeconds: Math.max(1, ttl), remaining: Math.max(0, limit - count) };
}
