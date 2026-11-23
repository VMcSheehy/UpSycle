import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface CicdStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
}

/**
 * CicdStack
 *
 * Lets GitHub Actions deploy UpSycle-AppRunnerStack on push to `main`,
 * without storing any long-lived AWS credentials as GitHub secrets. Uses
 * OIDC federation: GitHub's workflow-issued token is exchanged for
 * temporary credentials by assuming DeployRole below, scoped by the trust
 * policy's `sub` condition to only this repo's `main` branch (not PRs, not
 * forks, not other branches).
 *
 * The GitHub repository comes from props (default VMcSheehy/UpSycle in
 * bin/infra.ts). The AWS account is this stack's CDK environment, which the
 * GitHub workflow supplies via the AWS_ACCOUNT_ID variable. Neither Don's
 * account nor donfouts/UpSycle is hardcoded here.
 *
 * DeployRole's own policy can only assume the four CDK bootstrap roles in
 * this account and region. It cannot call other AWS APIs directly. The
 * bootstrap CloudFormation execution role is the one that creates resources.
 * UpSycleCloudFormationExecution replaces that role's AdministratorAccess
 * policy. Run infra/scripts/bootstrap-account.sh once, after this stack
 * exists, in Victoria's account. The GitHub trust target is unchanged.
 */
export class CicdStack extends cdk.Stack {
  public readonly deployRole: iam.Role;

  constructor(scope: Construct, id: string, props: CicdStackProps) {
    super(scope, id, props);

    const githubProvider = new iam.OpenIdConnectProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    this.deployRole = new iam.Role(this, "GitHubActionsDeployRole", {
      roleName: "UpSycle-GitHubActionsDeployRole",
      assumedBy: new iam.OpenIdConnectPrincipal(githubProvider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          // Only workflow runs triggered by a push to main on this exact
          // repo can assume this role — not PRs (which use a different sub
          // format, `pull_request`), not forks, not other branches.
          "token.actions.githubusercontent.com:sub": `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/main`,
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    this.deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: [
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-deploy-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-image-publishing-role-${this.account}-${this.region}`,
          `arn:aws:iam::${this.account}:role/cdk-hnb659fds-lookup-role-${this.account}-${this.region}`,
        ],
      })
    );

    const executionPolicy = new iam.ManagedPolicy(this, "CloudFormationExecutionPolicy", {
      managedPolicyName: "UpSycleCloudFormationExecution",
      description:
        "Replaces AdministratorAccess on the CDK CloudFormation execution role. UpSycle services only. No IAM users and no AWS Organizations.",
      statements: executionPolicyStatements(this.account),
    });

    new cdk.CfnOutput(this, "DeployRoleArn", { value: this.deployRole.roleArn });
    new cdk.CfnOutput(this, "ExecutionPolicyArn", { value: executionPolicy.managedPolicyArn });
  }
}

function executionPolicyStatements(account: string): iam.PolicyStatement[] {
  const roleArn = `arn:aws:iam::${account}:role`;
  return [
    new iam.PolicyStatement({
      actions: [
        "ec2:*",
        "rds:*",
        "apprunner:*",
        "lambda:*",
        "logs:*",
        "events:*",
        "cloudfront:*",
        "cognito-idp:*",
        "ses:*",
        "secretsmanager:*",
        "ssm:*",
        "ecr:*",
        "s3:*",
        "kms:*",
        "cloudformation:*",
        "elasticloadbalancing:*",
      ],
      resources: ["*"],
    }),
    new iam.PolicyStatement({
      actions: [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:UpdateRole",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:UpdateAssumeRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:ListRolePolicies",
        "iam:ListAttachedRolePolicies",
        "iam:CreatePolicy",
        "iam:DeletePolicy",
        "iam:GetPolicy",
        "iam:GetPolicyVersion",
        "iam:CreatePolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:ListPolicyVersions",
        "iam:TagPolicy",
        "iam:UntagPolicy",
        "iam:CreateServiceLinkedRole",
      ],
      resources: [
        `${roleArn}/UpSycle-*`,
        `${roleArn}/cdk-*`,
        `${roleArn}/aws-service-role/*`,
        `arn:aws:iam::${account}:policy/UpSycle*`,
        `arn:aws:iam::${account}:policy/cdk-*`,
      ],
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: [
        "iam:CreateUser",
        "iam:DeleteUser",
        "iam:CreateAccessKey",
        "iam:UpdateAccessKey",
        "iam:DeleteAccessKey",
        "iam:CreateLoginProfile",
        "iam:UpdateLoginProfile",
        "organizations:*",
        "account:*",
      ],
      resources: ["*"],
    }),
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ["iam:AttachRolePolicy"],
      resources: ["*"],
      conditions: {
        ArnEquals: {
          "iam:PolicyARN": [
            "arn:aws:iam::aws:policy/AdministratorAccess",
            "arn:aws:iam::aws:policy/IAMFullAccess",
            "arn:aws:iam::aws:policy/PowerUserAccess",
          ],
        },
      },
    }),
  ];
}
