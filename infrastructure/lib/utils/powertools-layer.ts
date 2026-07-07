import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

/**
 * AWS-managed Lambda Powertools layer for Python 3.13 (x86_64).
 * Published by AWS account 017000801446.
 * See: https://docs.powertools.aws.dev/lambda/python/latest/#lambda-layer
 */
const region = "us-east-1";
const python_version = "python313";
const POWERTOOLS_LAYER_ARN = `arn:aws:lambda:${region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-${python_version}-x86_64:33`;

export function getPowertoolsLayer(
  scope: Construct,
  id: string = "PowertoolsLayer",
): lambda.ILayerVersion {
  return lambda.LayerVersion.fromLayerVersionArn(
    scope,
    id,
    POWERTOOLS_LAYER_ARN,
  );
}
