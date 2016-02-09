const Drone = require('drone-node');
const plugin = new Drone.Plugin();
const AWS = require('aws-sdk');





function initEcsService (options) {



}

ecsService.prototype = Object.create({

  constructor: initEcsService,

});

module.exports = ecsService;


plugin.parse().then((params) => {


  // gets build and repository information for
  // the current running build
  const build = params.build;
  const repo  = params.repo;

  // gets plugin-specific parameters defined in
  // the .drone.yml file
  const vargs = params.vargs;

  if (vargs.AccessKey.length == 0) {
    console.log("Please provide an access key");

    process.exit(1);
    return;
  }

  if (vargs.SecretKey.length == 0) {
    fconsole.log("Please provide a secret key");

    process.exit(1);
    return;
  }

  if (vargs.Region == 0) {
    console.log("Please provide a region");

    process.exit(1);
    return;
  }

  if (vargs.Family == 0) {
    console.log("Please provide a task definition family name");

    process.exit(1);
    return;
  }

  if (vargs.Cluster == 0) {
    console.log("Please provide a cluster name");

    process.exit(1);
    return;
  }

  if (vargs.Image.length == 0) {
    console.log("Please provide an image name");

    process.exit(1);
    return;
  }

  if (vargs.Service.length == 0) {
    console.log("Please provide a service name");

    process.exit(1);
    return;
  }



  if (vargs.Tag.length == 0) {
    vargs.Tag = "latest";
  }


  var awsOptions = {
    accessKeyId:      vargs.AccessKey,
    secretAccessKey:  vargs.SecretKey,
    region:           vargs.Region,
  }

  var ecs = new AWS.ECS(awsOptions);

  /*
  if cloudformation = true
  1. list clusters and find the cluster arn
  2. list services in cluster and find the service arn
  3. describe the service and find the task def arn
  4. describe the task definition
  5. merge the updated task config if any
  6. check the min / max services allow for auto update of service
  7. if they don't then throw error for now (need to handle this later down the track)
  8. if they do then updateservice
  */

  var defer;

  if (vargs.CloudFormation) {

    var clusterArns = [];
    var serviceArns = [];
    var taskDefinitionArns = {};
    var taskArns = {};
    var serviceDescriptions = {};
    var taskDescriptions = [];
    var taskDefinitions = [];

    defer = Q.defer();

    //1. list clusters
    ecs.listClusters({maxResults: 0}, awsCallback);

    defer.promise
    .then(function (data) {


      var clusters = data.clusterArns;
      if (clusters.length <= 0) {
        console.log("no clusters found");

        return process.exit(1);
      }

      //iterate over clusters arns to find matches
      for (var i=0; i<clusters.length; i++) {

        var cluster = clusters[i].toLowerCase();

        if (cluster.indexOf(vargs.Cluster.toLowerCase()) != -1) {
          if (clusterArns.length > 0 && vargs.AllowMultipleClusters === false) {
            console.log("Matched multiple clusters, cluster name is too ambiguous!");
            console.log("set AllowMultipleClusters to true to override");

            return process.exit(1);
          }
          clusterArns.push(cluster);
        }
      }

      if (clusterArns.length <= 0) {
        console.log("No matches found for cluster name!");

        return process.exit(1);
      }

      //we need to create a matrix of promises
      //and wait for them all to be settled

      var promises = [];

      for (var x=0; x<clusterArns.length; x++) {
        var params = {
          cluster: clusterArn,
          maxResults: 0,
        };

        //list services
        promises.push(ecs.listServices(params, awsCallback));
      }

      return Q.all(promises).done(function (values) {

          var services = [];
          for (var i=0; i<values.length; i++) {
            services.concat(values[i].serviceArns);
          }
          return services;
      });
    })
    .then(function (data) {

      var services = data.serviceArns;

      if (services.length <= 0) {
        console.log("no services found in clusters");

        return process.exit(1);
      }

      for (var i=0; i<services.length; i++) {

        var service = services[i].toLowerCase();

        if (service.indexOf(vargs.Service.toLowerCase()) != -1) {
          if (serviceArn !== null && vargs.AllowMultipleServices === false) {
            console.log("Matched multiple services, service name is too ambiguous!");
            console.log("set AllowMultipleServices to true to override");

            return process.exit(1);
          }
          serviceArns.push(service);
        }
      }

      if (serviceArn === null) {
        console.log("No matches found for service name!");

        return process.exit(1);
      }


      //describe the service
      var params = {
        services: serviceArns,
        cluster: clusterArn
      };

      defer = Q.defer();

      ecs.describeServices(params, awsCallback);

      return defer.promise;

    })
    .then(function (data) {

      serviceDescriptions = data.services

      if (serviceDescriptions.length <= 0) {
        console.log("no services found in clusters");

        return process.exit(1);
      }

      //we need to create a matrix of promises
      //to get tasks for each service

      var promises = [];

      for (var x=0; x<serviceDescriptions.length; x++) {

        var service = serviceDescriptions[x];

        var params = {
          cluster: service.clusterArn,
          serviceName: service.serviceName,
          maxResults: 0,
        };

        //push list tasks in to promise array
        promises.push(ecs.listTask(params, function (err, data) {
          if (err) {
            console.log(err, err.stack); // an error occurred
            return process.exit(1);
          } else {
            console.log(data);           // successful response

            //inject the cluster and service
            //in to the response so that
            //we know which task belong to where
            data = {
              cluster: service.clusterArn,
              serviceName: service.serviceName,
              taskArns: data.taskArns
            };

            return defer.resolve(data);
          }
        ));
      }

      return Q.all(promises).done(function (values) {

        var tasks = [];
        for (var i=0; i<values.length; i++) {

          var cluster = values[i].cluster;
          var service = values[i].service;
          tasks.push({
            cluster: cluster,
            service: service,
            taskArns: values[i].taskArns
          });

        }
        return tasks;
      });
    })
    .then(function (data) {

      if (data.length <= 0) {
        console.log("no tasks found");

        return process.exit(1);
      }
      for (var i=0; i<data.length; i++) {

        var service = data[i].service;
        var service = data[i].cluster;

        if (data[i].taskArns.length <= 0) {
          console.log("no tasks found in service " + data[i].service);

          return process.exit(1);
        }

        for (var x=0; x<values[i].taskArns.length; x++) {

          var task = values[i].taskArns[x];

          var taskArns[task.taskArn] = {
            cluster: task.cluster,
            service: task.service
          };

        }
      }

      var params = {
        tasks: Object.keys(taskArns),
        maxResults: 0,
      };

      //describe all tasks
      defer = Q.defer();

      ecs.describeTasks(params, awsCallback));

      return defer.promise;

    })
    .then(function (data) {

      taskDescriptions = data.tasks

      if (taskDescriptions.length <= 0) {
        console.log("no task descriptions returned");

        return process.exit(1);
      }

      var promises = [];
      for (var i=0; i<taskDescriptions.length; i++) {

        var task = taskDescriptions[i];
        if(!task.taskDefinitionArn in taskDefinitionArns){
          taskDefinitionArns[task.taskDefinitionArn] = [];
        }

        task.serviceArn = taskArns[task.taskArn].service

        taskDefinitionArns[task.taskDefinitionArn] = task;

        var params = {
          taskDefinition: task.taskDefinitionArn
        };

        promises.push(ecs.describeTaskDefinition(params, awsCallback));
      }

      return Q.all(promises).done(function (values) {

        var taskDefs = [];
        for (var i=0; i<values.length; i++) {

          //var cluster = values[i].cluster;
          //var service = values[i].service;
          //taskArns[cluster][service] = values[i].taskArns;
          var taskDef = values[i].taskDefinition;
          if (taskDef.status == 'ACTIVE') {
            taskDefs.push(taskDef);
          }

        }
        return taskDefs;
      });
    })
    .then(function (data) {

      taskDefinitions = data;

      if (taskDefinitions.length <= 0) {
        console.log("no ACTIVE task definitions found in selection");

        return process.exit(1);
      }

      var promises = [];
      for (var i=0; i<taskDefinitions.length; i++) {

        var taskDef = taskDefinitions[i];

        //replace image in each container
        //need to handle multiple containers
        //which ones updated.
        //need to have the container passed in the vargs
        for (var x=0; x<taskDef.containerDefinitions; x++) {
          var name = taskDef.containerDefinitions[x].name;
          if (name.toLowerCase() == vargs.ContainerName.toLowerCase()) {
            taskDef.containerDefinitions[x].image = vargs.Image + ":" + vargs.Tag
          }
        }

        //need to do some magic here that will merge the updated
        //config if any.
        /*
        todo
         */

        //remove fields that aren't required for new definition
        delete taskDef.taskDefinitionArn;
        delete taskDef.revision;
        delete taskDef.status;

        var task = taskDefinitionArns[taskDef];

        var service = serviceDescriptions[task.service];

        var params = {
          service: task.service,
          cluster: task.cluster,
          deploymentConfiguration: {
            maximumPercent: 200,
            minimumPercent: 0
          },
          desiredCount: service.desiredCount,
          taskDefinition: taskDefinition
        };

        promises.push(ecs.registerTaskDefinition(params, function (err, data) {
            if (err) {
              console.log(err, err.stack); // an error occurred
              return process.exit(1);
            } else {
              console.log(data);           // successful response
              //need to furnish the results with the taskArn

              data = {
                taskArn: taskDefinitionArns[taskDef].taskArn,
                taskDefinition: data.taskDefinition
              };

              return defer.resolve(data);
            }
          })
        );
      }

      return Q.all(promises).then(function (values) {

        var taskDefs = [];
        for (var i=0; i<values.length; i++) {

          var taskDef = values[i].taskDefinition;
          if (taskDef.status == 'ACTIVE') {
            //update the service with the new task def
            taskDefs.push(taskDef);
          }

        }
        return taskDefs;
      });

    })
  .then(function (taskDefs) {

    //update the service of each task def.
    //get the existing task from the values in case we need to stop it

    if (taskDefs.length <= 0) {
      console.log("no task definitions have been created");

      return process.exit(1);
    }

    var promises = [];
    for (var i=0; i<taskDefs.length; i++) {

      var taskDef = taskDefs[i];

      var task = taskDefinitionArns[taskDef.taskArn];

      var params = {
        service: task.service,
        cluster: task.cluster,
        deploymentConfiguration: {
          maximumPercent: 200,
          minimumPercent: 0
        },
        desiredCount: service.desiredCount,
        taskDefinition: taskDef.taskDefinition
      };

      promises.push(ecs.updateService(params, awsCallback));
    }

    return Q.all(promises).done(function (values) {

      for (var i=0; i<values.length; i++) {
        console.log(values[i].service.serviceName + "updated");
      }
      return values;
    });
  })
  .then(function (data) {
    console.log('everything worked');
    return process.exit(0);
  });
});

function awsCallback (err, data) {
  if (err) {
    console.log(err, err.stack); // an error occurred
    process.exit(1);
  } else {
    console.log(data);           // successful response
    return defer.resolve(data);
  }
}
