// Reads the JWT exp claim without verifying the signature. Signature checks
// stay in lib/verify-token.ts. This is only used to decide whether a stored
// token should be refreshed.
export function isJwtExpired(token: string, skewSeconds = 30): boolean {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return true;
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const json =
      typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return true;
    return Date.now() >= (payload.exp - skewSeconds) * 1000;
  } catch {
    return true;
  }
}
