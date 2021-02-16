#!/usr/bin/env node
import 'source-map-support/register'
import { App, Aspects } from '@aws-cdk/core'
import { StackTags } from '@ndlib/ndlib-cdk'
import { SfxDeployPipelineStack } from '../src/sfx-deploy-pipeline-stack'

const app = new App()
const oauthTokenPath = app.node.tryGetContext("oauthTokenPath")
const sourceRepoOwner = app.node.tryGetContext("sourceRepoOwner")
const sourceRepository = app.node.tryGetContext("sourceRepository")
const sourceBranch = app.node.tryGetContext("sourceBranch")
const networkStackName = app.node.tryGetContext("networkStackName")
const owner = app.node.tryGetContext("owner")
const contact = app.node.tryGetContext("contact")
const notifyStackName = app.node.tryGetContext("notifyStackName")

const service = new SfxDeployPipelineStack(app, 'SfxDeploy', {
    oauthTokenPath,
    sourceRepoOwner,
    sourceRepository,
    sourceBranch,
    networkStackName,
    owner,
    contact,
    notifyStackName,
})

// Apply tags to all stacks
Aspects.of(app).add(new StackTags())
