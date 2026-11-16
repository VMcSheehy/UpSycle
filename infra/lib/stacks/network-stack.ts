import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

/**
 * NetworkStack
 *
 * RDS lives in private isolated subnets and is not reachable from the
 * internet. App Runner reaches it through a VPC connector placed in private
 * subnets that have a single NAT gateway, so the app can still call Stripe,
 * Cognito, and the rest of the public internet. The NAT is the cost of
 * keeping the database private (about $33/month plus data). There is no
 * second NAT.
 *
 * An S3 gateway endpoint (free) lets anything in the VPC reach S3 without
 * using the NAT for that traffic.
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  /** Attached to the App Runner VPC connector. The database allows this group. */
  public readonly appRunnerConnectorSecurityGroup: ec2.SecurityGroup;
  /** Weekly placement Lambda. The database allows this group as well. */
  public readonly placementLambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "UpSycleVpc", {
      vpcName: "upsycle-vpc",
      // Two AZs so the RDS subnet group is valid even when the instance is single-AZ.
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "app-private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "rds-private-isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.appRunnerConnectorSecurityGroup = new ec2.SecurityGroup(this, "AppRunnerConnectorSecurityGroup", {
      vpc: this.vpc,
      description: "App Runner VPC connector. Allowed to reach RDS.",
      allowAllOutbound: true,
    });

    this.placementLambdaSecurityGroup = new ec2.SecurityGroup(this, "PlacementLambdaSecurityGroup", {
      vpc: this.vpc,
      description: "Weekly placement Lambda. Allowed to reach RDS.",
      allowAllOutbound: true,
    });

    this.vpc.addGatewayEndpoint("S3GatewayEndpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    new cdk.CfnOutput(this, "VpcId", { value: this.vpc.vpcId });
  }
}
