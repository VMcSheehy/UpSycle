// Refresh-token exchange that uses fetch only, so the Next.js proxy (which
// must not import the AWS SDK) and the Node session helper can share it.
export interface RefreshedTokens {
  idToken: string;
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}

export async function refreshCognitoTokens(refreshToken: string): Promise<RefreshedTokens> {
  const region = process.env.COGNITO_REGION;
  const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;
  if (!region || !clientId) {
    throw new Error("Cognito is not configured.");
  }

  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  });

  if (!response.ok) {
    throw new Error(`Cognito refresh failed (${response.status}).`);
  }

  const data = (await response.json()) as {
    AuthenticationResult?: {
      IdToken?: string;
      AccessToken?: string;
      ExpiresIn?: number;
      RefreshToken?: string;
    };
  };
  const auth = data.AuthenticationResult;
  if (!auth?.IdToken || !auth.AccessToken) {
    throw new Error("Cognito refresh did not return tokens.");
  }

  return {
    idToken: auth.IdToken,
    accessToken: auth.AccessToken,
    expiresIn: auth.ExpiresIn ?? 3600,
    refreshToken: auth.RefreshToken,
  };
}
