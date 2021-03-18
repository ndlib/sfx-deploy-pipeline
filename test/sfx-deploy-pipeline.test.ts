import { expect as expectCDK, matchTemplate, MatchStyle, haveResourceLike } from '@aws-cdk/assert'
import { App } from '@aws-cdk/core'
import { SfxDeployPipelineStack } from '../src/sfx-deploy-pipeline-stack'

describe('SFX Pipeline Stack', () => {
  const stack = () => {
    const app = new App()
    return new SfxDeployPipelineStack(app, 'TestSfxPipelineStack', {
      oauthTokenPath: "/all/github/ndlib-git",
      sourceRepoOwner: "ndlib",
      sourceRepository: "sfx",
      sourceBranch: "main",
      networkStackName: "unpeered-network",
      owner: "test",
      contact: "test",
      notifyStackName: "slack-cd-approvals-test-notifier",
    })
  }

  test('creates an S3 artifact bucket', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::S3::Bucket', {}))
  })

  test('creates bucket policy for artifact bucket', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::S3::BucketPolicy', {}))
  })

  test('creates SNS topic', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::SNS::Topic', {}))
  })

  test('creates EC2 SecurityGroup allowing unrestricted egress', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::EC2::SecurityGroup', {
      SecurityGroupEgress: [
        {
         CidrIp: '0.0.0.0/0',
        }
      ]
    }))
  })

  test('creates a CodePipeline pipeline', () => {
    const newStack = stack()
    expectCDK(newStack).to(haveResourceLike('AWS::CodePipeline::Pipeline', {
      Stages: [
        {
          Name: "Source",
          Actions: [
            {
              Name: "SourceCode",
              Configuration: {
                Owner: "ndlib",
                Repo: "sfx",
                Branch: "main",
              }
            },
          ]
        },
        {
          Name: "DeployTest",
          Actions: [
            {
              Name: "TestBuildAndDeploy",
              ActionTypeId: {
                Provider: "CodeBuild",
              },
              Configuration: {
                ProjectName: {
                  Ref: "SfxDeploysfxtest3E9C7473",
                },
              },
            },
            {
              Name: "SmokeTests",
              ActionTypeId: {
                Provider: "CodeBuild",
              },
              Configuration: {
                ProjectName: {
                  Ref: "testSmokeTests6CCB45B8",
                },
              },
            },
            {
              Name: "ManualApproval",
            },
          ]
        },
        {
          Name: "DeployProd",
          Actions: [
            {
              Name: "ProdBuildAndDeploy",
              ActionTypeId: {
                Provider: "CodeBuild",
              },
              Configuration: {
                ProjectName: {
                  Ref: "SfxDeploysfxprod56129770",
                },
              },
            },
            {
              Name: "SmokeTests",
              ActionTypeId: {
                Provider: "CodeBuild",
              },
              Configuration: {
                ProjectName: {
                  Ref: "prodSmokeTests5F7DA03A",
                },
              },
            },
          ]
        },
      ]
    }))
  })

})
