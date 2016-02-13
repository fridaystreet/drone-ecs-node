'use strict'

const Drone = require('drone-node');
const plugin = new Drone.Plugin();
const AWS = require('aws-sdk');
const Promise = require('bluebird');
const bunyan = require('bunyan');
const util = require('util');
const jsonfile = require('jsonfile');
const humps = require('./humps');

function ecsService (awsOptions, vargs, logger) {

  this.ecs = new AWS.ECS(awsOptions);
  this.vargs = vargs;
  this.logger = logger;
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

    this.logger.info('Fetching clusters from ECS');

    //1. list clusters
    return new Promise((resolve) => {

      this.ecs.listClusters({maxResults: 100}, (err, data) => {

        if (err) {
          throw new Error(err); // an error occurred
        } else {
            this.logger.debug('listClusters response', util.inspect(data, { showHidden: true, depth: null }));
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


      if (clusterArn.indexOf(this.vargs.cluster.toLowerCase()) != -1) {
        if (this.clusterArns.length > 0 && this.vargs.allowMultipleClusters === false) {
          var error = "Matched multiple clusters, cluster name is too ambiguous!";
          error += "\nSet AllowMultipleClusters to true to override";
          throw new Error(error);
        }
        this.clusterArns[clusterArns[i]] = {tasks:[]};
      }
    }

    if (Object.keys(this.clusterArns).length <= 0) {
      throw new Error("No matches found for cluster name!");
    }
  },

  listServices: function() {

    this.logger.info('Fetching services from ECS');
    var clusterArns = Object.keys(this.clusterArns);
    if (clusterArns.length <= 0) {
      throw new Error("No matches found for cluster name!");
    }

    var promises = [];

    for (var x=0; x<clusterArns.length; x++) {

      var clusterArn = clusterArns[x];
      var params = {
        cluster: clusterArn,
        maxResults: 100,
      };

      this.logger.debug('listServices Request Parameters', params);

      var promise = new Promise((resolve) => {
          this.ecs.listServices(params, (err, data) => {
            if (err) {
              throw new Error(err);
            }
            data.clusterArn = clusterArn;
            this.logger.debug('listServices callback response for cluster: ' + clusterArn, util.inspect(data, { showHidden: true, depth: null }));
            return resolve(data);
          });
        });

      //list services
      promises.push(promise);
    }
    return Promise.all(promises).then((values) => {
      var data = [];
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

        if (service.indexOf(this.vargs.service.toLowerCase()) != -1) {
          if (this.serviceArns.length > 0 && this.vargs.allowMultipleServices === false) {
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
    this.logger.info('Matched services: ', this.serviceArns);
    if (Object.keys(this.serviceArns).length <= 0) {
      throw new Error("No matches found for service name!");
    }
  },

  describeServices: function() {

    this.logger.info('Fetching service descriptions from ECS');
    var serviceArns = Object.keys(this.serviceArns);

    if (serviceArns.length <= 0) {
      throw new Error('No serviceArns set, run listServices or setServiceArns');
    }

    this.logger.debug('describeServices this.serviceArns');
    this.logger.debug(this.serviceArns);

    var promises = [];
    for (var clusterArn in this.serviceArns) {
      var params = {
        services: this.serviceArns[clusterArn],
        cluster: clusterArn
      };

      this.logger.debug('describeServices request parameters', params);

      var promise = new Promise((resolve) => {
        this.ecs.describeServices(params, (err, data) => {
          if (err) {
            throw new Error(err);
          }

          this.logger.debug('describeServices callback response for cluster: ' + clusterArn, util.inspect(data, { showHidden: true, depth: null }));

          return resolve(data);
        });
      });

      promises.push(promise);

    }

    return Promise.all(promises).then((values) => {


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

    var promises = [];
    var services = this.serviceDescriptions;

    for (var serviceArn in services) {

      this.logger.info('Fetching tasks for service: ' + serviceArn);

      var service = services[serviceArn];

      var params = {
        cluster: service.clusterArn,
        serviceName: service.serviceName,
        maxResults: 100,
      };

      var promise = new Promise((resolve) => {
        this.ecs.listTasks(params, (err, data) => {

          if (err) {
            throw new Error(err); // an error occurred
          } else {
            this.logger.debug('listTasks callback response for service: ' + service.serviceArn, util.inspect(data, { showHidden: true, depth: null }));           // successful response
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

    return Promise.all(promises).then((values) => {

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

    var promises = [];

    for (var i=0; i<clusterArns.length; i++) {

      var clusterArn = clusterArns[i];
      var taskArns = this.clusterArns[clusterArn].tasks;

      this.logger.info('Fetching task descriptions for cluster: ' + clusterArn);

      var params = {
        tasks: taskArns,
        cluster: clusterArn
      };

      this.logger.debug('describeTasks for cluster: ' + clusterArn + ' request parameters', params);

      var promise = new Promise((resolve) => {
        this.ecs.describeTasks(params, (err, data) => {

          if (err) {
            throw new Error(err); // an error occurred
          } else {

            this.logger.debug('describeTasks callback response for cluster: ' + clusterArn, util.inspect(data, { showHidden: true, depth: null }));           // successful response
            return resolve(data);
          }
        });
      });
      promises.push(promise);
    }

    //describe all tasks
    return Promise.all(promises).then((values) => {

      var data = [];
      for (var i=0; i<values.length; i++) {
        data = data.concat(values[i].tasks);
      }
      return data;
    });
  },

  processTaskDescriptions: function (data) {


    this.logger.info('Extracting task defintions from task descriptions');
    if (data.length <= 0) {
      throw new Error("No task descriptions returned");
    }

    var tasks = data;
    for (var i=0; i<tasks.length; i++) {

      var task = tasks[i];
      var taskDef = task.taskDefinitionArn.toLowerCase();
      if (taskDef.indexOf(this.vargs.family.toLowerCase()) == -1) {
        //skip this task as it doesn't match
        this.logger.debug('Skipping task deifnition as no match to family: '+ this.vargs.family + ' taskdef Arn: ' + task.taskDefinitionArn);
        continue;
      }
      if (!(task.taskDefinitionArn in this.taskDefinitionArns)) {
        this.taskDefinitionArns[task.taskDefinitionArn] = [];
      }

      task.serviceArn = this.taskArns[task.taskArn].serviceArn;

      this.taskDefinitionArns[task.taskDefinitionArn] = task;

      this.logger.info('Matched Task Defintion for service: ' + task.serviceArn, task.taskDefinitionArn);

    }

    if (Object.keys(this.taskDefinitionArns).length <= 0) {
      throw new Error('No task definitions found');
    }

  },

  describeTaskDefinitions: function () {

    this.logger.info('Fetching Task Defintion descriptions from ECS');

    if (Object.keys(this.taskDefinitionArns).length <= 0) {
      throw new Error('No task definitions set');
    }

    var promises = [];
    for (var taskDefArn in this.taskDefinitionArns) {

      var params = {
        taskDefinition: taskDefArn
      };

      var promise = new Promise((resolve) => {
        this.ecs.describeTaskDefinition(params, (err, data) => {
          if (err) {
            throw new Error(err); // an error occurred
          } else {
            this.logger.debug('describeTaskDefinitionss callback response for task def: ' + taskDefArn, util.inspect(data, { showHidden: true, depth: null }));           // successful response
            return resolve(data);
          }
        });
      });

      promises.push(promise);
    }

    return Promise.all(promises).then((values) => {

      var taskDefs = [];
      for (var i=0; i<values.length; i++) {

        //var cluster = values[i].cluster;
        //var service = values[i].service;
        //taskArns[cluster][service] = values[i].taskArns;
        var taskDef = values[i].taskDefinition;
        if (taskDef.status == 'ACTIVE') {

          var task = this.taskDefinitionArns[taskDef.taskDefinitionArn];

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

    this.logger.info('Creating new Task Defintions');
    if (data.length <= 0) {
      throw new Error("No ACTIVE task definitions found in selection");
    }

    this.taskDefinitions = data;

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
        if (name.toLowerCase() == this.vargs.containerName.toLowerCase()) {
          taskDef.containerDefinitions[x].image = this.vargs.imageName + ":" + this.vargs.imageTag
        }
      }

      //need to do some magic here that will merge the updated
      //config if any.
      /*
      todo
       */
      if (this.vargs.taskDefinition !== null) {
        if (Object.keys(this.vargs.taskDefinition).length > 0) {
        this.logger.debug('Defintion before merge', util.inspect(taskDef, { showHidden: true, depth: null }));

          taskDef = this.mergeObjects(taskDef, this.vargs.taskDefinition);

        }
      }

      //remove fields that aren't required for new definition
      delete taskDef.taskDefinitionArn;
      delete taskDef.revision;
      delete taskDef.status;
      delete taskDef.requiresAttributes;

      this.logger.info('Attempting to register new Task Defintion', util.inspect(taskDef, { showHidden: true, depth: null }));
      var promise = new Promise((resolve) => {
        this.ecs.registerTaskDefinition(taskDef, (err, data) => {
          if (err) {
            throw new Error(err); // an error occurred
          } else {
            this.logger.debug('registerTaskDefinitions callback response for service: ' + serviceArn, util.inspect(data, { showHidden: true, depth: null }));           // successful response
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

    return Promise.all(promises).then((values) => {

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
    this.logger.info('Updating services');

    if (taskDefs.length <= 0) {
      throw new Error("no task definitions have been created");
    }

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

      this.logger.debug('updateService request parameters', params);

      var promise = new Promise((resolve) => {
        this.ecs.updateService(params, (err, data) => {
         if (err) {
            throw new Error(err); // an error occurred
          } else {
            this.logger.debug('updateService callback response for service: ' + taskDef.serviceArn + ' task def: ' + taskDef.family, util.inspect(data, { showHidden: true, depth: null }));           // successful response
            return resolve(data);
          }
        });
      });
      promises.push(promise);
    }

    return Promise.all(promises).then((values) => {

      for (var i=0; i<values.length; i++) {
        this.logger.info('Service: ' + values[i].service.serviceName + " updated");
      }
      return values;
    });
  },

  mergeObjectArray: function (target, source) {


    var objKeys = Object.keys(source[0]);

    //walk through objects in the array
    for (var i=0; i<source.length; i++) {

      var newObj = source[i];

      //check if any keys have been defined
      //to match the object
      if (!('keys' in newObj)) {
        //no keys so it must be a new item
        //add it to the array
        target.push(newObj);
        continue;
      }

        //otherwise cycle through all the other objects
        //in the array and to find an object that matches the keys
      for (var y=0; y<target.length; y++) {
        var oldObj = target[y];

        var matched = 0;
        for (var a=0; a<newObj.keys.length; a++) {
          var key = newObj.keys[a];
          if (!(key in oldObj) || oldObj[key] != newObj[key]) {
            break;
          }
          matched++;
        }

        //if find a match, update all other
        //parameters that aren't keys
        if (matched == newObj.keys.length) {
          if ('remove' in newObj) {
            target.splice(y, 1);
            continue;
          }

          for (var param in newObj) {
            if (newObj.keys.indexOf(param) == -1 && param != 'keys') {

              if(!(param in oldObj)){
                continue;
              }

              if (typeof oldObj[param] == 'object' || (util.isArray(oldObj[param]) && oldObj[param].length > 0)) {

                oldObj[param] = this.mergeObjects(oldObj[param],newObj[param]);

                continue;
              }
              oldObj[param] = newObj[param];
            }
          }
          target[y] = oldObj;
        }
      }
    }
    return target;
  },


  mergeObjects: function (target, source) {

    if (typeof source == 'undefined') {
      return target;
    } else if (typeof target == 'undefined') {
      return source;
    }

    if (util.isArray(source)) {

        if (source.length <= 0 ) {
          target = source;
          return target;
        }

        //its an array of objects so process the objects in the array
        if(typeof source[0] == 'object' && !util.isArray(source[0])) {

          target = this.mergeObjectArray(target, source);
          return target;
        }

        //it's just a normal array of values
        //iterate over the array and set values as needed
        //need to think about how to delete item from the array
        for (var i=0; i < source.length; i++) {

          var value = source[i];

          if (target.indexOf(value) == -1)  {
             target.push(value);
          }
        }
        return target;
    }

    if (typeof source == 'object') {

      for (var param in source) {

        if (!(param in target)) {
          this.logger.warn(param + 'param not found in target');
          continue;
        }

        if (typeof source[param] == 'object') {
          target[param] = this.mergeObjects(target[param], source[param]);
          continue;
        }
        target[param] = source[param];
      }
      return target;
    }

    return source;
  }

});

module.exports = ecsService;


plugin.parse().then(function (params) {

  params = humps.camelizeKeys(params);

  console.log(params);
  // gets build and repository information for
  // the current running build
  const workspace = params.workspace;
  const build = params.build;
  const repo  = params.repo;

  // gets plugin-specific parameters defined in
  // the .drone.yml file
  const vargs = params.vargs;


  var logLevels = [
    'info',
    'fatal',
    'error',
    'warn',
    'debug',
    'trace'
  ];

  var logLevel = 'info';

  if (logLevels.indexOf(vargs.logLevel) != -1) {
    logLevel = vargs.logLevel;
  }


  const logger = bunyan.createLogger({name: 'drone-ecs-node'});


  logger.level(logLevel);

  logger.info('Validating Paramters');

  if (vargs.accessKey.length == 0) {
    logger.error("Please provide an access key");

    return process.exit(1);
  }

  if (vargs.secretKey.length == 0) {
    logger.error("Please provide a secret key");

    return process.exit(1);
  }

  if (vargs.region.length == 0) {
    logger.error("Please provide a region");

    return process.exit(1);
  }

  if (vargs.family.length == 0) {
    logger.error("Please provide a task definition family name");

    return process.exit(1);
  }

  if (vargs.cluster.length == 0) {
    logger.error("Please provide a cluster name");

    return process.exit(1);
  }

  if (vargs.imageName.length == 0) {
    logger.error("Please provide an image name");

    return process.exit(1);
  }

  if (vargs.service.length == 0) {
    logger.error("Please provide a service name");

    return process.exit(1);
  }

  if (vargs.taskDefinition === '' || vargs.taskDefinition === false || vargs.taskDefinition === null) {

    vargs.taskDefinition == null;

  } else {
    vargs.taskDefinition = jsonfile.readFileSync(workspace.path + '/' + vargs.taskDefinition);
  }

  if (vargs.imageTag.length == 0) {
    vargs.Tag = "latest";
  }



  var awsOptions = {
    accessKeyId:      vargs.accessKey,
    secretAccessKey:  vargs.secretKey,
    region:           vargs.region,
  };

  console.log(awsOptions);

  var ecs = new ecsService(awsOptions, vargs, logger);

  /*
  1. list clusters and find the cluster arns
  2. list services in clusters and find the service arns
  3. describe the services and find the task def arns
  4. describe the task definitions
  5. merge the updated task config if any
  6. check the min / max services allow for auto update of service
  7. if they don't then throw error for now (need to handle this later down the track)
  8. if they do then updateservice
  */

  return ecs.listClusters()
  .then(function (data) {

    logger.debug('list clusters', util.inspect(data, { showHidden: true, depth: null }));
    ecs.processClusters(data);
    return ecs.listServices();
  })
  .then(function (data) {

    logger.debug('list services', util.inspect(data, { showHidden: true, depth: null }));
    ecs.processServicesList(data);
    return ecs.describeServices();
  })
  .then(function (data) {

    logger.debug('describe services', util.inspect(data, { showHidden: true, depth: null }));
    ecs.processServiceDescriptions(data);
    return ecs.listTasks();
  })
  .then(function (data) {

    logger.debug('list tasks', util.inspect(data, { showHidden: true, depth: null }));
    ecs.processTasksList(data);
    return ecs.describeTasks();
  })
  .then(function (data) {

    logger.debug('describe tasks', util.inspect(data, { showHidden: true, depth: null }));
    ecs.processTaskDescriptions(data);
    return ecs.describeTaskDefinitions();
  })
  .then(function (data) {

    logger.debug('describe task definitions', util.inspect(data, { showHidden: true, depth: null }));
    return ecs.registerTaskDefinitions(data);
  })
  .then(function (data) {

    logger.info('Register Task Defintions Success:', util.inspect(data, { showHidden: true, depth: null }));
    return ecs.updateServices(data);
  })
  .then(function (data) {

    logger.info('Update Service Success:', util.inspect(data, { showHidden: true, depth: null }));
    logger.info('everything worked');
    return process.exit(0);

  })
  .catch(function (err) {

    logger.fatal('ECS Error', err, err.stack);
    return process.exit(1);
  });
})
.catch(function (err) {

  console.log('Dron Plugin Error', err, err.stack);
  return process.exit(1);
});


/*
function  mergeRecursive(obj1, obj2) {

    for (var p in obj2) {
      if (p in obj1) {

        // Property in destination object set; update its value.
        if (Object.prototype.toString.call(obj2[p]) == '[object Array]') {

          obj1[p] = this.mergeArrays(obj1[p], obj2[p]);

        } else if (Object.prototype.toString.call(obj2[p]) == '[object Object]') {

          obj1[p] = MergeRecursive(obj1[p], obj2[p]);

        } else {

          obj1[p] = obj2[p];
        }

      }
    }

    return obj1;
  }

function mergeArrays (arr1, arr2) {

    for (var i=0; i<arr2; i++) {

      var value = arr2[i];
      if (Object.prototype.toString.call(arr2[i]) == '[object Object]') {
        value = this.mergeRecursive(arr1[i])
      } else {
        if (Object.prototype.toString.call(arr2[i]) == '[object Array]') {
          value = this.mergeArrays

      }
      if (arr1.indexOf(value) == -1) {
        arr1.push(value)
      }
    }
  }
*/
//testing
/*
var taskDef = {

         containerDefinitions:
          [ {
              name: 'dashboard',
              portMappings:
            [ { containerPort: 80, hostPort: 8070, protocol: 'udp' , keys:['containerPort', 'hostPort']}],
               environment: [
                  { name: 'TEST', value: '1234'},
                  { name: 'NODE_ENV', value: 'test', keys: ['name']}
              ],
              links: ['a'],
              keys: ['name']
            }
          ]
      };

var full = {
      containerDefinitions:
       [ { name: 'dashboard',
           image: 'registry.engagementcoach.com.au/frontend-prod:8',
           cpu: 110,
           memory: 496,
           links: ['a', 'b'],
           portMappings:
            [ { containerPort: 80, hostPort: 8070, protocol: 'tcp' }],
           essential: true,
           entryPoint: [],
           command: [],
           environment:
            [ { name: 'NODE_ENV', value: 'production' },
              { name: 'PASSENGER_APP_ENV', value: 'production' },
              { name: 'DB_ENDPOINT', value: '10.0.1.24' },
              { name: 'NEW_RELIC_LICENSE_KEY',
                value: '159cc7eb7e0135f8f5c8e994cc373c883b8fec24' }
            ],
           mountPoints: [],
           volumesFrom: []
         },
      ],
      family: 'CoreProduction-DashboardTaskDefinition-95B14AZIHVJ1',
      revision: 20,
      volumes: [],
      status: 'ACTIVE'
    };


var a = {           environment:
            [ { name: 'NODE_ENV', value: 'production' },
              { name: 'PASSENGER_APP_ENV', value: 'production' },
              { name: 'DB_ENDPOINT', value: '10.0.1.24' },
              { name: 'NEW_RELIC_LICENSE_KEY',
                value: '159cc7eb7e0135f8f5c8e994cc373c883b8fec24' }
            ]
          };

var b = {
                environment: [
                  { name: 'TEST', value: '1234'},
                  { name: 'NODE_ENV', value: 'test', keys: ['name'] }
              ]
            };


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
  LogLevel: 'debug',
  TaskDefinition: taskDef
}

//console.log('args', process.argv);

params = JSON.parse(process.argv[3]);

vargs = params.vargs;
console.log(vargs.TaskDefinition);
vargs.TaskDefinition = null;//jsonfile.readFileSync('/data/dev/golang/src/github.com/fridaystreet/drone-ecs-node/'+vargs.TaskDefinition);

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

      logger.debug('list clusters', util.inspect(data, { showHidden: true, depth: null }));
      ecs.processClusters(data);
      return ecs.listServices();
    })
    .then(function (data) {

      logger.debug('list services', util.inspect(data, { showHidden: true, depth: null }));
      ecs.processServicesList(data);
      return ecs.describeServices();
    })
    .then(function (data) {

      logger.debug('describe services', util.inspect(data, { showHidden: true, depth: null }));
      ecs.processServiceDescriptions(data);
      return ecs.listTasks();
    })
    .then(function (data) {

      logger.debug('list tasks', util.inspect(data, { showHidden: true, depth: null }));
      ecs.processTasksList(data);
      return ecs.describeTasks();
    })
    .then(function (data) {

      logger.debug('describe tasks', util.inspect(data, { showHidden: true, depth: null }));
      ecs.processTaskDescriptions(data);
      return ecs.describeTaskDefinitions();
    })
    .then(function (data) {

      logger.debug('describe task definitions', util.inspect(data, { showHidden: true, depth: null }));
      return ecs.registerTaskDefinitions(data);
    })
    .then(function (data) {

      logger.info('Register Task Defintions Success:', util.inspect(data, { showHidden: true, depth: null }));
      return ecs.updateServices(data);
    })
    .then(function (data) {

      logger.info('Update Service Success:', util.inspect(data, { showHidden: true, depth: null }));
      logger.info('everything worked');
      return process.exit(0);

    })
    .catch(function (err) {

      logger.error('catch', err, err.stack);
      return process.exit(1);
    });
*/
