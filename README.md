# sfx-deploy-pipeline

Infrastructure code to deploy SFX code to hosted Ex Libris instance

# Deploy

    cdk deploy
      -c env=${environment}
      -c notifyStackName=${notifier-stack}
