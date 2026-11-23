import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

/**
 * AuthStack
 *
 * Cognito User Pool (Essentials tier — 10,000 MAU free, per infra plan) that
 * owns credentials/session security for the app. Postgres (see DataStack /
 * prisma/schema.prisma) stores only `cognitoSub` — no passwords.
 *
 * Role model: a person can be a buyer, a seller, and an admin at once.
 * Those roles are Postgres UserRole rows (lib/auth.ts). Cognito groups are
 * not created — the app never read them, and a second role system would
 * drift from the database.
 *
 * A custom `sellerApprovalStatus` attribute is also exposed for quick reads
 * (pending/approved/suspended) without a DB round-trip, mirroring
 * SellerProfile.approvalStatus in prisma/schema.prisma. The seller-vetting
 * workflow's source of truth remains Postgres; this attribute is a
 * convenience mirror only.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, "UpSycleUserPool", {
      userPoolName: "upsycle-user-pool",
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        givenName: { required: false, mutable: true },
        familyName: { required: false, mutable: true },
      },
      customAttributes: {
        // Mirrors SellerProfile.approvalStatus (prisma/schema.prisma) for fast
        // client-side reads; Postgres via SellerProfile remains the source of truth.
        sellerApprovalStatus: new cognito.StringAttribute({ minLen: 1, maxLen: 20, mutable: true }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      // OTP-based account recovery (per infra plan's SES-driven "OTP recovery")
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withCognito(), // swapped to SES (EmailStack identity) once that identity is verified & sending limits raised
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient("NextJsAppClient", {
      userPoolClientName: "upsycle-nextjs-app",
      generateSecret: false, // public client — Next.js app uses Authorization Code + PKCE
      authFlows: {
        userSrp: true,
        // lib/cognito.ts's signIn() calls InitiateAuthCommand with
        // AuthFlowType.USER_PASSWORD_AUTH directly (not the SRP challenge
        // sequence) — this flow must be enabled on the client or every
        // login fails with NotAuthorizedException ("USER_PASSWORD_AUTH
        // flow not enabled for this client"), which the app's error mapping
        // shows as a misleadingly generic "Incorrect email or password."
        userPassword: true,
        custom: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          "http://localhost:3000/api/auth/callback/cognito",
          "https://UpSycleMarket.com/api/auth/callback/cognito",
        ],
        logoutUrls: ["http://localhost:3000", "https://UpSycleMarket.com"],
      },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Hosted UI domain — convenient default; can be swapped for a custom
    // domain under UpSycleMarket.com later if desired.
    this.userPool.addDomain("HostedUiDomain", {
      cognitoDomain: { domainPrefix: "upsycle-auth" },
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
  }
}
