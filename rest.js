'use strict';

var _cache = require('./cache');

var _cache2 = _interopRequireDefault(_cache);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// This file contains helpers for running operations in REST format.
// The goal is that handlers that explicitly handle an express route
// should just be shallow wrappers around things in this file, but
// these functions should not explicitly depend on the request
// object.
// This means that one of these handlers can support multiple
// routes. That's useful for the routes that do really similar
// things.

var Parse = require('parse/node').Parse;


var RestQuery = require('./RestQuery');
var RestWrite = require('./RestWrite');
var triggers = require('./triggers');

// Returns a promise for an object with optional keys 'results' and 'count'.
function find(config, auth, className, restWhere, restOptions) {
  enforceRoleSecurity('find', className, auth);
  var query = new RestQuery(config, auth, className, restWhere, restOptions);
  return query.execute();
}

// Returns a promise that doesn't resolve to any useful value.
function del(config, auth, className, objectId) {
  if (typeof objectId !== 'string') {
    throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad objectId');
  }

  if (className === '_User' && !auth.couldUpdateUserId(objectId)) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'insufficient auth to delete user');
  }

  enforceRoleSecurity('delete', className, auth);

  var inflatedObject;

  return Promise.resolve().then(function () {
    if (triggers.getTrigger(className, triggers.Types.beforeDelete, config.applicationId) || triggers.getTrigger(className, triggers.Types.afterDelete, config.applicationId) || className == '_Session') {
      return find(config, auth, className, { objectId: objectId }).then(function (response) {
        if (response && response.results && response.results.length) {
          response.results[0].className = className;
          _cache2.default.users.remove(response.results[0].sessionToken);
          inflatedObject = Parse.Object.fromJSON(response.results[0]);
          return triggers.maybeRunTrigger(triggers.Types.beforeDelete, auth, inflatedObject, null, config.applicationId);
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for delete.');
      });
    }
    return Promise.resolve({});
  }).then(function () {
    if (!auth.isMaster) {
      return auth.getUserRoles();
    } else {
      return Promise.resolve();
    }
  }).then(function () {
    var options = {};
    if (!auth.isMaster) {
      options.acl = ['*'];
      if (auth.user) {
        options.acl.push(auth.user.id);
        options.acl = options.acl.concat(auth.userRoles);
      }
    }

    return config.database.destroy(className, {
      objectId: objectId
    }, options);
  }).then(function () {
    triggers.maybeRunTrigger(triggers.Types.afterDelete, auth, inflatedObject, null, config.applicationId);
    return Promise.resolve();
  });
}

// TODO FOR CLASS DELETION
function delClass(config, auth, className) {
  if(className === "") {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'class name not provided');
  }

  if (className === '_User' ||
      className === "_Installation" ||
      className === "_Role" ||
      className === "_Session" ||
      className === "_Product" ||
      className === "_Default") {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'builtin classes cannot be deleted: ' + className);
  }

  enforceRoleSecurity('delete', className, auth);

  return Promise.resolve().then(function () {
    if(!auth.isMaster) {
      throw new Parse.Error(Parse.Error.SESSION_MISSING, 'unauthorized request to remove class ' + className);
    }
  }).then(function () {
    return config.database.destroyClass(className);
  }).then(function () {
    return Promise.resolve();
  });


}

// Returns a promise for a {response, status, location} object.
function create(config, auth, className, restObject) {
  enforceRoleSecurity('create', className, auth);

  var write = new RestWrite(config, auth, className, null, restObject);
  return write.execute();
}

// Returns a promise that contains the fields of the update that the
// REST API is supposed to return.
// Usually, this is just updatedAt.
function update(config, auth, className, objectId, restObject) {
  enforceRoleSecurity('update', className, auth);

  return Promise.resolve().then(function () {
    if (triggers.getTrigger(className, triggers.Types.beforeSave, config.applicationId) || triggers.getTrigger(className, triggers.Types.afterSave, config.applicationId)) {
      return find(config, auth, className, { objectId: objectId });
    }
    return Promise.resolve({});
  }).then(function (response) {
    var originalRestObject;
    if (response && response.results && response.results.length) {
      originalRestObject = response.results[0];
    }

    var write = new RestWrite(config, auth, className, { objectId: objectId }, restObject, originalRestObject);
    return write.execute();
  });
}

// Disallowing access to the _Role collection except by master key
function enforceRoleSecurity(method, className, auth) {
  /*
  if (className === '_Role' && !auth.isMaster) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Clients aren\'t allowed to perform the ' + method + ' operation on the role collection.');
  }
  */
  if (method === 'delete' && className === '_Installation' && !auth.isMaster) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Clients aren\'t allowed to perform the ' + 'delete operation on the installation collection.');
  }
}

module.exports = {
  create: create,
  del: del,
  // TODO FOR MASS OBJECT DELETION
  delClass: delClass,
  find: find,
  update: update
};