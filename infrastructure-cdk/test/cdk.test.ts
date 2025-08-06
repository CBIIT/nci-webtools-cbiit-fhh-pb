import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudFrontS3Stack } from '../lib/cloudfront-s3-stack';
import { LambdaJsonProcessorStack } from '../lib/lambda-json-processor-stack';

describe('CloudFrontS3Stack', () => {
  test('S3 Bucket and CloudFront Distribution Created', () => {
    const app = new cdk.App();
    const stack = new CloudFrontS3Stack(app, 'MyTestCloudFrontS3Stack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const template = Template.fromStack(stack);

    // Check that S3 bucket is created with correct properties
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      WebsiteConfiguration: {
        IndexDocument: 'templates/index.html',
        ErrorDocument: 'templates/index.html',
      },
    });

    // Check that CloudFront distribution is created
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: {
          ViewerProtocolPolicy: 'redirect-to-https',
        },
        PriceClass: 'PriceClass_100',
        DefaultRootObject: '/html/index.html',
      },
    });

    // Check that outputs are created
    template.hasOutput('BucketName', {});
    template.hasOutput('WebsiteURL', {});
    template.hasOutput('DistributionURL', {});
    template.hasOutput('DistributionId', {});
  });
});

describe('LambdaJsonProcessorStack', () => {
  test('Lambda Function and S3 Bucket Created', () => {
    const app = new cdk.App();
    const stack = new LambdaJsonProcessorStack(app, 'MyTestLambdaStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const template = Template.fromStack(stack);

    // Check that S3 bucket is created with correct properties
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: {
        Status: 'Enabled',
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });

    // Check that Lambda function is created
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'python3.9',
      Handler: 'lambda_function.lambda_handler',
      Timeout: 300,
      MemorySize: 512,
    });

    // Check that IAM role is created
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
          },
        ],
      },
    });

    // Check that CloudWatch alarms are created
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Errors',
      Threshold: 1,
      EvaluationPeriods: 1,
    });

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      MetricName: 'Duration',
      Threshold: 240000,
      EvaluationPeriods: 2,
    });

    // Check that outputs are created
    template.hasOutput('LambdaFunctionName', {});
    template.hasOutput('DataBucketName', {});
    template.hasOutput('LambdaFunctionArn', {});
  });
});
