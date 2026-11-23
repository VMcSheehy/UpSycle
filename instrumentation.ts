import { logError } from "@/lib/log";

// Next.js calls this for unhandled server errors. The message is enough for
// CloudWatch; the digest is the id Next shows on the error page.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): Promise<void> {
  logError("request", error, {
    path: request.path,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
  });
}
