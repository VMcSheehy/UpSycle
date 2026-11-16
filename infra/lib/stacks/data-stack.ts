import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

export interface DataStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  appRunnerConnectorSecurityGroup: ec2.ISecurityGroup;
  placementLambdaSecurityGroup: ec2.ISecurityGroup;
  /** Defaults on for production. Pass false for a cheaper single-AZ dev database. */
  multiAz: boolean;
}

/**
 * DataStack
 *
 * RDS PostgreSQL in private isolated subnets. It is not publicly accessible.
 * The security group accepts Postgres only from the App Runner VPC connector.
 *
 * Credentials are generated and stored in Secrets Manager by
 * `rds.DatabaseInstance` (via `credentials: rds.Credentials.fromGeneratedSecret(...)`)
 * — never hardcoded here. AppRunnerStack wires individual fields from this
 * secret into the container, and lib/prisma.ts composes DATABASE_URL.
 */
export class DataStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: cdk.aws_secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc: props.vpc,
      description: "UpSycle RDS Postgres — reachable only from the App Runner VPC connector",
      allowAllOutbound: false,
    });
    dbSecurityGroup.addIngressRule(
      props.appRunnerConnectorSecurityGroup,
      ec2.Port.tcp(5432),
      "Postgres from the App Runner VPC connector",
    );
    dbSecurityGroup.addIngressRule(
      props.placementLambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Postgres from the weekly placement Lambda",
    );

    this.dbInstance = new rds.DatabaseInstance(this, "UpSycleDatabase", {
      instanceIdentifier: "upsycle-db",
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_13,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret("upsycle_admin", {
        secretName: "upsycle/rds/postgres-admin",
      }),
      databaseName: "upsycle",
      allocatedStorage: 20,
      storageType: rds.StorageType.GP3,
      multiAz: props.multiAz,
      publiclyAccessible: false,
      backupRetention: cdk.Duration.days(14),
      deleteAutomatedBackups: false,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      storageEncrypted: true,
    });
    this.dbSecret = this.dbInstance.secret!;

    new cdk.CfnOutput(this, "DbEndpoint", { value: this.dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.dbSecret.secretArn });
    new cdk.CfnOutput(this, "DbMultiAz", { value: String(props.multiAz) });
  }
}
