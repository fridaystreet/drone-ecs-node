# drone-ecs-node

[![Build Status](http://beta.drone.io/api/badges/drone-plugins/drone-ecs/status.svg)](http://beta.drone.io/drone-plugins/drone-ecs)
[![](https://badge.imagelayers.io/fridaystreet/drone-ecs-node:latest.svg)](https://imagelayers.io/?images=fridaystreet/drone-ecs-node:latest 'Get your own badge on imagelayers.io')

Drone plugin to deploy or update a project on AWS ECS. This has been model on the original drone-ecs plugin written in go, thanks to the drone team for their efforts and open sourcing their sofwtare.

The original plugin while fully functional had not been designed or intended to be used with environments setup using cloud formation or complex ecs clusters with multiple servcies, tasks and multiple containers in task definitions. This plugin is intended to preserve existing configurations and handle the dynamic nature of cloudformation resources by using wildcards instead of fixed names. You can still use this plugin and the added config features with fixed names as well. It works exactly the same for both setups.

Another challenge with cloudformation is the management of enviornment variables. The are scenarios where environment variables for task deifnitions that point to other resources are set dynamically when the cloudformation script is run. Having to maintain these variable values manually in the drone.yml is not practical.

This plugin handles this situation by first retrieving the existing task definitions and using them as a template for the new definition. This way the configuration is preserved from the initial cloudformation deployment through subsequent drone deployments. In order to update the configuration, the plugin provides the ability to make changes to explicit parts of the configuration as required through the drone.yml file, while leaving the remaining configuration in tact.

Full examples of all functionality are available below.

This plugin hasn't been extensively tested. We do have a fairly complex ecs environment which covers all the scenarios the plugin can handle. Over the coming months more and more testing will take place.

If you find it useful and want to contribute, pull requests are more than welcome. I'll do my best to address any issues as quickly as possible, but please bear in mind, we built this to address a pressing need in our business. Our core business project is our current focus, so for larger issues or feature requests, unless they are impacting us or of value to our project regrettably at the present time I can't give them much priority.

See DOCS.md for full instructions

##Development

### Install
```
npm install
```

### Example

(these aren't real aws keys btw)

```
node app.js -- '{"repo":{"clone_url":"git://github.com/drone/drone","owner":"drone","name":"drone","full_name":"drone/drone"},"system":{"link_url":"https://beta.drone.io"},"build":{"number":22,"status":"success","started_at":1421029603,"finished_at":1421029813,"message":"UpdatetheReadme","author":"johnsmith","author_email":"john.smith@gmail.com","event":"push","branch":"master","commit":"436b7a6e2abaddfd35740527353e78a227ddcb2c","ref":"refs/heads/master"},"workspace":{"root":"/drone/src","path":"/drone/src/github.com/drone/drone"},"vargs":{"build":"","repo":"","access_key":"AKIAGDHD65JEJZU6NA","secret_key":"JHGDjhgsd78678hjgdjgTYRT6467582kjhDkhmF","region":"ap-southeast-2","family":"CoreProduction-DashboardTaskDefinition","cluster":"CoreProduction-ServicesCluster","service":"CoreProduction-DashboardService","constainer_names":["dashboard"],"allow_multiple_clusters":false,"allow_multiple_services":false,"image_name":"registry.mydomain.com.au/dashboard-development","image_tag":"1.0.1","log_level":"debug","task_definition":null, "desired_count": 2, "deployment_configuration":{"maximum_percent": 200, "minimum_healthy_percent": 0}, "disable_dry_run":false}}'

Friendly version

{"repo": {"clone_url": "git://github.com/drone/drone","owner": "drone","name": "drone",
        "full_name": "drone/drone"
    },
    "system": {
        "link_url": "https://beta.drone.io"
    },
    "build": {
        "number": 22,
        "status": "success",
        "started_at": 1421029603,
        "finished_at": 1421029813,
        "message": "Update the Readme",
        "author": "johnsmith",
        "author_email": "john.smith@gmail.com"
        "event": "push",
        "branch": "master",
        "commit": "436b7a6e2abaddfd35740527353e78a227ddcb2c",
        "ref": "refs/heads/master"
    },
    "workspace": {
        "root": "/drone/src",
        "path": "/drone/src/github.com/drone/drone"
    },
    "vargs": {
      "build": "",
      "repo": "",
      "access_key": "AHGDGJHhJ8677A2Q",
      "secret_key": "IrlHJHGShjgsgsdgJHGSjhgsdgJJGU8JTRhSb",
      "region": "ap-southeast-2",
      "family": "Development-DashboardTaskDefinition",
      "cluster": "Development-ServicesCluster",
      "service": "Development-DashboardService",
      "constainer_names": ["dashboard"],
      "allow_multiple_clusters": false,
      "allow_multiple_services": false,
      "image_name": "registry.mydomain.com.au/dashboard-development",
      "image_tag": "1.0.1",
      "log_level": "debug",
      "task_definition": null,
      "desired_count": 2,
      "deployment_configuration"{
        "maximum_percent": 100,
        "minimum_healthy_percent": 50
      },
      "disable_dry_run":false
    }
}

