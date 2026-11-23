import { NextResponse, type NextRequest } from "next/server";

// Per-process limit. App Runner may run more than one instance, so this
// slows a single process down; it does not replace Cognito's own throttle.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

export function rateLimitResponse(
  request: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const allowed = consumeRateLimit(`${bucket}:${clientIp(request)}`, limit, windowMs);
  if (allowed) return null;
  return NextResponse.json(
    { error: "Too many attempts. Please wait a few minutes and try again." },
    { status: 429 },
  );
}

export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMIT = 10;
export const SIGNUP_LIMIT = 5;
