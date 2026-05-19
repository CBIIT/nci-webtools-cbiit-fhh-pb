import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";
import {
  createManagedLogGroup,
  resolveDatadogForwarderArn,
  subscribeLogGroupToDatadogForwarder,
} from "./utils/datadog-logging";

export interface ApiGatewayStackProps extends cdk.StackProps {
  listStudiesFunction: lambda.Function;
  listFamiliesFunction: lambda.Function;
  getFamilyFunction: lambda.Function;
  getAnnotationsFunction: lambda.Function;
  writeAnnotationsFunction: lambda.Function;
  sessionsTable: dynamodb.ITable;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer?: apigateway.RequestAuthorizer;
  public readonly authorizerFunction: lambda.Function;
  public readonly callbackFunction: lambda.Function;
  public readonly apiGatewayUrl: string;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";
    const secretName = `${tier}/fhhpb/oidc-config`;
    const forwarderArn = resolveDatadogForwarderArn(this, tier);

    const {
      logGroup: authorizerLogGroup,
      dependency: authorizerLogGroupDep,
    } = createManagedLogGroup(
      this,
      "OidcAuthorizerLogGroup",
      { logGroupName: `/aws/lambda/${tier}-fhhpb-api-oidc-authorizer` },
      tier,
      "lambda",
      { component: "oidc-authorizer" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "OidcAuthorizer",
      authorizerLogGroup,
      forwarderArn,
      authorizerLogGroupDep
    );

    this.authorizerFunction = new lambda.Function(
      this,
      "OidcAuthorizerFunction",
      {
        functionName: `${tier}-fhhpb-api-oidc-authorizer`,
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: "api_authorizer.lambda_handler",
        code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
          bundling: {
            image: lambda.Runtime.PYTHON_3_13.bundlingImage,
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
    this.authorizerFunction.node.addDependency(authorizerLogGroupDep);

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

    const {
      logGroup: callbackLogGroup,
      dependency: callbackLogGroupDep,
    } = createManagedLogGroup(
      this,
      "OidcCallbackLogGroup",
      { logGroupName: `/aws/lambda/${tier}-fhhpb-api-oidc-callback` },
      tier,
      "lambda",
      { component: "oidc-callback" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "OidcCallback",
      callbackLogGroup,
      forwarderArn,
      callbackLogGroupDep
    );

    // OAuth callback function - handles redirect from NIH IdP
    this.callbackFunction = new lambda.Function(this, "OidcCallbackFunction", {
      functionName: `${tier}-fhhpb-api-oidc-callback`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "api_callback.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
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
    this.callbackFunction.node.addDependency(callbackLogGroupDep);

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

    const {
      logGroup: logoutLogGroup,
      dependency: logoutLogGroupDep,
    } = createManagedLogGroup(
      this,
      "OidcLogoutLogGroup",
      { logGroupName: `/aws/lambda/${tier}-fhhpb-api-oidc-logout` },
      tier,
      "lambda",
      { component: "oidc-logout" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "OidcLogout",
      logoutLogGroup,
      forwarderArn,
      logoutLogGroupDep
    );

    const {
      logGroup: extendSessionLogGroup,
      dependency: extendSessionLogGroupDep,
    } = createManagedLogGroup(
      this,
      "OidcExtendSessionLogGroup",
      { logGroupName: `/aws/lambda/${tier}-fhhpb-api-oidc-extend` },
      tier,
      "lambda",
      { component: "oidc-extend" }
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "OidcExtendSession",
      extendSessionLogGroup,
      forwarderArn,
      extendSessionLogGroupDep
    );

    // Creat project specific role for API Gateway
    let permissionBoundary: iam.IManagedPolicy | undefined;
    if (!['dev', 'qa'].includes(tier)) {
      permissionBoundary = iam.ManagedPolicy.fromManagedPolicyName(
        this,
        'PermissionBoundaryPowerUser',
        'PermissionBoundary_PowerUser'
      );
    }
    const s3Policy = iam.ManagedPolicy.fromManagedPolicyName(
      this,
      'PowerUserS3Policy',
      `power-user-s3-policy-${tier}`
    );
    const apiGatewayRole = new iam.Role(this, 'AnalysistoolsApiGatewayRole', {
      roleName: `power-user-analysistools-fhhpb-api-${tier}`,
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      permissionsBoundary: permissionBoundary,
      description: 'API Gateway role for analysistools FHHPB uploads',
    });
    apiGatewayRole.addManagedPolicy(s3Policy);

    // Logout function
    const logoutFunction = new lambda.Function(this, "OidcLogoutFunction", {
      functionName: `${tier}-fhhpb-api-oidc-logout`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "logout.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
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
    logoutFunction.node.addDependency(logoutLogGroupDep);

    // Extend session function
    const extendSessionFunction = new lambda.Function(this, "OidcExtendSessionFunction", {
      functionName: `${tier}-fhhpb-api-oidc-extend`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: "extend_session.lambda_handler",
      code: lambda.Code.fromAsset("../backend/lambda/oidc-auth", {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
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
    extendSessionFunction.node.addDependency(extendSessionLogGroupDep);

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

    // Configure CORS to only allow CloudFront domain
    const corsOrigins = [`https://pedigree-${tier}.cancer.gov`];

    const app = cdk.App.of(this) as cdk.App;
    const executionLoggingLevel =
      tier === "prod"
        ? apigateway.MethodLoggingLevel.ERROR
        : apigateway.MethodLoggingLevel.INFO;
    const dataTraceEnabled =
      (tier === "dev" || tier === "qa") &&
      app.node.tryGetContext("apigwDataTrace") === true;

    const { logGroup: accessLogGroup, dependency: accessLogGroupDep } = createManagedLogGroup(
      this,
      "ApiGatewayAccessLogGroup",
      { logGroupName: `/aws/apigateway/nci-cbiit-fhhpb-api-${tier}/access` },
      tier,
      "apigateway",
      { component: "apigateway-access" }
    );

    const accessLogFormat = apigateway.AccessLogFormat.custom(
      [
        "{",
        `"requestId":"${apigateway.AccessLogField.contextRequestId()}",`,
        `"httpMethod":"${apigateway.AccessLogField.contextHttpMethod()}",`,
        `"resourcePath":"${apigateway.AccessLogField.contextResourcePath()}",`,
        `"status":"${apigateway.AccessLogField.contextStatus()}",`,
        `"protocol":"${apigateway.AccessLogField.contextProtocol()}",`,
        `"responseLatency":"${apigateway.AccessLogField.contextResponseLatency()}",`,
        `"ip":"${apigateway.AccessLogField.contextIdentitySourceIp()}",`,
        `"userAgent":"${apigateway.AccessLogField.contextIdentityUserAgent()}",`,
        `"responseLength":"${apigateway.AccessLogField.contextResponseLength()}"`,
        "}",
      ].join("")
    );

    this.api = new apigateway.RestApi(this, "FhhpbApi", {
      restApiName: `nci-cbiit-fhhpb-api-${tier}`,
      description: "API for Family Health History Pedigree Builder",
      cloudWatchRole: true,
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      defaultCorsPreflightOptions: {
        allowOrigins: corsOrigins,
        allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
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
        loggingLevel: executionLoggingLevel,
        dataTraceEnabled,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(
          accessLogGroup
        ),
        accessLogFormat,
      },
    });

    // API Gateway auto-creates `API-Gateway-Execution-Logs_{restApiId}/{stage}` itself
    // when `loggingLevel` is set on the stage. Declaring it as `AWS::Logs::LogGroup`
    // risks `ResourceAlreadyExistsException` on first deploy. The `restApiId` is dynamic,
    // so the resolver script's static list cannot help. Import-by-name lets us still
    // emit an `AWS::Logs::SubscriptionFilter` that forwards to Datadog, while leaving
    // creation, retention, and tagging of the log group to AWS / out-of-band tooling.
    const executionLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "ApiGatewayExecutionLogGroup",
      `API-Gateway-Execution-Logs_${this.api.restApiId}/api`
    );
    subscribeLogGroupToDatadogForwarder(
      this,
      "ApigwAccess",
      accessLogGroup,
      forwarderArn,
      accessLogGroupDep
    );
    // execution log group is AWS-managed (fromLogGroupName) — no createCR dependency needed
    subscribeLogGroupToDatadogForwarder(
      this,
      "ApigwExec",
      executionLogGroup,
      forwarderArn
    );

    this.authorizer = new apigateway.RequestAuthorizer(this, "OidcAuthorizer", {
      handler: this.authorizerFunction,
      identitySources: [apigateway.IdentitySource.header("Cookie")],
      resultsCacheTtl: cdk.Duration.minutes(5),
      authorizerName: `${tier}-oidc-authorizer`,
    });

    // Create API Key
    const apiKey = new apigateway.ApiKey(this, "FhhpbApiKey", {
      apiKeyName: `${tier}-fhhpb-api-key`,
      description: "API key for upload endpoint access",
    });

    // Create Usage Plan
    const usagePlan = this.api.addUsagePlan("FhhpbUsagePlan", {
      name: `${tier}-fhhpb-usage-plan`,
      description: "Usage plan for FHHPB API",
      apiStages: [
        {
          api: this.api,
          stage: this.api.deploymentStage,
        },
      ],
    });
    usagePlan.addApiKey(apiKey);

    // Create Lambda integrations
    const listStudiesIntegration = new apigateway.LambdaIntegration(
      props.listStudiesFunction
    );
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

    // GET /studies - List all studies
    const studiesResource = this.api.root.addResource("studies");
    studiesResource.addMethod("GET", listStudiesIntegration, {
      apiKeyRequired: false,
      authorizer: this.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
      requestValidator: new apigateway.RequestValidator(
        this,
        "ListStudiesValidator",
        {
          restApi: this.api,
          requestValidatorName: "list-studies-validator",
          validateRequestParameters: true,
        }
      ),
    });

    // GET /families/{study_id} - List families for a study
    const familiesResource = this.api.root.addResource("families");
    const familiesStudyIdResource = familiesResource.addResource("{study_id}");
    familiesStudyIdResource.addMethod("GET", listFamiliesIntegration, {
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
      requestParameters: {
        "method.request.path.study_id": true,
      },
    });

    // GET /family/{study_id}/{family_id} - Get specific family
    const familyResource = this.api.root.addResource("family");
    const familyStudyIdResource = familyResource.addResource("{study_id}");
    const familyIdResource = familyStudyIdResource.addResource("{family_id}");
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
        "method.request.path.study_id": true,
        "method.request.path.family_id": true,
      },
    });

    // GET /annotations/{study_id}/{family_id} - Get annotations for a family
    const annotationsResource = this.api.root.addResource("annotations");
    const annotationsStudyIdResource = annotationsResource.addResource("{study_id}");
    const annotationsFamilyIdResource = annotationsStudyIdResource.addResource("{family_id}");
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
        "method.request.path.study_id": true,
        "method.request.path.family_id": true,
      },
    });

    // POST /annotations/{study_id}/{family_id} - Write annotations for a family
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
        "method.request.path.study_id": true,
        "method.request.path.family_id": true,
      },
    });

    // PUT /upload/{proxy} - Upload objects to S3 raw/ prefix
    const uploadResource = this.api.root.addResource("upload");
    const uploadProxyResource = uploadResource.addResource("{proxy}");
    const uploadApiGatewayRole = iam.Role.fromRoleArn(
      this,
      "UploadApiGatewayRole",
      `arn:aws:iam::${cdk.Stack.of(this).account}:role/power-user-analysistools-fhhpb-api-${tier}`,
      {
        mutable: false,
      }
    );
    const uploadIntegration = new apigateway.AwsIntegration({
      service: "s3",
      path: `nci-cbiit-fhhpb-data-${tier}/raw/{proxy}`,
      integrationHttpMethod: "PUT",
      options: {
        credentialsRole: uploadApiGatewayRole,
        requestParameters: {
          "integration.request.path.proxy": "method.request.path.proxy",
        },
        passthroughBehavior: apigateway.PassthroughBehavior.WHEN_NO_MATCH,
        integrationResponses: [
          {
            statusCode: "200",
          },
        ],
      },
    });
    uploadProxyResource.addMethod("PUT", uploadIntegration, {
      apiKeyRequired: true,
      requestParameters: {
        "method.request.path.proxy": true,
      },
      methodResponses: [
        {
          statusCode: "200",
        },
      ],
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
    this.apiGatewayUrl = executeApiDomain;

    new ssm.StringParameter(this, "ApiGatewayUrlParam", {
      parameterName: `/analysistools/${tier}/fhh-pb/api_gateway_url`,
      stringValue: this.apiGatewayUrl,
      description: "API Gateway domain name for CloudFront origin",
    });

    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "API Gateway URL for the FHHPB application",
      exportName: `${tier}-fhhpb-api-gateway-url`,
    });
  }
}
