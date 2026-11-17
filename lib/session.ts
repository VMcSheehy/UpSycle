import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE, ID_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { refreshCognitoTokens } from "@/lib/cognito-refresh";
import type { SignInResult } from "@/lib/cognito";
import { isJwtExpired } from "@/lib/jwt-expiry";

// MVP session handling: store the Cognito tokens directly in httpOnly
// cookies rather than issuing our own signed session. The ID token is
// already a signed JWT from Cognito (verified in lib/verify-token.ts) so
// there's no need for a separate app-level signing secret. Simple, and
// sufficient for Phase 1 — revisit if we need server-side session
// revocation before the refresh token naturally expires.
const isProd = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  path: "/",
};

const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookies(tokens: SignInResult): Promise<void> {
  const store = await cookies();

  store.set(ID_TOKEN_COOKIE, tokens.idToken, {
    ...baseCookieOptions,
    maxAge: tokens.expiresIn,
  });
  store.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseCookieOptions,
    maxAge: tokens.expiresIn,
  });
  if (tokens.refreshToken) {
    store.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...baseCookieOptions,
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    });
  }
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ID_TOKEN_COOKIE);
  store.delete(ACCESS_TOKEN_COOKIE);
  store.delete(REFRESH_TOKEN_COOKIE);
}

export async function getIdToken(): Promise<string | undefined> {
  const store = await cookies();
  const current = store.get(ID_TOKEN_COOKIE)?.value;
  if (current && !isJwtExpired(current)) return current;

  const refreshToken = store.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return undefined;

  try {
    const tokens = await refreshCognitoTokens(refreshToken);
    try {
      await setSessionCookies({
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? refreshToken,
        expiresIn: tokens.expiresIn,
      });
    } catch (err) {
      // Server Component renders cannot write cookies. The proxy persists
      // them on navigation; this request can still use the new token.
      console.error("Could not persist refreshed session cookies", err);
    }
    return tokens.idToken;
  } catch (err) {
    console.error("Failed to refresh Cognito session", err);
    return undefined;
  }
}
