# sfx-deploy-pipeline

Infrastructure code to deploy SFX code to hosted Ex Libris instance

# Parameters

There are a handful of parameters stored in AWS Parameter Store:

| Variable | Description |
| --- | --- |
| `/all/sfx/ftp/${env}/username` | `${env}` FTP username |
| `/all/sfx/ftp/${env}/password` | `${env}` FTP password |
| `/all/sfx/ftp/${env}/path` | `${env}` FTP file path |
| `/all/sfx/ftp/hostname` | FTP hostname/IP |
| `/all/sfx/ftp/port` | FTP remote port |
| `/all/sfx/ftp/localpath` | Local path relative to repository root that should be copied to remote |
| `/all/sfx/web/hostname` | Web hostname to access SFX |
| *`/all/sfx/web/test/path` | Web path to access SFX test environment |
| *`/all/sfx/web/prod/path` | Web path to access SFX production environment |

  \* Note: these paths are hard-coded in the chat message sent out for deploy approval.  If they change, that message should be updated and the stack should be redeployed.

# Deploy

    cdk deploy
      -c env=${environment}
      -c notifyStackName=${notifier-stack}
