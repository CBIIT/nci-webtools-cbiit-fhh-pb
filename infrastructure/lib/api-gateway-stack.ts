import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export interface ApiGatewayStackProps extends cdk.StackProps {
  listFamiliesFunction: lambda.Function;
  getFamilyFunction: lambda.Function;
  getAnnotationsFunction: lambda.Function;
  writeAnnotationsFunction: lambda.Function;
  cloudFrontDomainName?: string;
  sessionsTable: dynamodb.ITable;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly customDomain?: apigateway.DomainName;
  public readonly authorizer?: apigateway.RequestAuthorizer;
  public readonly authorizerFunction: lambda.Function;
  public readonly callbackFunction: lambda.Function;
  public readonly apiDomainName: string;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";
    const sslCertificateArn = process.env.SSL_CERTIFICATE_ARN;
    const secretName = `${tier}/fhhpb/oidc-config`;

    const authorizerLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "OidcAuthorizerLogGroup",
      `/aws/lambda/${tier}-fhhpb-api-oidc-authorizer`
    );

    this.authorizerFunction = new lambda.Function(
      this,
      "OidcAuthorizerFunction",
      {
        functionName: `${tier}-fhhpb-api-oidc-authorizer`,
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "api_authorizer.lambda_handler",
        code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
          bundling: {
            image: lambda.Runtime.PYTHON_3_11.bundlingImage,
            platform: "linux/amd64", // Force x86_64 for Lambda
            user: "root",
            command: [
              "bash",
              "-c",
              [
                "pip install -r requirements.txt -t /asset-output --platform manylinux2014_x86_64 --only-binary=:all:",
                "cp -r . /asset-output",
              ].join(" && "),
            ],
          },
        }),
        timeout: cdk.Duration.seconds(10),
        memorySize: 256,
        logGroup: authorizerLogGroup,
      }
    );

    this.authorizerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:us-east-1:${
            cdk.Stack.of(this).account
          }:secret:${secretName}-*`,
        ],
      })
    );

    const callbackLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "OidcCallbackLogGroup",
      `/aws/lambda/${tier}-fhhpb-api-oidc-callback`
    );

    // OAuth callback function - handles redirect from NIH IdP
    this.callbackFunction = new lambda.Function(this, "OidcCallbackFunction", {
      functionName: `${tier}-fhhpb-api-oidc-callback`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "api_callback.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: "linux/amd64", // Force x86_64 for Lambda
          user: "root",
          command: [
            "bash",
            "-c",
            [
              "pip install -r requirements.txt -t /asset-output --platform manylinux2014_x86_64 --only-binary=:all:",
              "cp -r . /asset-output",
            ].join(" && "),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: callbackLogGroup,
      environment: {
        SESSIONS_TABLE_NAME: props.sessionsTable.tableName,
      },
    });

    this.callbackFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:us-east-1:${
            cdk.Stack.of(this).account
          }:secret:${secretName}-*`,
        ],
      })
    );

    const logoutLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "OidcLogoutLogGroup",
      `/aws/lambda/${tier}-fhhpb-api-oidc-logout`
    );

    const extendSessionLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "OidcExtendSessionLogGroup",
      `/aws/lambda/${tier}-fhhpb-api-oidc-extend`
    );

    // Logout function
    const logoutFunction = new lambda.Function(this, "OidcLogoutFunction", {
      functionName: `${tier}-fhhpb-api-oidc-logout`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "logout.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: "linux/amd64",
          user: "root",
          command: [
            "bash",
            "-c",
            [
              "pip install -r requirements.txt -t /asset-output --platform manylinux2014_x86_64 --only-binary=:all:",
              "cp -r . /asset-output",
            ].join(" && "),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: logoutLogGroup,
      environment: {
        SESSIONS_TABLE_NAME: props.sessionsTable.tableName,
      },
    });

    // Extend session function
    const extendSessionFunction = new lambda.Function(this, "OidcExtendSessionFunction", {
      functionName: `${tier}-fhhpb-api-oidc-extend`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "extend_session.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_11.bundlingImage,
          platform: "linux/amd64",
          user: "root",
          command: [
            "bash",
            "-c",
            [
              "pip install -r requirements.txt -t /asset-output --platform manylinux2014_x86_64 --only-binary=:all:",
              "cp -r . /asset-output",
            ].join(" && "),
          ],
        },
      }),
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      logGroup: extendSessionLogGroup,
      environment: {
        SESSIONS_TABLE_NAME: props.sessionsTable.tableName,
      },
    });

    // Grant DynamoDB permissions
    props.sessionsTable.grantReadWriteData(logoutFunction);
    props.sessionsTable.grantReadWriteData(extendSessionFunction);

    // Grant Secrets Manager access
    logoutFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:us-east-1:${cdk.Stack.of(this).account}:secret:${secretName}-*`,
        ],
      })
    );

    extendSessionFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:us-east-1:${cdk.Stack.of(this).account}:secret:${secretName}-*`,
        ],
      })
    );

    // Define custom domain and certificate if SSL certificate ARN is provided
    const apiDomainName = `api-pedigree-${tier}.cancer.gov`;
    let certificate: certificatemanager.ICertificate | undefined;

    if (sslCertificateArn) {
      certificate = certificatemanager.Certificate.fromCertificateArn(
        this,
        "SSLCertificate",
        sslCertificateArn
      );
    }

    const corsOrigins = [`https://pedigree-${tier}.cancer.gov`];

    if (props.cloudFrontDomainName) {
      corsOrigins.push(`https://${props.cloudFrontDomainName}`);
    }

    if (certificate) {
      corsOrigins.push(`https://${apiDomainName}`);
    }

    this.api = new apigateway.RestApi(this, "FhhpbApi", {
      restApiName: `nci-cbiit-fhhpb-api-${tier}`,
      description: "API for Family Health History Pedigree Builder",
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      defaultCorsPreflightOptions: {
        allowOrigins: corsOrigins,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "Cookie",
        ],
        allowCredentials: true,
      },
      deployOptions: {
        stageName: "api",
        tracingEnabled: true,
        throttlingBurstLimit: 500, // Maximum concurrent requests
        throttlingRateLimit: 100, // Requests per second
      },
    });

    // Create custom domain if certificate is available
    if (certificate) {
      this.customDomain = new apigateway.DomainName(this, "ApiCustomDomain", {
        domainName: apiDomainName,
        certificate: certificate,
        endpointType: apigateway.EndpointType.REGIONAL,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });

      // Create base path mapping to connect the custom domain to the API
      new apigateway.BasePathMapping(this, "ApiBasePathMapping", {
        domainName: this.customDomain,
        restApi: this.api,
        stage: this.api.deploymentStage,
        basePath: "api",
      });
    }

    this.authorizer = new apigateway.RequestAuthorizer(this, "OidcAuthorizer", {
      handler: this.authorizerFunction,
      identitySources: [apigateway.IdentitySource.header("Cookie")],
      resultsCacheTtl: cdk.Duration.minutes(5),
      authorizerName: `${tier}-oidc-authorizer`,
    });

    // Create Lambda integrations
    const listFamiliesIntegration = new apigateway.LambdaIntegration(
      props.listFamiliesFunction
    );
    const getFamilyIntegration = new apigateway.LambdaIntegration(
      props.getFamilyFunction
    );
    const getAnnotationsIntegration = new apigateway.LambdaIntegration(
      props.getAnnotationsFunction
    );
    const writeAnnotationsIntegration = new apigateway.LambdaIntegration(
      props.writeAnnotationsFunction,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    // OAuth callback endpoint - receives redirect from NIH IdP
    const callbackIntegration = new apigateway.LambdaIntegration(
      this.callbackFunction,
      { proxy: true } // Enable proxy for proper redirect handling
    );
    const loginResource = this.api.root.addResource("login");
    loginResource.addMethod("GET", callbackIntegration, {
      apiKeyRequired: false,
      // No authorizer on callback endpoint
    });

    // Logout endpoint - GET /api/logout
    const logoutResource = this.api.root.addResource("logout");
    const logoutIntegration = new apigateway.LambdaIntegration(logoutFunction);
    logoutResource.addMethod("GET", logoutIntegration, {
      apiKeyRequired: false,
      // No authorizer - anyone can logout
    });

    // Extend session endpoint - POST /api/extend-session (requires auth)
    const extendSessionResource = this.api.root.addResource("extend-session");
    const extendSessionIntegration = new apigateway.LambdaIntegration(extendSessionFunction);
    extendSessionResource.addMethod("POST", extendSessionIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // Create API Gateway resources and methods

    // GET /families - List all families
    const familiesResource = this.api.root.addResource("families");
    familiesResource.addMethod("GET", listFamiliesIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: new apigateway.RequestValidator(
        this,
        "ListFamiliesValidator",
        {
          restApi: this.api,
          requestValidatorName: "list-families-validator",
          validateRequestParameters: true,
        }
      ),
    });

    // GET /families/{family_id} - Get specific family
    const familyIdResource = familiesResource.addResource("{family_id}");
    familyIdResource.addMethod("GET", getFamilyIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: new apigateway.RequestValidator(
        this,
        "GetFamilyValidator",
        {
          restApi: this.api,
          requestValidatorName: "get-family-validator",
          validateRequestParameters: true,
        }
      ),
      requestParameters: {
        "method.request.path.family_id": true,
      },
    });

    // GET /annotations/{family_id} - Get annotations for a family
    const annotationsResource = this.api.root.addResource("annotations");
    const annotationsFamilyIdResource =
      annotationsResource.addResource("{family_id}");
    annotationsFamilyIdResource.addMethod("GET", getAnnotationsIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: new apigateway.RequestValidator(
        this,
        "GetAnnotationsValidator",
        {
          restApi: this.api,
          requestValidatorName: "get-annotations-validator",
          validateRequestParameters: true,
        }
      ),
      requestParameters: {
        "method.request.path.family_id": true,
      },
    });

    // POST /annotations/{family_id} - Write annotations for a family
    annotationsFamilyIdResource.addMethod("POST", writeAnnotationsIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: new apigateway.RequestValidator(
        this,
        "WriteAnnotationsValidator",
        {
          restApi: this.api,
          requestValidatorName: "write-annotations-validator",
          validateRequestParameters: true,
          validateRequestBody: true,
        }
      ),
      requestParameters: {
        "method.request.path.family_id": true,
      },
    });

    // Add CloudWatch alarms for API Gateway
    new cloudwatch.Alarm(this, "ApiGateway4xxAlarm", {
      metric: this.api.metricClientError(),
      threshold: 10,
      evaluationPeriods: 2,
      alarmDescription: "API Gateway 4xx errors",
    });

    new cloudwatch.Alarm(this, "ApiGateway5xxAlarm", {
      metric: this.api.metricServerError(),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: "API Gateway 5xx errors",
    });

    new cloudwatch.Alarm(this, "ApiGatewayLatencyAlarm", {
      metric: this.api.metricLatency(),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 2,
      alarmDescription: "API Gateway high latency",
    });

    // Add tags
    const apiTags = createTags({ tier, resourceName: "api-gateway" });
    Object.entries(apiTags).forEach(([key, value]) => {
      cdk.Tags.of(this.api).add(key, value);
    });

    const executeApiDomain = cdk.Fn.select(
      2,
      cdk.Fn.split("/", this.api.url)
    );
    this.apiDomainName = executeApiDomain;

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "API Gateway URL for the FHHPB application",
      exportName: `${tier}-fhhpb-api-gateway-url`,
    });

    if (this.customDomain) {
      new cdk.CfnOutput(this, "ApiCustomDomainUrl", {
        value: `https://${apiDomainName}`,
        description: "Custom domain URL for the API Gateway",
        exportName: `${tier}-fhhpb-api-custom-domain-url`,
      });
    }
  }
}
