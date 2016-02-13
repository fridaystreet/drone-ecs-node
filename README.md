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
    image: fridaystreet/drone-ecs-node                              //path to plugin repo
    region: ap-southeast-2                                                      //aws region to use, currently only supports single region
    access_key: $$AWS_KEY                                               //aws access key
    secret_key: $$AWS_SECRET                                        //aws secret key
    image_name: registry.mydomain.com/dashboard     //name of image without tag.
    image_tag: "1.0.$$BUILD_NUMBER"                           //image tag
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

Note - The following settings from drone-ecs are not used in drone-ecs-node.

  *port_mappings
  *memory
  *environment_variables
  *NAME=VALUE

These settings are now handle in an ecs task definition configuration object. See below for details.

Note - Any settings that aren't listed below, operate in exactly the same way as drone-ecs http://readme.drone.io/plugins/ecs

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

As you can see, if you're using cloud formation to deploy, this gives you the ability to maintain consistent base names and not need to worry about updating your drone.yml files everytime a CF deployment takes place.

It also makes it possible to update multiple clusters at the same time. If you used the last example 'ServicesCluster' as the wildcard and you also had a cluster called 'Staging-ServicesCluster', then it would also be able to update services in that cluster. Providing they matched the services name/wildcard parameter. This behavouir can be controlled via allow_multiple_clusters. See below.

####service
The service parameter operates as per above and matches the full service arn to the widlcard. As services are located on a cluster by cluster basis, this means you could match multiple services inthe same cluster.

Again a good example is if you have a environment where instead of using different clusters for different environments you use the same cluster with different services. This is probably a pretty rare use case, but it's handled anyway. This behavouir can be controlled via allow_multiple_services. See below.

####family
The family parameter operates as a wildcard as well, but it is used to match to task definitions. When the plugin matches a cluster and service, it retrieves all the current tasks within that service. From these tasks it derives the currently active task definitions. These are matched / filtered by this setting to determine which task definitions to update.

####constainer_name
The container name is required in order to determine which conatiner within the task definition to update the image name for this build. This setting is intended to accomodate definitions with multiple containers.

Note - It is a non-case sensitive exact match on the name. It does not support wildcards.

####allow_multiple_clusters  (optional)
This defaults to false as a safety precuation. If set to true it will allow matched definitions in multiple clusters to be updated at once.

####allow_multiple_services  (optional)
This defaults to false as a safety precuation. If set to true it will allow matched definitions in multiple services in the same cluster to be updated at once.


####task_definition  (optional)
The task_definition setting lets you specify a full or part ECS JSON formatted task definition to override one or all settings within the existing task defintion.

The json string should be stored in a file in the workspace. ie if you had a file called taskdef.json store in the root of the workspace alongside the drone.yml file you would set the parameter to:

**task_definition: taskdef.json

The intent of this setting was to be able to supply only those settings that needed to be modified and again not needing to maintain the entire definition, where some settings may have been added dynamically by the CF deployment.

Some sugar has been added to the json format in order to support some of this functionality of updating / removing / adding settings in instances where the value of the parameter in the config is an array of objects.

This is acomplished by a recursive merging process that  drills down through the entire object processing each child individually.

#####Modifying simple values (eg strings, integers)

This is just a case of specifying the parameter and value

Original
```
{cpu: 110}
```
New
```
{cpu: 250}
```
Output
```
{cpu: 250}
```

#####Modifying values that are part of an object in an array of objects

When the configurations are merged together and the plugin hits an array of objects in the provided json file, it looks to see if a 'keys' parameter exists.  If it does, then it looks through all of the array items in the current config and tries to match the values of those keys in the new config to values of the keys in the old config. It's pretty much just setting up a hash of fields in order to make a uniuqe match.

You can use one or more fields, just depends how specific you need to be in order to make the match. For environment vars for instance, no 2 will have the same name, so just specifying name would be enough.

If it is able to match all of the keys for a given object in the array, then it will look to merge any other parameters in the original config that exist in the new config and are not set as keys.

Original
```
    [
    {name: 'NODE_ENV', value: 'Production-1'}
    ]
```

New
```
    [
    {name: 'NODE_ENV', value: 'Production-2', keys: ['name']}
    ]
```

Output
```
    [
    {name: 'NODE_ENV', value: 'Production-2'}
    ]
```

See the example below to get a handle on how this actually looks.


#####Adding new objects to an object array

As an opposite to the above of modifying an existing object in an array, if you define an object in an array inside your new config file and do not specify a keys parameter, then it will assume this is a new object and just append the object to the array.

Original
```
    [    ]
```

New
```
    [
    {name: 'NODE_ENV', value: 'Production-1'}
    ]
```

Output
```
    [
    {name: 'NODE_ENV', value: 'Production-1'}
    ]
```

#####Removing objects from an object array

Removing objects works similar to modifying, you need to specify a keys parameters with an array of parameters to match the values of between the current and new config. In order to remove the matched objects, you just need to add an additonal parameter to the object 'remove:true'

Original
```
    [
    {name: 'NODE_ENV', value: 'Production-1'}
    ]
```

New
```
    [
    {name: 'NODE_ENV', keys: ['name'], remove: true}
    ]
```

Output
```
    [    ]
```

Note - In the new config file, you only need to specify the parameters you want to modify and the keys you want to match. For remove, we don't want to modify anything so we do't need to worry about sepcifying the 'value' parameter. This goes the same for modifying.


#####Adding new items to a simple array
Adding a new item to a simple array is as simple as just specifying an array with the value you want to add.

Original
```
{
    links: [ ]
}
```

New
```
{
    links: ['dbcontainer']
}
```
Output
```
{
    links: ['dbcontainer']
}
```


#####Removing items from a simple array
This is not yet implemented.

#####Examples
Lets say you have a full container definition in ecs like this
```
{
      containerDefinitions:
       [
       { name: 'dashboard',
           image: 'registry.mydomain.com/dashboard-prod:1.8.0',
           cpu: 110,
           memory: 496,
           portMappings:
            [ { containerPort: 80, hostPort: 8070, protocol: 'tcp' }],
           essential: true,
           entryPoint: [],
           command: [],
           environment:
            [ { name: 'NODE_ENV', value: 'production' },
              { name: 'PASSENGER_APP_ENV', value: 'production' },
              { name: 'DB_ENDPOINT', value: '10.0.1.24' },
              {name: 'SOMEKEY', value: 'jgjdqkjdhqdhamn'}
            ],
           mountPoints: [],
           volumesFrom: []
         },
      ],
      family: 'Production-DashboardTaskDefinition-95B1DSFHVJ1',
      revision: 20,
      volumes: []
}
```

And you want to; 1. modify the port mapping, 2. Add an ENV var, 3. delete an ENV var. All you would need to specify in your json file, is the structure and values for the items you want to modify. Like this:

```
    {
        containerDefinitions:
        [
            {
              name: 'dashboard',
              portMappings:
              [
               { containerPort: 80, hostPort: 8070, protocol: 'udp' , keys:['containerPort', 'hostPort']}
              ],
              environment: [
                  { name: 'LOGGING_SERVER', value: 'log.mydomain.com'},
                  { name: 'SOMEKEY', keys: ['name'] , remove:true}
              ],
              keys: ['name','cpu']
            }
      ]
  }
```
Let's take the containerDefintions parameter to start with. It's in the root of the task defintiion structure and it is an array of objects detailing each container. Inside the root of the first container object, our updated file has an additional  parameter called 'keys'

The keys in the root of the first container in the array are 'name' & 'cpu'. So as name and cpu in the new configuration match a container in the old configuration, any parameters in the root of the container object in the new configuration not set as keys will be updated. In this case environment and portMappings can now be put through the merge process.


The best way to think about it from this point is that the merge process is now passed the values of the portMappings parameter and starts the whole process above over again, but with the following
```
    {
      portMappings:
      [
           { containerPort: 80, hostPort: 8070, protocol: 'udp' , keys:['containerPort', 'hostPort']}
      ]
    }
```
So stepping through it again,  we have portMappings at the root, which is an array of objects. It iterates through each object looking for a 'keys' parameter. In this case we have one and it's asking to match containerPort & hostPort.

It pulls the portMappings array from the original ECS config and looks through the keys of each item to match containerPort: 80, hostPort: 8070. In our case there is a match and as there is another parameter 'protocol'  in our new config which isn't in the keys array for this object, the original config parameter is updated to be protocol: 'udp'

This process is then repeated for environments. and all other parameters recursively that are specified in the new json defintion file.




####log_level  (optional)
Bunyan has been implemented as the logging library.  I haven't done much logging in the plugin.  defaults to info.

The allowed log levels are

  *info

        outputs a guide on what's currently being done,  eg Fetching clsuters from ECS.
  *fatal

        all ecs requests will throw an exception if there is an error
  *error

        generally just validation errors for the plugin settings
  *warn

        outputs some errors with task definition file if supplied
  *debug

        outputs all the ecs request parameters and responses. Also the updated definitions if a task definition file was supplied


##Development

### Install
```
npm install
```

### Example

(these aren't real aws keys btw)

```
node app.js -- '{"repo":{"clone_url":"git://github.com/drone/drone","owner":"drone","name":"drone","full_name":"drone/drone"},"system":{"link_url":"https://beta.drone.io"},"build":{"number":22,"status":"success","started_at":1421029603,"finished_at":1421029813,"message":"UpdatetheReadme","author":"johnsmith","author_email":"john.smith@gmail.com","event":"push","branch":"master","commit":"436b7a6e2abaddfd35740527353e78a227ddcb2c","ref":"refs/heads/master"},"workspace":{"root":"/drone/src","path":"/drone/src/github.com/drone/drone"},"vargs":{"build":"","repo":"","access_key":"AHGDGJHhJ8677A2Q","secret_key":"IrlHJHGShjgsgsdgJHGSjhgsdgJJGU8JTRhSb","region":"ap-southeast-2","family":"Development-DashboardTaskDefinition","cluster":"Development-ServicesCluster","service":"Development-DashboardService","constainer_name":"dashboard","allow_multiple_clusters":false,"allow_multiple_services":false,"image_name":"registry.mydomain.com.au/dashboard-development","image_tag":"1.0.1","log_level":"debug","task_definition":"taskDef.json"}}'
```

Friendly version
```
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
      "constainer_name": "dashboard",
      "allow_multiple_clusters": false,
      "allow_multiple_services": false,
      "image_name": "registry.mydomain.com.au/dashboard-development",
      "image_tag": "1.0.1",
      "log_level": "debug",
      "task_definition": "taskDef.json"
    }
}
```

