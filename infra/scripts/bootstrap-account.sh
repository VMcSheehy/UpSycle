#!/usr/bin/env bash
# Attaches UpSycleCloudFormationExecution to this account's CDK bootstrap
# execution role, replacing AdministratorAccess. Run once from an admin
# session in Victoria's account, after `npx cdk deploy UpSycle-CicdStack`.
# Does not change the AWS account id or the GitHub OIDC trust repository.
set -euo pipefail

cd "$(dirname "$0")/.."

ACCOUNT="${CDK_DEFAULT_ACCOUNT:-}"
if [ -z "$ACCOUNT" ]; then
  ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
fi
REGION="${CDK_DEFAULT_REGION:-${AWS_REGION:-us-west-2}}"
POLICY_ARN="arn:aws:iam::${ACCOUNT}:policy/UpSycleCloudFormationExecution"

echo "Bootstrap ${ACCOUNT} in ${REGION} with ${POLICY_ARN}"
npx cdk bootstrap "aws://${ACCOUNT}/${REGION}" \
  --cloudformation-execution-policies "${POLICY_ARN}"
