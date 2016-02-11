# drone-ecs-node

[![Build Status](http://beta.drone.io/api/badges/drone-plugins/drone-ecs/status.svg)](http://beta.drone.io/drone-plugins/drone-ecs)
[![Coverage Status](https://aircover.co/badges/drone-plugins/drone-ecs/coverage.svg)](https://aircover.co/drone-plugins/drone-ecs)
[![](https://badge.imagelayers.io/plugins/drone-ecs:latest.svg)](https://imagelayers.io/?images=plugins/drone-ecs:latest 'Get your own badge on imagelayers.io')

Drone plugin to deploy or update a project on AWS ECS. This has been model on the original drone-ecs plugin written in go, thanks to the drone team for their efforts and open sourcing their sofwtare. 

The original plugin while fully functional had not been designed or intended to be used with environments setup using cloud formation or complex ecs clusters with multiple servcies, tasks and multiple containers in task definitions. This plugin is intended to preserve existing configurations and handle the dynamic nature of cloudformation resources by using wildcards instead of fixed names. You can still use this plugin and the added config features with fixed names as well. It works exactly the same for both setups.

Another challenge with cloudformation is the management of enviornment variables. The are scenarios where environment variables for task deifnitions that point to other resources are set dynamically when the cloudformation script is run. Having to maintain these variable values manually in the drone.yml is not practical. 

This plugin handles this situation by first retrieving the existing task definitions and using them as a template for the new definition. This way the configuration is preserved from the initial cloudformation deployment through subsequent drone deployments. In order to update the configuration, the plugin provides the ability to make changes to explicit parts of the configuration as required through the drone.yml file, while leaving the remaining configuration in tact. 

Full examples of all functionality are available below.

This plugin hasn't been extensively tested. We do have a fairly complex ecs environment which covers all the scenarios the plugin can handle. Over the coming months more and more testing will take place. 

If you find it useful and want to contribute, pull requests are more than welcome. I'll do my best to address any issues as quickly as possible, but please bear in mind, we built this to address a pressing need in our business. Our core business project is our current focus, so for larger issues or feature requests, unless they are impacting us or of value to our project regrettably at the present time I can't give them much priority. 

## Using the plugin in drone.yml


Example drone.yml file entry
```
deploy:
  ecs:
    image: fridaystreet/drone-ecs-node                               //path to plugin repo
    region: ap-southeast-2                                                     //aws region to use, currently only supports single region
    access_key: $$AWS_KEY                                               //aws access key 
    secret_key: $$AWS_SECRET                                        //aws secret key
    image_name: registry.mydomain.com/dashboard     //name of image without tag. 
    image_tag: "1.0.$$BUILD_NUMBER"                          //image tag
    cluster: Production-DashboardCluster                         //base cluster name / wildcard
    family: Production-DashboardTaskDefinition             //base family name / wildcard
    service: Production-DashboardService                       //base service name / wildcard
    constainer_name: dashboard                                        //the name of the container in the definition that uses this image         
    allow_multiple_clusters: false                                        //update services on multiple clusters if matched
    allow_multiple_services: false                                      //update multiple services on a clusters if matched
    log_level: 'debug'                                                            //logging level to output
    task_definition: myTaskDefFile.json                            //relevant path to JSON format taskDefinition file
```
### Settings explained

Note - The following settings are not used with 
Any settings that aren't listed below, operate in exactly the same way as drone-ecs http://readme.drone.io/plugins/ecs 

However, please note that the following settings from drone-ecs are not used in drone-ecs-node:

  *port_mappings
  *memory
  *environment_variables 
  *NAME=VALUE

These settings are now handle in an ecs task definition configuration object. See below for details. 

####cluster
The cluster, service & family settings all do indexOf matches on the full Arn of the relative resource.  

This means that is you have a cluster with an Arn of :

**arn:aws:ecs:ap-southeast-2:217249687128:cluster/Production-ServicesCluster-8LVWYYRDXQUU
(the -8LVWYYRDXQUU is a random string that is attached to the base name by the cloudformation deployment)

You could access the cluster with the plugin by setting the cluster parameter to either of the following (not exhuastive):
  *arn:aws:ecs:ap-southeast-2:217249687128:cluster/Production-ServicesCluster-8LVWYYRDXQUU
  *Production-ServicesCluster-8LVWYYRDXQUU
  *Production-ServicesCluster
  *ServicesCluster

As you can see, if you're using cloud formation to deploy, this give you the ability to maintain consistent base names and not need to worry about updating your drone.yml files everytime a CF deployment takes place.

It also makes it possible to update multiple clusters at the same time. If you used the last example 'ServicesCluster' as the wildcard and you also had a cluster called 'Staging'-ServicesCluster', then it would also be able to update services in that cluster. Providing they matched the services name/wildcard parameter. This behavouir can be controlled via allow_multiple_clusters. See below.

####service
The service parameter operates as per above and matches the full service arn to the widlcard. As services are located on a cluster by cluster basis, this means you could mach multiple services inthe same cluster.

Again a good example is if you have a environment where instead of using different clusters for different environments you use the same cluster with different services. This is probably a pretty rare use case, but it's handled anyway. This behavouir can be controlled via allow_multiple_services. See below.

####family
The family parameter operates as a wildcard as well, but it is used to match to task definitions. When the plugin matches a cluster and service, it retrieves all the current tasks within that service. From these tasks it derives the currently active task definitions. These are matched / filtered by this setting to determine which task definitions to update.

####constainer_name
The container name is required in order to determine which conatiner within the task definition to update the image name for this build. This setting is intended to accomodate definitions with multiple containers. 

Note - It is a case insensitive exact match on the name. It does not support wildcards.

####allow_multiple_clusters  (optional)
This defaults to false as a safety precuation. If set to true it will allow matched definitions in multiple clusters to be updated at once. 

####allow_multiple_services  (optional)
This defaults to false as a safety precuation. If set to true it will allow matched definitions in multiple services in the same cluster to be updated at once. 


####task_definition  (optional)
The task_definition setting lets you specify a full or part ECS JSON formatted task definition to override one or all settings within the existing task defintion.


####log_level  (optional)
Bunyan has been implemented as the logging library.  I haven't done much logging in the plugin.  defaults to info.

The allowed log levels are 
  *info

        outputs a guide on what's currently being done,  eg Fetching clsuters from ECS. 
  *fatal

        all ecs requests with throw an exception is there is an error
  *error

        generally just validation errors for the plugin settings
  *warn

        outputs some errors with task definition file if supplied
  *debug

        outputs all the ecs request parameters and responses. Also the updated definitions if a task definition file was supplied


##Development

### Install 

```npm install


