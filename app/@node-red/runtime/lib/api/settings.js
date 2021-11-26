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

/**
 * @mixin @node-red/runtime_settings
 */

const util = require("util");

let runtime;

function extend(target, source) {
  const keys = Object.keys(source);
  let i = keys.length;
  while (i--) {
    const value = source[keys[i]];
    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean" || Array.isArray(value)) {
      target[keys[i]] = value;
    } else if (value === null) {
      if (target.hasOwnProperty(keys[i])) {
        delete target[keys[i]];
      }
    } else {
      // Object
      if (target.hasOwnProperty(keys[i])) {
        // Target property exists. Need to handle the case
        // where the existing property is a string/number/boolean
        // and is being replaced wholesale.
        const targetType = typeof target[keys[i]];
        if (targetType === "string" || targetType === "number" || targetType === "boolean") {
          target[keys[i]] = value;
        } else {
          target[keys[i]] = extend(target[keys[i]], value);
        }
      } else {
        target[keys[i]] = value;
      }
    }
  }
  return target;
}

function getSSHKeyUsername(userObj) {
  let username = "__default";
  if (userObj && userObj.username) {
    username = userObj.username;
  }
  return username;
}
const api = (module.exports = {
  init(_runtime) {
    runtime = _runtime;
  },
  /**
   * Gets the runtime settings object
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Object>} - the runtime settings
   * @memberof @node-red/runtime_settings
   */
  async getRuntimeSettings(opts) {
    const safeSettings = {
      httpNodeRoot: runtime.settings.httpNodeRoot || "/",
      version: runtime.settings.version,
    };
    if (opts.user) {
      safeSettings.user = {};
      const props = ["anonymous", "username", "image", "permissions"];
      props.forEach((prop) => {
        if (opts.user.hasOwnProperty(prop)) {
          safeSettings.user[prop] = opts.user[prop];
        }
      });
    }

    if (!runtime.settings.disableEditor) {
      safeSettings.context = runtime.nodes.listContextStores();
      if (runtime.settings.editorTheme && runtime.settings.editorTheme.codeEditor) {
        safeSettings.codeEditor = runtime.settings.editorTheme.codeEditor || {};
        safeSettings.codeEditor.lib = safeSettings.codeEditor.lib || "ace";
        safeSettings.codeEditor.options = safeSettings.codeEditor.options || {};
      }
      safeSettings.libraries = runtime.library.getLibraries();
      if (util.isArray(runtime.settings.paletteCategories)) {
        safeSettings.paletteCategories = runtime.settings.paletteCategories;
      }

      if (runtime.settings.flowFilePretty) {
        safeSettings.flowFilePretty = runtime.settings.flowFilePretty;
      }

      if (runtime.settings.editorTheme && runtime.settings.editorTheme.palette) {
        if (
          runtime.settings.editorTheme.palette.upload === false ||
          runtime.settings.editorTheme.palette.editable === false
        ) {
          safeSettings.externalModules = { palette: {} };
        }
        if (runtime.settings.editorTheme.palette.upload === false) {
          safeSettings.externalModules.palette.allowUpload = false;
        }
        if (runtime.settings.editorTheme.palette.editable === false) {
          safeSettings.externalModules.palette.allowInstall = false;
          safeSettings.externalModules.palette.allowUpload = false;
        }
      }

      if (runtime.settings.externalModules) {
        safeSettings.externalModules = extend(
          safeSettings.externalModules || {},
          runtime.settings.externalModules,
        );
      }

      if (!runtime.nodes.installerEnabled()) {
        safeSettings.externalModules = safeSettings.externalModules || {};
        safeSettings.externalModules.palette = safeSettings.externalModules.palette || {};
        safeSettings.externalModules.palette.allowInstall = false;
        safeSettings.externalModules.palette.allowUpload = false;
      }
      if (runtime.storage.projects) {
        const activeProject = runtime.storage.projects.getActiveProject();
        if (activeProject) {
          safeSettings.project = activeProject;
        } else if (runtime.storage.projects.flowFileExists()) {
          safeSettings.files = {
            flow: runtime.storage.projects.getFlowFilename(),
            credentials: runtime.storage.projects.getCredentialsFilename(),
          };
        }
        safeSettings.git = {
          globalUser: runtime.storage.projects.getGlobalGitUser(),
        };
      }

      safeSettings.flowEncryptionType = runtime.nodes.getCredentialKeyType();
      runtime.settings.exportNodeSettings(safeSettings);
      runtime.plugins.exportPluginSettings(safeSettings);
    }

    return safeSettings;
  },

  /**
   * Gets an individual user's settings object
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Object>} - the user settings
   * @memberof @node-red/runtime_settings
   */
  async getUserSettings(opts) {
    let username;
    if (!opts.user || opts.user.anonymous) {
      username = "_";
    } else {
      username = opts.user.username;
    }
    return runtime.settings.getUserSettings(username) || {};
  },

  /**
   * Updates an individual user's settings object.
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.settings - the updates to the user settings
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Object>} - the user settings
   * @memberof @node-red/runtime_settings
   */
  async updateUserSettings(opts) {
    let username;
    if (!opts.user || opts.user.anonymous) {
      username = "_";
    } else {
      username = opts.user.username;
    }
    let currentSettings = runtime.settings.getUserSettings(username) || {};
    currentSettings = extend(currentSettings, opts.settings);
    try {
      return runtime.settings
        .setUserSettings(username, currentSettings)
        .then(() => {
          runtime.log.audit({ event: "settings.update", username }, opts.req);
        })
        .catch((err) => {
          runtime.log.audit(
            {
              event: "settings.update",
              username,
              error: err.code || "unexpected_error",
              message: err.toString(),
            },
            opts.req,
          );
          err.status = 400;
          throw err;
        });
    } catch (err) {
      runtime.log.warn(
        runtime.log._("settings.user-not-available", {
          message: runtime.log._("settings.not-available"),
        }),
      );
      runtime.log.audit(
        {
          event: "settings.update",
          username,
          error: err.code || "unexpected_error",
          message: err.toString(),
        },
        opts.req,
      );
      err.status = 400;
      throw err;
    }
  },

  /**
   * Gets a list of a user's ssh keys
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Object>} - the user's ssh keys
   * @memberof @node-red/runtime_settings
   */
  async getUserKeys(opts) {
    const username = getSSHKeyUsername(opts.user);
    return runtime.storage.projects.ssh.listSSHKeys(username).catch((err) => {
      err.status = 400;
      throw err;
      return reject(err);
    });
  },

  /**
   * Gets a user's ssh public key
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {User} opts.id - the id of the key to return
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<String>} - the user's ssh public key
   * @memberof @node-red/runtime_settings
   */
  async getUserKey(opts) {
    const username = getSSHKeyUsername(opts.user);
    // console.log('username:', username);
    return runtime.storage.projects.ssh
      .getSSHKey(username, opts.id)
      .then((data) => {
        if (data) {
          return data;
        }
        const err = new Error("Key not found");
        err.code = "not_found";
        err.status = 404;
        throw err;
      })
      .catch((err) => {
        if (!err.status) {
          err.status = 400;
        }
        throw err;
      });
  },

  /**
   * Generates a new ssh key pair
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {User} opts.name - the id of the key to return
   * @param {User} opts.password - (optional) the password for the key pair
   * @param {User} opts.comment - (option) a comment to associate with the key pair
   * @param {User} opts.size - (optional) the size of the key. Default: 2048
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<String>} - the id of the generated key
   * @memberof @node-red/runtime_settings
   */
  async generateUserKey(opts) {
    const username = getSSHKeyUsername(opts.user);
    return runtime.storage.projects.ssh.generateSSHKey(username, opts).catch((err) => {
      err.status = 400;
      throw err;
    });
  },

  /**
   * Deletes a user's ssh key pair
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {User} opts.id - the id of the key to delete
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise} - resolves when deleted
   * @memberof @node-red/runtime_settings
   */
  async removeUserKey(opts) {
    const username = getSSHKeyUsername(opts.user);
    return runtime.storage.projects.ssh.deleteSSHKey(username, opts.id).catch((err) => {
      err.status = 400;
      throw err;
    });
  },
});
