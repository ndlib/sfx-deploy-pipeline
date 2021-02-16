#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { SfxDeployPipelineStack } from '../lib/sfx-deploy-pipeline-stack';

const app = new cdk.App();
new SfxDeployPipelineStack(app, 'SfxDeployPipelineStack');
