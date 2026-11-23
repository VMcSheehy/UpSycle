import { NextResponse, type NextRequest } from "next/server";

import { publicAuthError } from "@/lib/auth-errors";
import { logError } from "@/lib/log";
import { AUTH_WINDOW_MS, LOGIN_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { signIn } from "@/lib/cognito";
import { setSessionCookies } from "@/lib/session";

export const dynamic = "force-dynamic";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  const limited = rateLimitResponse(request, "login", LOGIN_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const tokens = await signIn(email, password);
    await setSessionCookies(tokens);
  } catch (err) {
    logError("auth.login", err);
    return NextResponse.json({ error: publicAuthError(err, "login") }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
