//const Drone = require('drone-node');
//const plugin = new Drone.Plugin();
const AWS = require('aws-sdk');
const Promise = require('bluebird');
const Q = require('q');
const bunyan = require('bunyan');
const logger = bunyan.createLogger({name: 'drone-ecs-node'});

function processBuild(params) {


  var logLevels = [
    'info',
    'fatal',
    'error',
    'warn',
    'debug',
    'trace'
  ];

  var logLevel = 'info';

  if (logLevels.indexOf(vargs.LogLevel) != -1) {
    logLevel = vargs.LogLevel;
  }

  logger.level(logLevel);
  // gets build and repository information for
  // the current running build
  const build = params.build;
  const repo  = params.repo;

  // gets plugin-specific parameters defined in
  // the .drone.yml file
  const vargs = params.vargs;

  if (vargs.AccessKey.length == 0) {
    logger.error("Please provide an access key");

    return process.exit(1);
  }

  if (vargs.SecretKey.length == 0) {
    logger.error("Please provide a secret key");

    return process.exit(1);
  }

  if (vargs.Region.length == 0) {
    logger.error("Please provide a region");

    return process.exit(1);
  }

  if (vargs.Family.length == 0) {
    logger.error("Please provide a task definition family name");

    return process.exit(1);
  }

  if (vargs.Cluster.length == 0) {
    logger.error("Please provide a cluster name");

    return process.exit(1);
  }

  if (vargs.Image.length == 0) {
    logger.error("Please provide an image name");

    return process.exit(1);
  }

  if (vargs.Service.length == 0) {
    logger.error("Please provide a service name");

    return process.exit(1);
  }



  if (vargs.Tag.length == 0) {
    vargs.Tag = "latest";
  }


  var awsOptions = {
    accessKeyId:      vargs.AccessKey,
    secretAccessKey:  vargs.SecretKey,
    region:           vargs.Region,
  }

  var ecs = new ecsService(awsOptions, vargs);

  /*
  if cloudformation = true
  1. list clusters and find the cluster arns
  2. list services in clusters and find the service arns
  3. describe the services and find the task def arns
  4. describe the task definitions
  5. merge the updated task config if any
  6. check the min / max services allow for auto update of service
  7. if they don't then throw error for now (need to handle this later down the track)
  8. if they do then updateservice
  */

  if (vargs.CloudFormation) {

    return ecs.listClusters()
    .then(function (clusterArns) {

      ecs.processClusters(clusterArns);
      return ecs.listServices();
    })
    .then(function (serviceArns) {

      ecs.processServicesList(serviceArns);
      return ecs.describeServices();
    })
    .then(function (serviceDescriptions) {

      ecs.processServiceDescriptions(serviceDescriptions);
      return ecs.listTasks();
    })
    .then(function (taskArns) {

      ecs.processTasksList(taskArns);
      return ecs.describeTasks();
    })
    .then(function (taskDescriptions) {

      ecs.processTaskDescriptions(taskDescriptions);
      return ecs.describeTaskDefinitions();
    })
    .then(function (taskDefinitions) {

      return ecs.registerTaskDefinitions(taskDefinitions);
    })
    .then(function (taskDefinitions) {

      return ecs.updateServices(taskDefinitions);
    })
    .then(function (services) {

      logger.info('final data', services);
      logger.info('everything worked');
      return process.exit(0);

    })
    .catch(function (err) {

      logger.fatal('catch', err, err.stack);
      return process.exit(1);
    });
  } else {
    //process the normal setup.
    //should still retreive the existing config
    //and merge it here, but no need for searching the 
    //all clusters etc. Can retrieve task defs using family name
    /*
    what's actually happening here?
    all the specified names are hard
    so should be bale to just do the last 2 steps
    of regdefinitions and update service.
    might need a way to set the services / clusters / tasks 
    also need to pull down the existing definition so we can merge the 
    new config
     */
    
  }
}


function ecsService (options, vargs) {

  this.ecs = new AWS.ECS(awsOptions);
  this.vargs = vargs;
  return;
}

ecsService.prototype = Object.create({

  constructor: ecsService,
  clusterArns: {},
  serviceArns: {},
  taskDefinitionArns: {},
  taskArns: {},
  serviceDescriptions: {},
  taskDescriptions: {},
  taskDefinitions: {},

  listClusters: function() {

    logger.info('Fetching services from ECS');

    var _this = this;
    //1. list clusters
    return new Promise(function (resolve) {

      _this.ecs.listClusters({maxResults: 100}, function (err, data) {

        if (err) {
          throw new Error(err); // an error occurred
        } else {
            logger.debug('listClusters response');
            logger.debug(data);
            return resolve(data);
        }
      });
    });
  },

  processClusters: function(data) {

    var clusterArns = data.clusterArns;
    if (clusterArns.length <= 0) {
      throw new Error("no clusters found");
    }

    //iterate over clusters arns to find matches
    for (var i=0; i<clusterArns.length; i++) {

      var clusterArn = clusterArns[i].toLowerCase();


      if (clusterArn.indexOf(this.vargs.Cluster.toLowerCase()) != -1) {
        if (this.clusterArns.length > 0 && this.vargs.AllowMultipleClusters === false) {
          var error = "Matched multiple clusters, cluster name is too ambiguous!";
          error += "\nSet AllowMultipleClusters to true to override";
          throw new Error(error);
        }
        this.clusterArns[clusterArns[i]] = {tasks:[]};
      }
    }

    if (this.clusterArns.length <= 0) {
      throw new Error("No matches found for cluster name!");
    }
  },

  listServices: function() {

    var clusterArns = Object.keys(this.clusterArns);
    if (clusterArns.length <= 0) {
      throw new Error("No matches found for cluster name!");
    }

    var promises = [];
    var _this = this;

    for (var x=0; x<clusterArns.length; x++) {

      var clusterArn = clusterArns[x];
      var params = {
        cluster: clusterArn,
        maxResults: 100,
      };

      logger.debug('listServices Request Parameters', params);

      var promise = new Promise(function (resolve) {
          _this.ecs.listServices(params, function (err, data) {
            if (err) {
              throw new Error(err);
            }
            data.clusterArn = clusterArn;
            logger.debug('listServices callback response for cluster: ' + clusterArn);
            logger.debug(data);
            return resolve(data);
          });
        });

      //list services
      promises.push(promise);
    }
    return Promise.all(promises).then(function (values) {
      data = [];
      for (var i=0; i<values.length; i++) {
        data.push(values[i]);
      }
      return values;
    });
  },

  processServicesList: function(data) {


    for (var i=0; i<data.length; i++) {

      if(!('serviceArns' in data[i])){
        throw new Error("serviceArns parameter not returned for cluster: " + data.clusterArn);
      }
      var services = data[i].serviceArns;
      var clusterArn = data[i].clusterArn;


      if (services.length <= 0) {
        throw new Error("no services found in cluster:" + data.clusterArn);
      }

      for (var x=0; x<services.length; x++) {

        var service = services[x].toLowerCase();

        if (service.indexOf(this.vargs.Service.toLowerCase()) != -1) {
          if (this.serviceArns.length > 0 && this.vargs.AllowMultipleServices === false) {
            var error = "Matched multiple services, service name is too ambiguous!";
            error += "\nSet AllowMultipleServices to true to override";
            throw new Error(error);
          }
          if (!(clusterArn in this.serviceArns)) {
            this.serviceArns[clusterArn] = [];
          }
          this.serviceArns[clusterArn].push(services[x]);
        }
      }
    }

    if (Object.keys(this.serviceArns).length <= 0) {
      throw new Error("No matches found for service name!");
    }
  },

  describeServices: function() {

    var serviceArns = Object.keys(this.serviceArns);

    if (serviceArns.length <= 0) {
      throw new Error('No serviceArns set, run listServices or setServiceArns');
    }

    logger.debug('describeServices this.serviceArns');
    logger.debug(this.serviceArns);

    var _this = this;
    var promises = [];
    for (clusterArn in this.serviceArns) {
      var params = {
        services: this.serviceArns[clusterArn],
        cluster: clusterArn
      };

      logger.debug('describeServices request parameters', params);

      var promise = new Promise(function (resolve) {
        _this.ecs.describeServices(params, function (err, data) {
          if (err) {
            throw new Error(err);
          }

          logger.debug('describeServices callback response for cluster: ' + clusterArn);
          logger.debug(data);

          return resolve(data);
        });
      });

      promises.push(promise);

    }

    return Promise.all(promises).then(function (values) {


        var data = [];
        for (var i=0; i<values.length; i++) {
          data = data.concat(values[i].services);
        }
        return data;
    });
  },

  processServiceDescriptions: function (data) {

    if (data.length <= 0) {
      throw new Error("No services found in clusters");
    }

    for (var i =0; i<data.length; i++) {
      var serviceArn = data[i].serviceArn;
      this.serviceDescriptions[serviceArn] = data[i];
    }
  },

  listTasks: function () {

    if (Object.keys(this.serviceDescriptions).length <= 0) {
      throw new Error("No service descriptions found");
    }

    var _this = this;
    var promises = [];
    var services = this.serviceDescriptions;

    for (serviceArn in services) {

      var service = services[serviceArn];

      var params = {
        cluster: service.clusterArn,
        serviceName: service.serviceName,
        maxResults: 100,
      };

      var promise = new Promise(function (resolve) {
        _this.ecs.listTasks(params, function (err, data) {

          if (err) {
            throw new Error(err); // an error occurred
          } else {
            logger.debug('listTasks callback response for service: ' + service.serviceArn, data);           // successful response
            //inject the cluster and service
            //in to the response so that
            //we know which task belong to where
            data = {
              clusterArn: service.clusterArn,
              serviceArn: service.serviceArn,
              taskArns: data.taskArns
            };

            return resolve(data);
          }
        });
      })
      //push list tasks in to promise array
      promises.push(promise);
    }

    return Promise.all(promises).then(function (values) {

      var tasks = [];
      for (var i=0; i<values.length; i++) {

        var clusterArn = values[i].clusterArn;
        var serviceArn = values[i].serviceArn;
        tasks.push({
          clusterArn: clusterArn,
          serviceArn: serviceArn,
          taskArns: values[i].taskArns
        });

      }
      return tasks;
    });
  },

  processTasksList: function (data) {

    if (data.length <= 0) {
      throw new Error("No tasks found");
    }

    for (var i=0; i<data.length; i++) {

      var serviceArn = data[i].serviceArn;
      var clusterArn = data[i].clusterArn;

      if (data[i].taskArns.length <= 0) {
        throw new Error("No tasks found in service " + serviceArn + 'in cluster: ' + clusterArn);
      }

      for (var x=0; x<data[i].taskArns.length; x++) {

        var task = data[i].taskArns[x];

        this.taskArns[task] = {
          clusterArn: clusterArn,
          serviceArn: serviceArn
        };

        this.clusterArns[clusterArn].tasks.push(task);
      }
    }
  },

  describeTasks: function () {

    var clusterArns = Object.keys(this.clusterArns);

    if (clusterArns.length <= 0) {
      throw new Error('No clusters set');
    }

    var _this = this;
    var promises = [];

    for (var i=0; i<clusterArns.length; i++) {

      var clusterArn = clusterArns[i];
      var taskArns = this.clusterArns[clusterArn].tasks;

      var params = {
        tasks: taskArns,
        cluster: clusterArn
      };

      logger.debug('describeTasks for cluster: ' + clusterArn + ' request parameters', params);

      var promise = new Promise(function (resolve) {
        _this.ecs.describeTasks(params, function (err, data) {

          if (err) {
            throw new Error(err); // an error occurred
          } else {

            logger.debug('describeTasks callback response for cluster: ' + clusterArn, data);           // successful response
            return resolve(data);
          }
        });
      });
      promises.push(promise);
    }

    //describe all tasks
    return Promise.all(promises).then(function (values) {

      var data = [];
      for (var i=0; i<values.length; i++) {
        data = data.concat(values[i].tasks);
      }
      return data;
    });
  },

  processTaskDescriptions: function (data) {


    if (data.length <= 0) {
      throw new Error("No task descriptions returned");
    }

    var tasks = data;
    for (var i=0; i<tasks.length; i++) {

      var task = tasks[i];
      if (!(task.taskDefinitionArn in this.taskDefinitionArns)) {
        this.taskDefinitionArns[task.taskDefinitionArn] = [];
      }

      task.serviceArn = this.taskArns[task.taskArn].serviceArn

      this.taskDefinitionArns[task.taskDefinitionArn] = task;
    }

    if (Object.keys(this.taskDefinitionArns).length <= 0) {
      throw new Error('No task definitions found');
    }
  },

  describeTaskDefinitions: function () {

    if (Object.keys(this.taskDefinitionArns).length <= 0) {
      throw new Error('No task definitions set');
    }

    var _this = this;
    var promises = [];
    for (taskDefArn in this.taskDefinitionArns) {

      var params = {
        taskDefinition: taskDefArn
      };

      var promise = new Promise(function (resolve) {
        _this.ecs.describeTaskDefinition(params, function (err, data) {
          if (err) {
            throw new Error(err); // an error occurred
          } else {
            logger.debug('describeTaskDefinitionss callback response for task def: ' + taskDefArn, data);           // successful response
            return resolve(data);
          }
        });
      });

      promises.push(promise);
    }

    return Promise.all(promises).then(function (values) {

      var taskDefs = [];
      for (var i=0; i<values.length; i++) {

        //var cluster = values[i].cluster;
        //var service = values[i].service;
        //taskArns[cluster][service] = values[i].taskArns;
        var taskDef = values[i].taskDefinition;
        if (taskDef.status == 'ACTIVE') {

          var task = _this.taskDefinitionArns[taskDef.taskDefinitionArn];

          values[i].serviceArn = task.serviceArn;
          values[i].clusterArn = task.clusterArn;
          values[i].task = task;

          taskDefs.push(values[i]);
        }

      }
      return taskDefs;
    });
  },

  registerTaskDefinitions: function (data) {


    if (data.length <= 0) {
      throw new Error("No ACTIVE task definitions found in selection");
    }

    this.taskDefinitions = data;

    var _this = this;
    var promises = [];

    for (var i=0; i<this.taskDefinitions.length; i++) {

      var taskDef = this.taskDefinitions[i].taskDefinition;
      var serviceArn = this.taskDefinitions[i].serviceArn;
      var clusterArn = this.taskDefinitions[i].clusterArn;
      var taskArn = this.taskDefinitions[i].task.taskArn;
      var service = this.serviceDescriptions[serviceArn];

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
      if (Object.keys(vargs.taskDefinition).length == 0) {
        vargs.taskDefinition = {};
      }
      taskDef = this.mergeRecursive(taskDef, vargs.taskDefinition);

      //remove fields that aren't required for new definition
      delete taskDef.taskDefinitionArn;
      delete taskDef.revision;
      delete taskDef.status;
      delete taskDef.requiresAttributes;

      var promise = new Promise(function (resolve) {
        _this.ecs.registerTaskDefinition(taskDef, function (err, data) {
          if (err) {
            throw new Error(err); // an error occurred
          } else {
            logger.debug('registerTaskDefinitions callback response for service: ' + serviceArn, data);           // successful response
            //need to furnish the results with the taskArn

            data = {
              taskArn: taskArn,
              serviceArn: serviceArn,
              clusterArn: clusterArn,
              taskDefinition: data.taskDefinition
            };

            return resolve(data);
          }
        });
      });
      promises.push(promise);
    }

    return Promise.all(promises).then(function (values) {

      var data = [];
      for (var i=0; i<values.length; i++) {
        data.push(values[i]);
      }
      return data;
    });
  },

  updateServices: function (taskDefs) {

    //update the service of each task def.
    //get the existing task from the values in case we need to stop it

    if (taskDefs.length <= 0) {
      throw new Error("no task definitions have been created");
    }

    var _this = this;

    var promises = [];
    for (var i=0; i<taskDefs.length; i++) {

      var taskDef = taskDefs[i];
      var service = this.serviceDescriptions[taskDef.serviceArn];

      var params = {
        service: taskDef.serviceArn,
        cluster: taskDef.clusterArn,
        deploymentConfiguration: {
          maximumPercent: 200,
          minimumHealthyPercent: 0
        },
        desiredCount: service.desiredCount,
        taskDefinition: taskDef.taskDefinition.taskDefinitionArn
      };

      logger.debug('updateService request parameters', params);

      var promise = new Promise(function (resolve) {
        _this.ecs.updateService(params, function (err, data) {
         if (err) {
            throw new Error(err); // an error occurred
          } else {
            logger.debug('updateService callback response for service: ' + taskDef.serviceArn + ' task def: ' + taskDefArn, data);           // successful response
            return resolve(data);
          }
        });
      });
      promises.push(promise);
    }

    return Promise.all(promises).then(function (values) {

      for (var i=0; i<values.length; i++) {
        logger.info(values[i].service.serviceName + "updated");
      }
      return values;
    });
  },

  mergeRecursive: function (obj1, obj2) {

    for (var p in obj2) {
      try {
        // Property in destination object set; update its value.
        if ( obj2[p].constructor==Object ) {
          obj1[p] = MergeRecursive(obj1[p], obj2[p]);

        } else {
          obj1[p] = obj2[p];

        }

      } catch(e) {
        // Property in destination object not set; create it and set its value.
        obj1[p] = obj2[p];

      }
    }

    return obj1;
  }  

});

module.exports = ecsService;

var vargs = {
  build: '',
  repo: '',
  AccessKey: 'AKIAJY5JZHOPX4NB4A2Q',
  SecretKey: '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',
  Region: 'ap-southeast-2',
  Family: 'CoreProduction-DashboardTaskDefinition',
  Cluster: 'CoreProduction-ServicesCluster',
  Service: 'CoreProduction-DashboardService',
  ConstainerName: 'dashboard',
  AllowMultipleClusters: false,
  AllowMultipleServices: false,
  Image_name: 'registry.engagementcoach.com.au/frontend-production',
  Tag: '8',
  CloudFormation: true,
  LogLevel: 'debug'
}

var logLevels = [
  'info',
  'fatal',
  'error',
  'warn',
  'debug',
  'trace'
];

var logLevel = 'info';

if (logLevels.indexOf(vargs.LogLevel) != -1) {
  logLevel = vargs.LogLevel;
}

logger.level(logLevel);

var awsOptions = {
  accessKeyId:      vargs.AccessKey,
  secretAccessKey:  vargs.SecretKey,
  region:           vargs.Region,
}

var ecs = new ecsService(awsOptions, vargs);

    ecs.listClusters()
    .then(function (data) {

      ecs.processClusters(data);
      return ecs.listServices();
    })
    .then(function (data) {

      ecs.processServicesList(data);
      return ecs.describeServices();
    })
    .then(function (data) {

      ecs.processServiceDescriptions(data);
      return ecs.listTasks();
    })
    .then(function (data) {

      ecs.processTasksList(data);
      return ecs.describeTasks();
    })
    .then(function (data) {

      ecs.processTaskDescriptions(data);
      return ecs.describeTaskDefinitions();
    })
    .then(function (data) {

      return ecs.registerTaskDefinitions(data);
    })
    .then(function (data) {

      return ecs.updateServices(data);
    })
    .then(function (data) {

      logger.info('final data', data);
      logger.info('everything worked');
      return process.exit(0);

    })
    .catch(function (err) {

      logger.error('catch', err, err.stack);
      return process.exit(1);
    });


