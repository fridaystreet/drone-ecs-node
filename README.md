# drone-ecs-node

[![Build Status](http://beta.drone.io/api/badges/drone-plugins/drone-ecs/status.svg)](http://beta.drone.io/drone-plugins/drone-ecs)
[![Coverage Status](https://aircover.co/badges/drone-plugins/drone-ecs/coverage.svg)](https://aircover.co/drone-plugins/drone-ecs)
[![](https://badge.imagelayers.io/plugins/drone-ecs:latest.svg)](https://imagelayers.io/?images=plugins/drone-ecs:latest 'Get your own badge on imagelayers.io')

Drone plugin to deploy or update a project on AWS ECS. This has been model on the original drone-ecs plugin written in go, thanks to the drone team for their efforts and open sourcing their sofwtare. 

The original plugin while fully functional had not been designed or intended to be used with environments setup using cloud formation or complex ecs clusters with multiple servcies, tasks and multiple containers in task definitions. This plugin is intended to preserve existing configurations and handle the dynamic nature of cloudformation resources by using wildcards instead of fixed names. You can still use this plugin and the added config features with fixed names as well. It works exactly the same for both setups.

Another challenge with cloudformation is the management of enviornment variables. The are scenarios where environment variables for task deifnitions that point to other resources are set dynamically when the cloudformation script is run. Having to maintain these variable values manually in the drone.yml is not practical. 

This plugin handles this situation, by first retrieving the existing task definitions and using them as a template for the new definition. This way the configuration is preserved from the initial cloudformation deployment through subsequent drone deployments. In order to update the configuration, the plugin provides the ability to make changes to explicit parts of the configuration as required the configuration through the drone.yml file, while leaving the remaining configuration in tact. 

Full examples of all functionality are available below.

This plugin hasn't been extensively tested. We do have a fairly complex ecs environment which covers all the scenarios the plugin can handle. Over the coming months more and more testing will take place. 

If you find it useful and want to contribute, pull requests are more than welcome. I'll do my best to address any issues as quickly as possible, but please bear in mind, we built this to address a pressing need in our business. Our core business project is our current focus, so for larger issues or feature requests, unless they are impacting us or of value to our project regrettably at the present time I can't give them much priority. 

## Using the plugin in drone.yml


Example drone.yml file entry

deploy:
  ecs:
    image: fridaystreet/drone-ecs-node                                                      //path to plugin repo
    region: ap-southeast-2                                                                            //aws region to use, currently only supports single region
    access_key: $$AWS_KEY                                                                      //aws access key 
    secret_key: $$AWS_SECRET                                                                //aws secret key
    image_name: <my registery domain>/dashboard                             //name of image without tag. 
    image_tag: "1.0.$$BUILD_NUMBER"                                                 //build number
    cluster: Production-DashboardCluster                                                //base family name (can just be a part string wildcard like Dashboard)

    family: Production-DashboardTaskDefinition                                      //base family name (can just be a part string wildcard like Dashboard)
    service: Production-DashboardService                                               //base service name. (can just be a part string wildcard like Dashboard)
    ConstainerName: dashboard                                                               //the name of the container in the definition that uses this image         
    AllowMultipleClusters: false                                                    //with this set to false (default) if the cluster name/wildcard matches multiple clusters the d
    AllowMultipleServices: false

### Settings explained

Note - The following settings are not used with 
Any settings that aren't listed below, operate in exactly the same way as drone-ecs http://readme.drone.io/plugins/ecs 

However, please note that the following settings from drone-ecs are not used in drone-ecs-node:

*port_mappings
*memory
*environment_variables 
*NAME=VALUE

These settings are now handle in an ecs task definition configuration object. See below for details.



##Development

### Install 

```npm install


