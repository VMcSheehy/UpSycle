#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { NetworkStack } from "../lib/stacks/network-stack";
import { DataStack } from "../lib/stacks/data-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { EmailStack } from "../lib/stacks/email-stack";
import { AppRunnerStack } from "../lib/stacks/apprunner-stack";
import { DnsStack } from "../lib/stacks/dns-stack";
import { CicdStack } from "../lib/stacks/cicd-stack";
import { PlacementStack } from "../lib/stacks/placement-stack";

const app = new cdk.App();

// Every resource in every stack in this app MUST carry this tag so AWS Cost
// Explorer can filter/invoice on it. Applying it at the App level (rather than
// per-stack) guarantees it propagates to every stack and every child construct,
// including ones added later. Capital "Project" to match the cost allocation
// tag key this AWS account already has Active for its other projects
// (flashlocalsocial, foutsdev-website) — AWS cost allocation tags are
// case-sensitive, so a differently-cased key is invisible to Cost Explorer
// until separately activated (lowercase "project" never was).
//
// AWS::AppRunner::Service is excluded: confirmed live (2026-10-23) that its
// CloudFormation resource provider treats ANY tag change as
// replacement-requiring, and replacement fails outright because the new
// service would need the same ServiceName ("upsycle-web") as the still-live
// one it's replacing ("Service with the provided name already exists").
// That live service's tag was fixed once by hand instead (`aws apprunner
// tag-resource`) — CDK must never attempt to manage its tags again, or every
// future deploy touching this stack breaks the same way.
cdk.Tags.of(app).add("Project", "UpSycle", { excludeResourceTypes: ["AWS::AppRunner::Service"] });

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  // us-west-2 is where every stack actually lives (see infra/README.md) —
  // this fallback only kicks in for a local `cdk deploy`/`cdk synth` run
  // without CDK_DEFAULT_REGION set (CI always sets it explicitly via
  // .github/workflows/deploy.yml's aws-region input). Keep this matched to
  // the real deployed region so a bare local run can't silently stand up a
  // second, disconnected copy of the stack set in the wrong region.
  region: process.env.CDK_DEFAULT_REGION ?? "us-west-2",
};

const domainName = app.node.tryGetContext("domainName") ?? "UpSycleMarket.com";
const githubOwner = app.node.tryGetContext("githubOwner") ?? "VMcSheehy";
const githubRepo = app.node.tryGetContext("githubRepo") ?? "UpSycle";
const stripeSecretKeyName = app.node.tryGetContext("stripeSecretKeyName") ?? "upsycle/stripe/secret-key";
const stripeWebhookSecretName =
  app.node.tryGetContext("stripeWebhookSecretName") ?? "upsycle/stripe/webhook-secret";
const stage = String(app.node.tryGetContext("stage") ?? "prod");

function contextBoolean(key: string, fallback: boolean): boolean {
  const raw = app.node.tryGetContext(key);
  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw === "boolean") return raw;
  const text = String(raw).toLowerCase();
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  return fallback;
}

// Multi-AZ is on for production. `-c stage=dev` or `-c multiAz=false` turns it off.
const multiAz = contextBoolean("multiAz", stage === "prod");

const networkStack = new NetworkStack(app, "UpSycle-NetworkStack", {
  env,
  description: "UpSycle: VPC with one NAT, private subnets for App Runner, isolated subnets for RDS",
});

const dataStack = new DataStack(app, "UpSycle-DataStack", {
  env,
  description: "UpSycle: private RDS PostgreSQL (db.t4g.micro), Multi-AZ when stage is prod",
  vpc: networkStack.vpc,
  appRunnerConnectorSecurityGroup: networkStack.appRunnerConnectorSecurityGroup,
  placementLambdaSecurityGroup: networkStack.placementLambdaSecurityGroup,
  multiAz,
});
dataStack.addDependency(networkStack);

const placementStack = new PlacementStack(app, "UpSycle-PlacementStack", {
  env,
  description: "UpSycle: Lambda + EventBridge cron running the weekly Home/Category/Sub-Category featured-placement lottery draw (Saturday) and finalize (Sunday 00:00 UTC)",
  dbSecret: dataStack.dbSecret,
  vpc: networkStack.vpc,
  placementLambdaSecurityGroup: networkStack.placementLambdaSecurityGroup,
});
placementStack.addDependency(dataStack);

const authStack = new AuthStack(app, "UpSycle-AuthStack", {
  env,
  description: "UpSycle: Cognito User Pool (buyer/seller/admin roles) + App Client",
});

const storageStack = new StorageStack(app, "UpSycle-StorageStack", {
  env,
  description: "UpSycle: S3 buckets (product photos, seller vetting photos) + CloudFront",
});

const emailStack = new EmailStack(app, "UpSycle-EmailStack", {
  env,
  description: "UpSycle: SES identity for transactional email (OTP recovery, referral invites)",
  domainName,
});

const appRunnerStack = new AppRunnerStack(app, "UpSycle-AppRunnerStack", {
  env,
  description: "UpSycle: App Runner service running the Next.js app as a Docker container (replaces Amplify Hosting)",
  vpc: networkStack.vpc,
  appRunnerConnectorSecurityGroup: networkStack.appRunnerConnectorSecurityGroup,
  dbSecret: dataStack.dbSecret,
  userPoolId: authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  userPoolArn: authStack.userPool.userPoolArn,
  productPhotosBucket: storageStack.productPhotosBucket,
  sellerVettingPhotosBucket: storageStack.sellerVettingPhotosBucket,
  productPhotosCdnDomain: storageStack.distribution.distributionDomainName,
  stripeSecretKeyName,
  stripeWebhookSecretName,
  siteUrl: `https://${String(domainName).toLowerCase()}`,
  sesIdentityDomain: String(domainName),
});
appRunnerStack.addDependency(dataStack);
appRunnerStack.addDependency(authStack);
appRunnerStack.addDependency(storageStack);

const dnsStack = new DnsStack(app, "UpSycle-DnsStack", {
  env,
  description: "UpSycle: Route 53 hosted zone for UpSycleMarket.com + record to the App Runner service",
  domainName,
  targetDomain: appRunnerStack.serviceUrl,
});
dnsStack.addDependency(appRunnerStack);

const cicdStack = new CicdStack(app, "UpSycle-CicdStack", {
  env,
  description: "UpSycle: GitHub Actions OIDC deploy role (no long-lived AWS keys in GitHub secrets)",
  githubOwner,
  githubRepo,
});
