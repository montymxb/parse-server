"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HooksController = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /**  weak */

var _DatabaseAdapter = require("../DatabaseAdapter");

var DatabaseAdapter = _interopRequireWildcard(_DatabaseAdapter);

var _triggers = require("../triggers");

var triggers = _interopRequireWildcard(_triggers);

var _node = require("parse/node");

var Parse = _interopRequireWildcard(_node);

var _request = require("request");

var request = _interopRequireWildcard(_request);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var DefaultHooksCollectionName = "_Hooks";

var HooksController = exports.HooksController = function () {
  function HooksController(applicationId) {
    var collectionPrefix = arguments.length <= 1 || arguments[1] === undefined ? '' : arguments[1];

    _classCallCheck(this, HooksController);

    this._applicationId = applicationId;
    this._collectionPrefix = collectionPrefix;
  }

  _createClass(HooksController, [{
    key: "database",
    value: function database() {
      return DatabaseAdapter.getDatabaseConnection(this._applicationId, this._collectionPrefix);
    }
  }, {
    key: "collection",
    value: function collection() {
      var _this = this;

      if (this._collection) {
        return Promise.resolve(this._collection);
      }
      return this.database().rawCollection(DefaultHooksCollectionName).then(function (collection) {
        _this._collection = collection;
        return collection;
      });
    }
  }, {
    key: "getFunction",
    value: function getFunction(functionName) {
      return this.getOne({ functionName: functionName });
    }
  }, {
    key: "getFunctions",
    value: function getFunctions() {
      return this.get({ functionName: { $exists: true } });
    }
  }, {
    key: "getTrigger",
    value: function getTrigger(className, triggerName) {
      return this.getOne({ className: className, triggerName: triggerName });
    }
  }, {
    key: "getTriggers",
    value: function getTriggers() {
      return this.get({ className: { $exists: true }, triggerName: { $exists: true } });
    }
  }, {
    key: "deleteFunction",
    value: function deleteFunction(functionName) {
      triggers.removeFunction(functionName, this._applicationId);
      return this.delete({ functionName: functionName });
    }
  }, {
    key: "deleteTrigger",
    value: function deleteTrigger(className, triggerName) {
      triggers.removeTrigger(triggerName, className, this._applicationId);
      return this.delete({ className: className, triggerName: triggerName });
    }
  }, {
    key: "delete",
    value: function _delete(query) {
      return this.collection().then(function (collection) {
        return collection.remove(query);
      }).then(function (res) {
        return {};
      }, 1);
    }
  }, {
    key: "getOne",
    value: function getOne(query) {
      return this.collection().then(function (coll) {
        return coll.findOne(query, { _id: 0 });
      }).then(function (hook) {
        return hook;
      });
    }
  }, {
    key: "get",
    value: function get(query) {
      return this.collection().then(function (coll) {
        return coll.find(query, { _id: 0 }).toArray();
      }).then(function (hooks) {
        return hooks;
      });
    }
  }, {
    key: "getHooks",
    value: function getHooks() {
      return this.collection().then(function (coll) {
        return coll.find({}, { _id: 0 }).toArray();
      }).then(function (hooks) {
        return hooks;
      }, function () {
        return [];
      });
    }
  }, {
    key: "saveHook",
    value: function saveHook(hook) {

      var query;
      if (hook.functionName && hook.url) {
        query = { functionName: hook.functionName };
      } else if (hook.triggerName && hook.className && hook.url) {
        query = { className: hook.className, triggerName: hook.triggerName };
      } else {
        throw new Parse.Error(143, "invalid hook declaration");
      }
      return this.collection().then(function (collection) {
        return collection.update(query, hook, { upsert: true });
      }).then(function (res) {
        return hook;
      });
    }
  }, {
    key: "addHookToTriggers",
    value: function addHookToTriggers(hook) {
      var wrappedFunction = wrapToHTTPRequest(hook);
      wrappedFunction.url = hook.url;
      if (hook.className) {
        triggers.addTrigger(hook.triggerName, hook.className, wrappedFunction, this._applicationId);
      } else {
        triggers.addFunction(hook.functionName, wrappedFunction, null, this._applicationId);
      }
    }
  }, {
    key: "addHook",
    value: function addHook(hook) {
      this.addHookToTriggers(hook);
      return this.saveHook(hook);
    }
  }, {
    key: "createOrUpdateHook",
    value: function createOrUpdateHook(aHook) {
      var hook;
      if (aHook && aHook.functionName && aHook.url) {
        hook = {};
        hook.functionName = aHook.functionName;
        hook.url = aHook.url;
      } else if (aHook && aHook.className && aHook.url && aHook.triggerName && triggers.Types[aHook.triggerName]) {
        hook = {};
        hook.className = aHook.className;
        hook.url = aHook.url;
        hook.triggerName = aHook.triggerName;
      } else {
        throw new Parse.Error(143, "invalid hook declaration");
      }

      return this.addHook(hook);
    }
  }, {
    key: "createHook",
    value: function createHook(aHook) {
      var _this2 = this;

      if (aHook.functionName) {
        return this.getFunction(aHook.functionName).then(function (result) {
          if (result) {
            throw new Parse.Error(143, "function name: " + aHook.functionName + " already exits");
          } else {
            return _this2.createOrUpdateHook(aHook);
          }
        });
      } else if (aHook.className && aHook.triggerName) {
        return this.getTrigger(aHook.className, aHook.triggerName).then(function (result) {
          if (result) {
            throw new Parse.Error(143, "class " + aHook.className + " already has trigger " + aHook.triggerName);
          }
          return _this2.createOrUpdateHook(aHook);
        });
      }

      throw new Parse.Error(143, "invalid hook declaration");
    }
  }, {
    key: "updateHook",
    value: function updateHook(aHook) {
      var _this3 = this;

      if (aHook.functionName) {
        return this.getFunction(aHook.functionName).then(function (result) {
          if (result) {
            return _this3.createOrUpdateHook(aHook);
          }
          throw new Parse.Error(143, "no function named: " + aHook.functionName + " is defined");
        });
      } else if (aHook.className && aHook.triggerName) {
        return this.getTrigger(aHook.className, aHook.triggerName).then(function (result) {
          if (result) {
            return _this3.createOrUpdateHook(aHook);
          }
          throw new Parse.Error(143, "class " + aHook.className + " does not exist");
        });
      }
      throw new Parse.Error(143, "invalid hook declaration");
    }
  }, {
    key: "load",
    value: function load() {
      var _this4 = this;

      return this.getHooks().then(function (hooks) {
        hooks = hooks || [];
        hooks.forEach(function (hook) {
          _this4.addHookToTriggers(hook);
        });
      });
    }
  }]);

  return HooksController;
}();

function wrapToHTTPRequest(hook) {
  return function (req, res) {
    var jsonBody = {};
    for (var i in req) {
      jsonBody[i] = req[i];
    }
    if (req.object) {
      jsonBody.object = req.object.toJSON();
      jsonBody.object.className = req.object.className;
    }
    if (req.original) {
      jsonBody.original = req.original.toJSON();
      jsonBody.original.className = req.original.className;
    }
    var jsonRequest = {};
    jsonRequest.headers = {
      'Content-Type': 'application/json'
    };
    jsonRequest.body = JSON.stringify(jsonBody);

    request.post(hook.url, jsonRequest, function (err, httpResponse, body) {
      var result;
      if (body) {
        if (typeof body == "string") {
          try {
            body = JSON.parse(body);
          } catch (e) {
            err = { error: "Malformed response", code: -1 };
          }
        }
        if (!err) {
          result = body.success;
          err = body.error;
        }
      }
      if (err) {
        return res.error(err);
      } else {
        return res.success(result);
      }
    });
  };
}

exports.default = HooksController;