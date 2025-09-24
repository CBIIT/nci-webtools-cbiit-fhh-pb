import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";
import { createTags } from "./utils/tags";

export interface ApiGatewayStackProps extends cdk.StackProps {
  listFamiliesFunction: lambda.Function;
  getFamilyFunction: lambda.Function;
  getAnnotationsFunction: lambda.Function;
  writeAnnotationsFunction: lambda.Function;
  cloudFrontDomainName?: string;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly customDomain?: apigateway.DomainName;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const tier = process.env.TIER || "dev";
    const sslCertificateArn = process.env.SSL_CERTIFICATE_ARN;

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

    const corsOrigins = [
      `https://pedigree-${tier}.cancer.gov`,
      `https://${props.cloudFrontDomainName}`,
    ];

    // Add custom API domain to CORS origins if certificate is available
    if (certificate) {
      corsOrigins.push(`https://${apiDomainName}`);
    }

    // Create consolidated PUBLIC API Gateway
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
          "Authorization", // Required for SAML tokens
          "X-Amz-Date",
          "X-Api-Key",
          "X-Amz-Security-Token",
        ],
        allowCredentials: true, // Important for SAML authentication cookies/tokens
      },
      deployOptions: {
        stageName: "api",
        tracingEnabled: true,
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
      });
    }

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

    // Create API Gateway resources and methods

    // GET /families - List all families
    const familiesResource = this.api.root.addResource("families");
    familiesResource.addMethod("GET", listFamiliesIntegration, {
      apiKeyRequired: false,
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

    // outputs
    new cdk.CfnOutput(this, "ApiGatewayUrl", {
      value: this.api.url,
      description: "API Gateway URL for the FHHPB application",
      exportName: `${tier}-fhhpb-api-gateway-url`,
    });
  }
}
