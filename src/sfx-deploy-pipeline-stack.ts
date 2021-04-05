import codebuild = require('@aws-cdk/aws-codebuild')
import { Artifact, Pipeline } from '@aws-cdk/aws-codepipeline'
import { GitHubSourceAction, CodeBuildAction, ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions'
import { Vpc, SecurityGroup } from '@aws-cdk/aws-ec2'
import { PolicyStatement } from '@aws-cdk/aws-iam'
import { Topic } from '@aws-cdk/aws-sns'
import { Secret } from '@aws-cdk/aws-secretsmanager'
import { Construct, Fn, SecretValue, Stack, StackProps } from '@aws-cdk/core'
import { ArtifactBucket, SlackApproval } from '@ndlib/ndlib-cdk'

export interface SfxPipelineStackProps extends StackProps {
  readonly oauthTokenPath: string
  readonly sourceRepoOwner: string
  readonly sourceRepository: string
  readonly sourceBranch: string
  readonly owner: string
  readonly contact: string
  readonly networkStackName: string
  readonly notifyStackName: string
}


export class SfxDeployPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: SfxPipelineStackProps) {
    super(scope, id, props)

    const owner = props.owner || `see stack: ${this.stackName}`
    const contact = props.contact || `see stack: ${this.stackName}`

    // S3 bucket for storing artifacts
    const artifactBucket = new ArtifactBucket(this, 'ArtifactBucket', {})

    // SNS Topic for approvals
    const approvalTopic = new Topic(this, 'ApprovalTopic')

    // Add VPC information as this needs to run out of the peered network
    const vpcId = Fn.importValue(`${props.networkStackName}:VPCID`)
    const vpc = Vpc.fromVpcAttributes(this, 'ImportedVPC', {
      vpcId,
      availabilityZones: [
        // This technically doesn't matter in this context, since none of the resources in this app
        // require AZ for their cloud formations, only subnets. But in the interest of not creating
        // problems for future things that use this IVpc object, I'm recreating how AZs were defined
        // for the subnets in the network stack. In those stacks, we aren't exporting the AZs for
        // Subnet1|2 so this must match the way the subnets were created.
        Fn.select(0, Fn.getAzs()),
        Fn.select(1, Fn.getAzs()),
      ],
      publicSubnetIds: [
        Fn.importValue(`${props.networkStackName}:PublicSubnet1ID`),
        Fn.importValue(`${props.networkStackName}:PublicSubnet2ID`),
      ],
      privateSubnetIds: [
        Fn.importValue(`${props.networkStackName}:PrivateSubnet1ID`),
        Fn.importValue(`${props.networkStackName}:PrivateSubnet2ID`),
      ],
    })

    const sfxDeploySecurityGroup = new SecurityGroup(this, 'SfxDeploySecurityGroup', { vpc, allowAllOutbound: true })

    // Retrieve source
    const sourceArtifact = new Artifact('SourceCode')
    const sourceAction = new GitHubSourceAction({
      actionName: 'SourceCode',
      branch: props.sourceBranch,
      oauthToken: SecretValue.secretsManager(props.oauthTokenPath, { jsonField: 'oauth' }),
      output: sourceArtifact,
      owner: props.sourceRepoOwner,
      repo: props.sourceRepository,
    })

    const buildHelper = (namespace: string) => {
      return new codebuild.PipelineProject(this, `SfxDeploy_${props.sourceRepository}_${namespace}`, {
        vpc: vpc,
        securityGroups: [
          sfxDeploySecurityGroup,
        ],
        buildSpec: codebuild.BuildSpec.fromObject({
          env: {
            shell: 'bash',
          },
          phases: {
            build: {
              commands: [
                'apt-get update -qq',
                'apt-get install -y rsync sshpass netcat',
                'curl -sS ifconfig.co',
                'curl -sSI $REMOTE_HOST',
                'pwd',
                'cd $CODEBUILD_SRC_DIR/',
                'pwd',
                'nc -w 5 $REMOTE_HOST $REMOTE_PORT && sshpass -e rsync -a -e "ssh -oStrictHostKeyChecking=no -p $REMOTE_PORT" $LOCAL_PATH/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH',
              ]
            }
          },
          version: '0.2',
        }),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
          computeType: codebuild.ComputeType.SMALL,
        },
        environmentVariables: {
          LOCAL_PATH: {
            value: `/all/sfx/ftp/localpath`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          REMOTE_HOST: {
            value: `/all/sfx/ftp/hostname`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          REMOTE_PORT: {
            value: `/all/sfx/ftp/port`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          REMOTE_USER: {
            value: `/all/sfx/ftp/${namespace}/username`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          SSHPASS: {
            value: `/all/sfx/ftp/${namespace}/password`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          REMOTE_PATH: {
            value: `/all/sfx/ftp/${namespace}/path`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
        }
      })
    }

    const smokeTestHelper = (namespace: string) => {
      return new codebuild.PipelineProject(this, `${namespace}-SmokeTests`, {
        buildSpec: codebuild.BuildSpec.fromObject({
          phases: {
            build: {
              commands: [
                `newman run spec/SFX.postman_collection.json --folder Smoke --env-var REMOTE_HOST=$REMOTE_HOST --env-var REMOTE_PATH=$REMOTE_PATH`,
              ],
            },
          },
          version: '0.2',
        }),
        environment: {
          buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('postman/newman', {
            secretsManagerCredentials: Secret.fromSecretNameV2(this, `${namespace}-DockerhubCredentials`, '/all/dockerhub/credentials'),
          }),
        },
        environmentVariables: {
          REMOTE_PATH: {
            value: `/all/sfx/web/${namespace}/path`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
          REMOTE_HOST: {
            value: `/all/sfx/web/hostname`,
            type: codebuild.BuildEnvironmentVariableType.PARAMETER_STORE,
          },
        }
      })
    }

    const testBuild = buildHelper(`test`)
    testBuild.addToRolePolicy(new PolicyStatement({
      actions: [
        'ssm:GetParameters',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sfx/ftp/*'),
      ],
    }))

    const prodBuild = buildHelper(`prod`)
    prodBuild.addToRolePolicy(new PolicyStatement({
      actions: [
        'ssm:GetParameters',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sfx/ftp/*'),
      ],
    }))

    const testSmokeTest = smokeTestHelper(`test`)
    testSmokeTest.addToRolePolicy(new PolicyStatement({
      actions: [
        'ssm:GetParameters',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sfx/web/*'),
      ],
    }))

    const prodSmokeTest = smokeTestHelper(`prod`)
    testSmokeTest.addToRolePolicy(new PolicyStatement({
      actions: [
        'ssm:GetParameters',
      ],
      resources: [
        Fn.sub('arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/all/sfx/web/*'),
      ],
    }))

    const slackApproval = new SlackApproval(this, 'SlackApproval', {
      approvalTopic,
      notifyStackName: props.notifyStackName,
    })

    const testSfxDeployAction= new CodeBuildAction({
      input: sourceArtifact,
      project: testBuild,
      actionName: 'TestBuildAndDeploy',
      runOrder: 1,
    })

    const prodSfxDeployAction = new CodeBuildAction({
      input: sourceArtifact,
      project: prodBuild,
      actionName: 'ProdBuildAndDeploy',
      runOrder: 1,
    })

    const testSmokeTestsAction = new CodeBuildAction({
      input: sourceArtifact,
      project: testSmokeTest,
      actionName: 'SmokeTests',
      runOrder: 98,
    })

    const prodSmokeTestsAction = new CodeBuildAction({
      input: sourceArtifact,
      project: prodSmokeTest,
      actionName: 'SmokeTests',
      runOrder: 99,
    })

    const slackApprovalAction = new ManualApprovalAction({
      actionName: 'ManualApproval',
      additionalInformation: `A new version of https://github.com/ndlib/sfx has been deployed to https://findtext.library.nd.edu/ndu_test and is awaiting your approval. If you approve these changes, they will be deployed to https://findtext.library.nd.edu/ndu_local.`,
      notificationTopic: approvalTopic,
      runOrder: 99,
    })

    const pipeline = new Pipeline(this, 'SfxDeployPipeline', {
      artifactBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        },
        {
          stageName: 'DeployTest',
          actions: [testSfxDeployAction, testSmokeTestsAction, slackApprovalAction],
        },
        {
          stageName: 'DeployProd',
          actions: [prodSfxDeployAction, prodSmokeTestsAction],
        },
      ]
    })
  }
}
