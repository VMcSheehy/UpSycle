import { NextResponse, type NextRequest } from "next/server";

import { publicAuthError } from "@/lib/auth-errors";
import { forgotPassword } from "@/lib/cognito";
import { logError } from "@/lib/log";
import { AUTH_WINDOW_MS, SIGNUP_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

interface ForgotPasswordBody {
  email?: string;
}

export async function POST(request: NextRequest) {
  const limited = rateLimitResponse(request, "forgot-password", SIGNUP_LIMIT, AUTH_WINDOW_MS);
  if (limited) return limited;

  let body: ForgotPasswordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    await forgotPassword(body.email);
  } catch (err) {
    const message = publicAuthError(err, "reset");
    if (message.startsWith("Too many attempts")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    // Same response whether or not the email is registered.
    logError("auth.forgot-password", err);
  }

  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, we sent a reset code.",
  });
}
