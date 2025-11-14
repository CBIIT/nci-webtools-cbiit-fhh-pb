import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export class DynamoDBSessionStack extends cdk.Stack {
  public readonly sessionsTable: dynamodb.TableV2;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";

    this.sessionsTable = new dynamodb.TableV2(this, "SessionsTable", {
      tableName: `${tier}-fhhpb-sessions`,
      partitionKey: {
        name: "session_id",
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const tableTags = createTags({ tier, resourceName: "sessions-table" });
    Object.entries(tableTags).forEach(([key, value]) => {
      cdk.Tags.of(this.sessionsTable).add(key, value);
    });

    // Outputs
    new cdk.CfnOutput(this, "SessionsTableName", {
      value: this.sessionsTable.tableName,
      description: "DynamoDB table name for session management",
      exportName: `${tier}-fhhpb-sessions-table-name`,
    });

    new cdk.CfnOutput(this, "SessionsTableArn", {
      value: this.sessionsTable.tableArn,
      description: "DynamoDB table ARN for session management",
      exportName: `${tier}-fhhpb-sessions-table-arn`,
    });
  }
}
