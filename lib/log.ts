// Structured logs for App Runner / CloudWatch. Log the event and a short
// message only — never request bodies, tokens, or Stripe keys.

export function logWarning(event: string, fields: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({ level: "warn", event, ...fields }));
}

export function logInfo(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ level: "info", event, ...fields }));
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : "unknown error";
  console.error(JSON.stringify({ level: "error", event, message, ...fields }));
}
