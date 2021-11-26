/* === This is a file from Node-Red being used as-is. === */
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
const assert = require("assert");
const { log } = require("@node-red/util"); // TODO: separate module
const { util } = require("@node-red/util");

// localSettings are those provided in the runtime settings.js file
let localSettings = null;
// globalSettings are provided by storage - .config.json on localfilesystem
let globalSettings = null;
// nodeSettings are those settings that a node module defines as being available
let nodeSettings = null;

// A subset of globalSettings that deal with per-user settings
let userSettings = null;

let disableNodeSettings = null;
let storage = null;

var persistentSettings = {
  init(settings) {
    localSettings = settings;
    for (var i in settings) {
      /* istanbul ignore else */
      if (
        settings.hasOwnProperty(i) &&
        i !== "load" &&
        i !== "get" &&
        i !== "set" &&
        i !== "available" &&
        i !== "reset"
      ) {
        // Don't allow any of the core functions get replaced via settings
        (function () {
          const j = i;
          persistentSettings.__defineGetter__(j, () => localSettings[j]);
          persistentSettings.__defineSetter__(j, () => {
            throw new Error(`Property '${j}' is read-only`);
          });
        })();
      }
    }
    globalSettings = null;
    nodeSettings = {};
    disableNodeSettings = {};
  },
  load(_storage) {
    storage = _storage;
    return storage.getSettings().then((_settings) => {
      globalSettings = _settings;
      if (globalSettings) {
        userSettings = globalSettings.users || {};
      } else {
        userSettings = {};
      }
    });
  },
  get(prop) {
    if (prop === "users") {
      throw new Error("Do not access user settings directly. Use settings.getUserSettings");
    }
    if (localSettings.hasOwnProperty(prop)) {
      return clone(localSettings[prop]);
    }
    if (globalSettings === null) {
      throw new Error(log._("settings.not-available"));
    }
    return clone(globalSettings[prop]);
  },

  set(prop, value) {
    if (prop === "users") {
      throw new Error("Do not access user settings directly. Use settings.setUserSettings");
    }
    if (localSettings.hasOwnProperty(prop)) {
      throw new Error(log._("settings.property-read-only", { prop }));
    }
    if (globalSettings === null) {
      throw new Error(log._("settings.not-available"));
    }
    const current = globalSettings[prop];
    globalSettings[prop] = clone(value);
    try {
      assert.deepEqual(current, value);
    } catch (err) {
      return storage.saveSettings(clone(globalSettings));
    }
    return Promise.resolve();
  },
  delete(prop) {
    if (localSettings.hasOwnProperty(prop)) {
      throw new Error(log._("settings.property-read-only", { prop }));
    }
    if (globalSettings === null) {
      throw new Error(log._("settings.not-available"));
    }
    if (globalSettings.hasOwnProperty(prop)) {
      delete globalSettings[prop];
      return storage.saveSettings(clone(globalSettings));
    }
    return Promise.resolve();
  },

  available() {
    return globalSettings !== null;
  },

  reset() {
    for (const i in localSettings) {
      /* istanbul ignore else */
      if (localSettings.hasOwnProperty(i)) {
        delete persistentSettings[i];
      }
    }
    localSettings = null;
    globalSettings = null;
    userSettings = null;
    storage = null;
  },
  registerNodeSettings(type, opts) {
    const normalisedType = util.normaliseNodeTypeName(type);
    for (const property in opts) {
      if (opts.hasOwnProperty(property)) {
        if (!property.startsWith(normalisedType)) {
          throw new Error(
            `Registered invalid property name '${property}'. Properties for this node must start with '${normalisedType}'`,
          );
        }
      }
    }
    nodeSettings[type] = opts;
  },
  exportNodeSettings(safeSettings) {
    for (const type in nodeSettings) {
      if (nodeSettings.hasOwnProperty(type) && !disableNodeSettings[type]) {
        const nodeTypeSettings = nodeSettings[type];
        for (const property in nodeTypeSettings) {
          if (nodeTypeSettings.hasOwnProperty(property)) {
            const setting = nodeTypeSettings[property];
            if (setting.exportable) {
              if (safeSettings.hasOwnProperty(property)) {
                // Cannot overwrite existing setting
              } else if (localSettings.hasOwnProperty(property)) {
                safeSettings[property] = localSettings[property];
              } else if (setting.hasOwnProperty("value")) {
                safeSettings[property] = setting.value;
              }
            }
          }
        }
      }
    }

    return safeSettings;
  },
  enableNodeSettings(types) {
    types.forEach((type) => {
      disableNodeSettings[type] = false;
    });
  },
  disableNodeSettings(types) {
    types.forEach((type) => {
      disableNodeSettings[type] = true;
    });
  },
  getUserSettings(username) {
    return clone(userSettings[username]);
  },
  setUserSettings(username, settings) {
    if (globalSettings === null) {
      throw new Error(log._("settings.not-available"));
    }
    const current = userSettings[username];
    userSettings[username] = settings;
    try {
      assert.deepEqual(current, settings);
      return Promise.resolve();
    } catch (err) {
      globalSettings.users = userSettings;
      return storage.saveSettings(clone(globalSettings));
    }
  },
};

module.exports = persistentSettings;
