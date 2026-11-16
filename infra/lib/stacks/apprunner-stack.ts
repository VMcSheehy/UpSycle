import * as cdk from "aws-cdk-lib";
import * as apprunner from "aws-cdk-lib/aws-apprunner";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import * as path from "path";

export interface AppRunnerStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appRunnerConnectorSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
  userPoolId: string;
  userPoolClientId: string;
  userPoolArn: string;
  productPhotosBucket: s3.IBucket;
  sellerVettingPhotosBucket: s3.IBucket;
  /** CloudFront domain fronting productPhotosBucket (see storage-stack.ts) —
   * the bucket itself blocks all public access, so uploaded photo URLs must
   * be built from this domain, never the bucket's own S3 URL. */
  productPhotosCdnDomain: string;
  /** Names of existing Secrets Manager secrets. Values are not in this repo. */
  stripeSecretKeyName: string;
  stripeWebhookSecretName: string;
  /** Fixed public origin for Stripe return URLs. Not taken from request headers. */
  siteUrl: string;
}

/**
 * AppRunnerStack
 *
 * Replaces HostingStack (AWS Amplify Hosting, removed) as the Next.js SSR
 * compute layer. Switched after extensive troubleshooting established that
 * Amplify's Web Compute runtime never reliably delivered environment
 * variables OR IAM role credentials to the running Next.js process — every
 * configuration tried failed the same way (see the deleted hosting-stack.ts
 * in git history for the full account: app-level vars, branch-level vars,
 * an IAM service role, a console-based edit + explicit redeploy, an IAM
 * "compute role" + Secrets Manager fetch at runtime — which hit
 * `CredentialsProviderError`, meaning that runtime doesn't expose IAM
 * credentials via the standard AWS SDK chain at all — and even a full fresh
 * recreation of the Amplify app).
 *
 * App Runner uses the same well-established credential/env-var mechanisms as
 * ECS/Fargate task roles — mature, standard, and (confirmed locally via
 * `docker run` against the real RDS instance before writing this stack)
 * actually works.
 *
 * Deploys a Docker image (see ../../../Dockerfile) built and pushed to an
 * auto-managed ECR repo during `cdk deploy` via DockerImageAsset.
 * `autoDeploymentsEnabled: false` — there's no GitHub-triggered CI/CD for
 * this yet (unlike Amplify's native GitHub integration); a follow-up GitHub
 * Actions workflow that runs `cdk deploy` on push is the natural next step
 * (tracked alongside issue #25).
 *
 * Instance size is 0.5 vCPU / 1 GB. App Runner pairs 1 GB of memory with at
 * least 0.5 vCPU. There is no scale-to-zero, so this is a modest always-on cost.
 */
export class AppRunnerStack extends cdk.Stack {
  public readonly service: apprunner.CfnService;
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props: AppRunnerStackProps) {
    super(scope, id, props);

    const image = new ecrAssets.DockerImageAsset(this, "AppImage", {
      directory: path.join(__dirname, "..", "..", ".."),
      file: "Dockerfile",
    });

    // Lets App Runner pull the built image from ECR.
    const accessRole = new iam.Role(this, "AppRunnerAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    image.repository.grantPull(accessRole);

    // The running container's actual runtime identity — grants the
    // permissions application code needs when it calls AWS APIs directly
    // (S3 presigned uploads via lib/s3.ts, Cognito via lib/cognito.ts).
    const instanceRole = new iam.Role(this, "AppRunnerInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
    });
    // App Runner resolves `runtimeEnvironmentSecrets` (below) using THIS
    // role, not the access role — without this grant, deployment fails at
    // initialization with "unable to pull secrets ... AccessDeniedException"
    // before the container even starts (confirmed the hard way).
    props.dbSecret.grantRead(instanceRole);
    props.productPhotosBucket.grantReadWrite(instanceRole);
    props.sellerVettingPhotosBucket.grantReadWrite(instanceRole);
    // AdminGetUser + AdminDeleteUser are required to roll back a signup when
    // Postgres fails after Cognito creates the user. Both are limited to this
    // user pool, and the app only deletes users whose status is UNCONFIRMED.
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:SignUp",
          "cognito-idp:ConfirmSignUp",
          "cognito-idp:ResendConfirmationCode",
          "cognito-idp:InitiateAuth",
          "cognito-idp:ForgotPassword",
          "cognito-idp:ConfirmForgotPassword",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDeleteUser",
        ],
        resources: [props.userPoolArn],
      })
    );

    const stripeSecretKey = secretsmanager.Secret.fromSecretNameV2(
      this,
      "StripeSecretKey",
      props.stripeSecretKeyName,
    );
    const stripeWebhookSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "StripeWebhookSecret",
      props.stripeWebhookSecretName,
    );
    stripeSecretKey.grantRead(instanceRole);
    stripeWebhookSecret.grantRead(instanceRole);

    const vpcConnector = new apprunner.CfnVpcConnector(this, "VpcConnector", {
      vpcConnectorName: "upsycle-apprunner",
      subnets: props.vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }).subnetIds,
      securityGroups: [props.appRunnerConnectorSecurityGroup.securityGroupId],
    });

    this.service = new apprunner.CfnService(this, "UpSycleAppRunnerService", {
      serviceName: "upsycle-web",
      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        autoDeploymentsEnabled: false,
        imageRepository: {
          imageIdentifier: image.imageUri,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3000",
            runtimeEnvironmentVariables: [
              { name: "COGNITO_REGION", value: this.region },
              { name: "COGNITO_USER_POOL_ID", value: props.userPoolId },
              { name: "COGNITO_USER_POOL_CLIENT_ID", value: props.userPoolClientId },
              { name: "PHOTOS_BUCKET_NAME", value: props.productPhotosBucket.bucketName },
              { name: "PHOTOS_CDN_DOMAIN", value: props.productPhotosCdnDomain },
              { name: "SELLER_VETTING_BUCKET_NAME", value: props.sellerVettingPhotosBucket.bucketName },
              { name: "SITE_URL", value: props.siteUrl },
            ],
            // DATABASE_URL can't be handed over as one composed connection
            // string — Secrets Manager ARN references extract a single JSON
            // key, not a template. lib/prisma.ts composes the URL from
            // these decomposed fields when DATABASE_URL itself isn't set.
            runtimeEnvironmentSecrets: [
              { name: "DB_HOST", value: `${props.dbSecret.secretArn}:host::` },
              { name: "DB_PORT", value: `${props.dbSecret.secretArn}:port::` },
              { name: "DB_USERNAME", value: `${props.dbSecret.secretArn}:username::` },
              { name: "DB_PASSWORD", value: `${props.dbSecret.secretArn}:password::` },
              { name: "DB_NAME", value: `${props.dbSecret.secretArn}:dbname::` },
              { name: "STRIPE_SECRET_KEY", value: stripeSecretKey.secretArn },
              { name: "STRIPE_WEBHOOK_SECRET", value: stripeWebhookSecret.secretArn },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: "0.5 vCPU",
        memory: "1 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      networkConfiguration: {
        egressConfiguration: {
          egressType: "VPC",
          vpcConnectorArn: vpcConnector.attrVpcConnectorArn,
        },
      },
      healthCheckConfiguration: {
        protocol: "HTTP",
        path: "/api/health",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
      // Pinned to exactly what's already live on this resource (set by the
      // original app-level Tags aspect, back when it used lowercase
      // "project") and deliberately excluded from that aspect now
      // (bin/infra.ts) -- confirmed live (2026-10-23) that *any* Tags change
      // on AWS::AppRunner::Service forces CloudFormation to replace it, and
      // the replacement fails immediately on the ServiceName colliding with
      // the still-live original ("Service with the provided name already
      // exists: upsycle-web"). Must stay byte-identical to the live tag
      // forever, or the next deploy breaks the same way. The actual
      // "Project" cost-allocation tag was added to this one resource by hand
      // instead (`aws apprunner tag-resource`), out of band from CDK.
      tags: [{ key: "project", value: "UpSycle" }],
    });

    const fiveXx = new cloudwatch.Metric({
      namespace: "AWS/AppRunner",
      metricName: "5xxStatusResponses",
      dimensionsMap: {
        ServiceName: "upsycle-web",
        ServiceID: this.service.attrServiceId,
      },
      statistic: "Sum",
      period: cdk.Duration.minutes(5),
    });
    new cloudwatch.Alarm(this, "AppRunner5xxAlarm", {
      metric: fiveXx,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "UpSycle App Runner returned one or more 5xx responses in five minutes.",
    });

    this.serviceUrl = this.service.attrServiceUrl;
    new cdk.CfnOutput(this, "AppRunnerServiceUrl", { value: `https://${this.serviceUrl}` });
  }
}
