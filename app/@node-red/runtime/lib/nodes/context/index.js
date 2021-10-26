/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * */

const clone = require("clone");
const { log } = require("@node-red/util");
const { util } = require("@node-red/util");
const memory = require("./memory");

let settings;

// A map of scope id to context instance
let contexts = {};

// A map of store name to instance
let stores = {};
let storeList = [];
let defaultStore;

// Whether there context storage has been configured or left as default
let hasConfiguredStore = false;

// Unknown Stores
const unknownStores = {};

function logUnknownStore(name) {
  if (name) {
    let count = unknownStores[name] || 0;
    if (count == 0) {
      log.warn(log._("context.unknown-store", { name }));
      count++;
      unknownStores[name] = count;
    }
  }
}

function init(_settings) {
  settings = _settings;
  contexts = {};
  stores = {};
  storeList = [];
  hasConfiguredStore = false;
  const seed = settings.functionGlobalContext || {};
  contexts.global = createContext("global", seed);
  // create a default memory store - used by the unit tests that skip the full
  // `load()` initialisation sequence.
  // If the user has any stores configured, this will be disgarded
  stores._ = new memory();
  defaultStore = "memory";
}

function load() {
  return new Promise((resolve, reject) => {
    // load & init plugins in settings.contextStorage
    const plugins = settings.contextStorage || {};
    let defaultIsAlias = false;
    const promises = [];
    if (plugins && Object.keys(plugins).length > 0) {
      const hasDefault = plugins.hasOwnProperty("default");
      let defaultName;
      for (const pluginName in plugins) {
        if (plugins.hasOwnProperty(pluginName)) {
          // "_" is a reserved name - do not allow it to be overridden
          if (pluginName === "_") {
            continue;
          }
          if (!/^[a-zA-Z0-9_]+$/.test(pluginName)) {
            return reject(
              new Error(log._("context.error-invalid-module-name", { name: pluginName })),
            );
          }

          // Check if this is setting the 'default' context to be a named plugin
          if (pluginName === "default" && typeof plugins[pluginName] === "string") {
            // Check the 'default' alias exists before initialising anything
            if (!plugins.hasOwnProperty(plugins[pluginName])) {
              return reject(
                new Error(
                  log._("context.error-invalid-default-module", { storage: plugins.default }),
                ),
              );
            }
            defaultIsAlias = true;
            continue;
          }
          if (!hasDefault && !defaultName) {
            defaultName = pluginName;
          }
          var plugin;
          if (plugins[pluginName].hasOwnProperty("module")) {
            // Get the provided config and copy in the 'approved' top-level settings (eg userDir)
            const config = plugins[pluginName].config || {};
            copySettings(config, settings);

            if (typeof plugins[pluginName].module === "string") {
              // This config identifies the module by name - assume it is a built-in one
              // TODO: check it exists locally, if not, try to require it as-is
              try {
                plugin = require(`./${plugins[pluginName].module}`);
              } catch (err) {
                return reject(
                  new Error(
                    log._("context.error-loading-module2", {
                      module: plugins[pluginName].module,
                      message: err.toString(),
                    }),
                  ),
                );
              }
            } else {
              // Assume `module` is an already-required module we can use
              plugin = plugins[pluginName].module;
            }
            try {
              // Create a new instance of the plugin by calling its module function
              stores[pluginName] = plugin(config);
              let moduleInfo = plugins[pluginName].module;
              if (typeof moduleInfo !== "string") {
                if (moduleInfo.hasOwnProperty("toString")) {
                  moduleInfo = moduleInfo.toString();
                } else {
                  moduleInfo = "custom";
                }
              }
              log.info(
                log._("context.log-store-init", { name: pluginName, info: `module=${moduleInfo}` }),
              );
            } catch (err) {
              return reject(
                new Error(
                  log._("context.error-loading-module2", {
                    module: pluginName,
                    message: err.toString(),
                  }),
                ),
              );
            }
          } else {
            // Plugin does not specify a 'module'
            return reject(
              new Error(log._("context.error-module-not-defined", { storage: pluginName })),
            );
          }
        }
      }

      // Open all of the configured contexts
      for (var plugin in stores) {
        if (stores.hasOwnProperty(plugin)) {
          promises.push(stores[plugin].open());
        }
      }
      // There is a 'default' listed in the configuration
      if (hasDefault) {
        // If 'default' is an alias, point it at the right module - we have already
        // checked that it exists. If it isn't an alias, then it will
        // already be set to a configured store
        if (defaultIsAlias) {
          stores._ = stores[plugins.default];
          defaultStore = plugins.default;
        } else {
          stores._ = stores.default;
          defaultStore = "default";
        }
      } else if (defaultName) {
        // No 'default' listed, so pick first in list as the default
        stores._ = stores[defaultName];
        defaultStore = defaultName;
        defaultIsAlias = true;
      } else {
        // else there were no stores list the config object - fall through
        // to below where we default to a memory store
        storeList = ["memory"];
        defaultStore = "memory";
      }
      hasConfiguredStore = true;
      storeList = Object.keys(stores).filter(
        (n) => !(defaultIsAlias && n === "default") && n !== "_",
      );
    } else {
      // No configured plugins
      log.info(log._("context.log-store-init", { name: "default", info: "module=memory" }));
      promises.push(stores._.open());
      storeList = ["memory"];
      defaultStore = "memory";
    }
    return resolve(Promise.all(promises));
  }).catch((err) => {
    throw new Error(log._("context.error-loading-module", { message: err.toString() }));
  });
}

function copySettings(config, settings) {
  const copy = ["userDir"];
  config.settings = {};
  copy.forEach((setting) => {
    config.settings[setting] = clone(settings[setting]);
  });
}

function getContextStorage(storage) {
  if (stores.hasOwnProperty(storage)) {
    // A known context
    return stores[storage];
  }
  if (stores.hasOwnProperty("_")) {
    // Not known, but we have a default to fall back to
    if (storage !== defaultStore) {
      // It isn't the default store either, so log it
      logUnknownStore(storage);
    }
    return stores._;
  }
}

function followParentContext(parent, key) {
  if (key === "$parent") {
    return [parent, undefined];
  }
  if (key.startsWith("$parent.")) {
    const len = "$parent.".length;
    let new_key = key.substring(len);
    let ctx = parent;
    while (ctx && new_key.startsWith("$parent.")) {
      ctx = ctx.$parent;
      new_key = new_key.substring(len);
    }
    return [ctx, new_key];
  }
  return null;
}

function validateContextKey(key) {
  try {
    const keys = Array.isArray(key) ? key : [key];
    if (!keys.length) {
      return false;
    } // no key to get/set
    for (let index = 0; index < keys.length; index++) {
      const k = keys[index];
      if (typeof k !== "string" || !k.length) {
        return false; // not string or zero-length
      }
    }
  } catch (error) {
    return false;
  }
  return true;
}

function createContext(id, seed, parent) {
  // Seed is only set for global context - sourced from functionGlobalContext
  const scope = id;
  const obj = seed || {};
  let seedKeys;
  let insertSeedValues;
  if (seed) {
    seedKeys = Object.keys(seed);
    insertSeedValues = function (keys, values) {
      if (!Array.isArray(keys)) {
        if (values[0] === undefined) {
          try {
            values[0] = util.getObjectProperty(seed, keys);
          } catch (err) {
            if (err.code === "INVALID_EXPR") {
              throw err;
            }
            values[0] = undefined;
          }
        }
      } else {
        for (let i = 0; i < keys.length; i++) {
          if (values[i] === undefined) {
            try {
              values[i] = util.getObjectProperty(seed, keys[i]);
            } catch (err) {
              if (err.code === "INVALID_EXPR") {
                throw err;
              }
              values[i] = undefined;
            }
          }
        }
      }
    };
  }

  Object.defineProperties(obj, {
    get: {
      configurable: true,
      value(key, storage, callback) {
        let context;
        if (!callback && typeof storage === "function") {
          callback = storage;
          storage = undefined;
        }
        if (callback && typeof callback !== "function") {
          throw new Error("Callback must be a function");
        }
        if (!validateContextKey(key)) {
          const err = Error("Invalid context key");
          if (callback) {
            return callback(err);
          }
          throw err;
        }
        if (!Array.isArray(key)) {
          const keyParts = util.parseContextStore(key);
          key = keyParts.key;
          if (!storage) {
            storage = keyParts.store || "_";
          }
          const result = followParentContext(parent, key);
          if (result) {
            const [ctx, new_key] = result;
            if (ctx && new_key) {
              return ctx.get(new_key, storage, callback);
            }

            if (callback) {
              return callback(undefined);
            }

            return undefined;
          }
        } else if (!storage) {
          storage = "_";
        }
        context = getContextStorage(storage);

        if (callback) {
          if (!seed) {
            context.get(scope, key, callback);
          } else {
            context.get(scope, key, function () {
              if (arguments[0]) {
                callback(arguments[0]);
                return;
              }
              const results = Array.prototype.slice.call(arguments, [1]);
              try {
                insertSeedValues(key, results);
              } catch (err) {
                callback.apply(err);
                return;
              }
              // Put the err arg back
              results.unshift(undefined);
              callback.apply(null, results);
            });
          }
        } else {
          // No callback, attempt to do this synchronously
          let results = context.get(scope, key);
          if (seed) {
            if (Array.isArray(key)) {
              insertSeedValues(key, results);
            } else if (results === undefined) {
              try {
                results = util.getObjectProperty(seed, key);
              } catch (err) {
                if (err.code === "INVALID_EXPR") {
                  throw err;
                }
                results = undefined;
              }
            }
          }
          return results;
        }
      },
    },
    set: {
      configurable: true,
      value(key, value, storage, callback) {
        let context;
        if (!callback && typeof storage === "function") {
          callback = storage;
          storage = undefined;
        }
        if (callback && typeof callback !== "function") {
          throw new Error("Callback must be a function");
        }
        if (!validateContextKey(key)) {
          const err = Error("Invalid context key");
          if (callback) {
            return callback(err);
          }
          throw err;
        }
        if (!Array.isArray(key)) {
          const keyParts = util.parseContextStore(key);
          key = keyParts.key;
          if (!storage) {
            storage = keyParts.store || "_";
          }
          const result = followParentContext(parent, key);
          if (result) {
            const [ctx, new_key] = result;
            if (ctx && new_key) {
              return ctx.set(new_key, value, storage, callback);
            }

            if (callback) {
              return callback();
            }
            return undefined;
          }
        } else if (!storage) {
          storage = "_";
        }
        context = getContextStorage(storage);

        context.set(scope, key, value, callback);
      },
    },
    keys: {
      configurable: true,
      value(storage, callback) {
        let context;
        if (!storage && !callback) {
          context = stores._;
        } else {
          if (typeof storage === "function") {
            callback = storage;
            storage = "_";
          }
          if (callback && typeof callback !== "function") {
            throw new Error("Callback must be a function");
          }
          context = getContextStorage(storage);
        }
        if (seed && settings.exportGlobalContextKeys !== false) {
          if (callback) {
            context.keys(scope, (err, keys) => {
              callback(err, Array.from(new Set(seedKeys.concat(keys)).keys()));
            });
          } else {
            const keys = context.keys(scope);
            return Array.from(new Set(seedKeys.concat(keys)).keys());
          }
        } else {
          return context.keys(scope, callback);
        }
      },
    },
  });
  if (parent) {
    Object.defineProperty(obj, "$parent", {
      value: parent,
    });
  }
  return obj;
}

function createRootContext() {
  const obj = {};
  Object.defineProperties(obj, {
    get: {
      configurable: true,
      value(key, storage, callback) {
        if (!callback && typeof storage === "function") {
          callback = storage;
          storage = undefined;
        }
        if (callback) {
          callback();
          return;
        }
        return undefined;
      },
    },
    set: {
      configurable: true,
      value(key, value, storage, callback) {
        if (!callback && typeof storage === "function") {
          callback = storage;
          storage = undefined;
        }
        if (callback) {
          callback();
        }
      },
    },
    keys: {
      configurable: true,
      value(storage, callback) {
        if (!callback && typeof storage === "function") {
          callback = storage;
          storage = undefined;
        }
        if (callback) {
          callback();
          return;
        }
        return undefined;
      },
    },
  });
  return obj;
}

/**
 * Get a flow-level context object.
 * @param  {string} flowId       [description]
 * @param  {string} parentFlowId the id of the parent flow. undefined
 * @return {object}}             the context object
 */
function getFlowContext(flowId, parentFlowId) {
  if (contexts.hasOwnProperty(flowId)) {
    return contexts[flowId];
  }
  let parentContext = contexts[parentFlowId];
  if (!parentContext) {
    parentContext = createRootContext();
    contexts[parentFlowId] = parentContext;
    // throw new Error("Flow "+flowId+" is missing parent context "+parentFlowId);
  }
  const newContext = createContext(flowId, undefined, parentContext);
  contexts[flowId] = newContext;
  return newContext;
}

function getContext(nodeId, flowId) {
  let contextId = nodeId;
  if (flowId) {
    contextId = `${nodeId}:${flowId}`;
  }
  if (contexts.hasOwnProperty(contextId)) {
    return contexts[contextId];
  }
  const newContext = createContext(contextId);

  if (flowId) {
    let flowContext = contexts[flowId];
    if (!flowContext) {
      // This is most likely due to a unit test for a node which doesn't
      // initialise the flow properly.
      // To keep things working, initialise the missing context.
      // This *does not happen* in normal node-red operation
      flowContext = createContext(flowId, undefined, createRootContext());
      contexts[flowId] = flowContext;
    }
    Object.defineProperty(newContext, "flow", {
      value: flowContext,
    });
  }
  Object.defineProperty(newContext, "global", {
    value: contexts.global,
  });
  contexts[contextId] = newContext;
  return newContext;
}

function deleteContext(id, flowId) {
  if (!hasConfiguredStore) {
    // only delete context if there's no configured storage.
    let contextId = id;
    if (flowId) {
      contextId = `${id}:${flowId}`;
    }
    delete contexts[contextId];
    return stores._.delete(contextId);
  }
  return Promise.resolve();
}

function clean(flowConfig) {
  const promises = [];
  for (const plugin in stores) {
    if (stores.hasOwnProperty(plugin)) {
      promises.push(stores[plugin].clean(Object.keys(flowConfig.allNodes)));
    }
  }
  for (const id in contexts) {
    if (contexts.hasOwnProperty(id) && id !== "global") {
      const idParts = id.split(":");
      if (!flowConfig.allNodes.hasOwnProperty(idParts[0])) {
        delete contexts[id];
      }
    }
  }
  return Promise.all(promises);
}

function close() {
  const promises = [];
  for (const plugin in stores) {
    if (stores.hasOwnProperty(plugin)) {
      promises.push(stores[plugin].close());
    }
  }
  return Promise.all(promises);
}

function listStores() {
  return { default: defaultStore, stores: storeList };
}

module.exports = {
  init,
  load,
  listStores,
  get: getContext,
  getFlowContext,
  delete: deleteContext,
  clean,
  close,
};
