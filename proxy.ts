import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_TOKEN_COOKIE, ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { refreshCognitoTokens } from "@/lib/cognito-refresh";
import { isJwtExpired } from "@/lib/jwt-expiry";

// Coarse session gate. The ID token cookie expires after about an hour;
// the refresh token lasts 30 days and is exchanged here so a signed-in
// visitor is not sent to /login while that refresh token is still valid.
// Full JWT verification against Cognito's JWKS happens in lib/verify-token.ts.
//
// `/admin` additionally needs an ADMIN UserRole check, which requires a
// Postgres lookup (via lib/auth.ts's requireAdmin()) that can't run here —
// that authorization check happens in app/admin/layout.tsx.
//
// Named `proxy.ts` per Next.js 16's rename of the `middleware.ts` file
// convention (https://nextjs.org/docs/messages/middleware-to-proxy).
const PROTECTED_PREFIXES = [
  "/account",
  "/admin",
  "/sell/products",
  "/sell/sales",
  "/cart",
  "/checkout",
];

const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  const idToken = request.cookies.get(ID_TOKEN_COOKIE)?.value;
  if (idToken && !isJwtExpired(idToken)) {
    return NextResponse.next();
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (refreshToken) {
    try {
      const tokens = await refreshCognitoTokens(refreshToken);
      const nextRefresh = tokens.refreshToken ?? refreshToken;
      request.cookies.set(ID_TOKEN_COOKIE, tokens.idToken);
      request.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken);
      request.cookies.set(REFRESH_TOKEN_COOKIE, nextRefresh);
      const response = NextResponse.next({ request });
      response.cookies.set(ID_TOKEN_COOKIE, tokens.idToken, cookieOptions(tokens.expiresIn));
      response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, cookieOptions(tokens.expiresIn));
      response.cookies.set(REFRESH_TOKEN_COOKIE, nextRefresh, cookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS));
      return response;
    } catch (err) {
      console.error("Session refresh failed", err);
    }
  }

  if (!isProtected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
