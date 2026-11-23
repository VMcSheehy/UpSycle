import { getCognitoErrorMessage } from "@/lib/cognito";

export type AuthSurface = "login" | "signup" | "reset";

function errorName(err: unknown): string | undefined {
  return err instanceof Error ? err.name : undefined;
}

function isThrottle(name: string | undefined): boolean {
  return (
    name === "LimitExceededException" ||
    name === "TooManyRequestsException" ||
    name === "TooManyFailedAttemptsException"
  );
}

// Buyer-facing auth copy. Login and password reset never say whether the
// email is registered. Signup may say the email is taken. The raw Cognito
// or AWS SDK message is never returned.
export function publicAuthError(err: unknown, surface: AuthSurface): string {
  const name = errorName(err);

  if (isThrottle(name)) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  if (surface === "login") {
    if (name === "UserNotConfirmedException") {
      return "Please confirm your email address before signing in.";
    }
    return "Incorrect email or password.";
  }

  if (surface === "reset") {
    return "If an account exists for that email, we sent a reset code.";
  }

  return getCognitoErrorMessage(err);
}

export function authErrorHidesAccount(err: unknown, surface: AuthSurface): boolean {
  const message = publicAuthError(err, surface);
  return !/couldn't find an account|user does not exist|UserNotFound/i.test(message);
}
