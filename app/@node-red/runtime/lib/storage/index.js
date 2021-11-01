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

const Path = require("path");
const crypto = require("crypto");

const { log } = require("@node-red/util");

const { Logger } = require("@dojot/microservice-sdk");

const logger = new Logger("flowbroker-ui:runtime/storage");

let runtime;
let storageModule;
let settingsAvailable;
let sessionsAvailable;

const { Mutex } = require("async-mutex");

const settingsSaveMutex = new Mutex();

let libraryFlowsCachedResult = null;

function moduleSelector(aSettings) {
  let toReturn;
  if (aSettings.storageModule) {
    if (typeof aSettings.storageModule === "string") {
      // TODO: allow storage modules to be specified by absolute path
      toReturn = require(`./${aSettings.storageModule}`);
    } else {
      toReturn = aSettings.storageModule;
    }
  } else {
    toReturn = require("./localfilesystem");
  }
  return toReturn;
}

function is_malicious(path) {
  return path.indexOf("../") != -1 || path.indexOf("..\\") != -1;
}

var storageModuleInterface = {
  async init(_runtime) {
    runtime = _runtime;
    // Any errors thrown by the module will get passed up to the called
    // as a rejected promise
    storageModule = moduleSelector(runtime.settings);
    settingsAvailable =
      storageModule.hasOwnProperty("getSettings") && storageModule.hasOwnProperty("saveSettings");
    sessionsAvailable =
      storageModule.hasOwnProperty("getSessions") && storageModule.hasOwnProperty("saveSessions");
    if (storageModule.projects) {
      let projectsEnabled = false;
      if (
        runtime.settings.hasOwnProperty("editorTheme") &&
        runtime.settings.editorTheme.hasOwnProperty("projects")
      ) {
        projectsEnabled = runtime.settings.editorTheme.projects.enabled === true;
      }
      if (projectsEnabled) {
        storageModuleInterface.projects = storageModule.projects;
      }
    }
    if (storageModule.sshkeys) {
      storageModuleInterface.sshkeys = storageModule.sshkeys;
    }
    return storageModule.init(runtime.settings, runtime);
  },
  async getFlows(tenant) {
    logger.debug("Passing in StorageModuleInterface to get flows.", {
      rid: `tenant/${tenant}`,
    });
    return storageModule.getFlows(tenant).then((flows) =>
      storageModule.getCredentials().then((creds) => {
        const withTenant = flows.map((flow) => ({ ...flow, tenant }));
        const result = {
          flows: withTenant,
          credentials: creds,
        };
        result.rev = crypto.createHash("md5").update(JSON.stringify(result.flows)).digest("hex");
        return result;
      }),
    );
  },
  async saveFlows(config, user) {
    logger.debug(`Passing in StorageModuleInterface to save flows with token: ${user.token}`, {
      rid: `tenant/${user.tenant}`,
    });
    const { flows } = config;
    const { credentials } = config;
    let credentialSavePromise;
    if (config.credentialsDirty) {
      credentialSavePromise = storageModule.saveCredentials(credentials);
    } else {
      credentialSavePromise = Promise.resolve();
    }
    delete config.credentialsDirty;

    return credentialSavePromise.then(() =>
      storageModule
        .saveFlows(flows, user)
        .then(() => crypto.createHash("md5").update(JSON.stringify(config.flows)).digest("hex")),
    );
  },
  // getCredentials: function() {
  //     return storageModule.getCredentials();
  // },
  async saveCredentials(credentials) {
    return storageModule.saveCredentials(credentials);
  },
  async getSettings() {
    if (settingsAvailable) {
      return storageModule.getSettings();
    }
    return null;
  },
  async saveSettings(settings) {
    if (settingsAvailable) {
      return settingsSaveMutex.runExclusive(() => storageModule.saveSettings(settings));
    }
  },
  async getSessions() {
    if (sessionsAvailable) {
      return storageModule.getSessions();
    }
    return null;
  },
  async saveSessions(sessions) {
    if (sessionsAvailable) {
      return storageModule.saveSessions(sessions);
    }
  },

  /* Library Functions */

  async getLibraryEntry(type, path) {
    if (is_malicious(path)) {
      const err = new Error();
      err.code = "forbidden";
      throw err;
    }
    return storageModule.getLibraryEntry(type, path);
  },
  async saveLibraryEntry(type, path, meta, body) {
    if (is_malicious(path)) {
      const err = new Error();
      err.code = "forbidden";
      throw err;
    }
    return storageModule.saveLibraryEntry(type, path, meta, body);
  },

  /* Deprecated functions */
  async getAllFlows() {
    if (storageModule.hasOwnProperty("getAllFlows")) {
      return storageModule.getAllFlows();
    }
    if (libraryFlowsCachedResult) {
      return libraryFlowsCachedResult;
    }
    return listFlows("/").then((result) => {
      libraryFlowsCachedResult = result;
      return result;
    });
  },
  getFlow(fn) {
    if (is_malicious(fn)) {
      const err = new Error();
      err.code = "forbidden";
      throw err;
    }
    if (storageModule.hasOwnProperty("getFlow")) {
      return storageModule.getFlow(fn);
    }
    return storageModule.getLibraryEntry("flows", fn);
  },
  saveFlow(fn, data) {
    if (is_malicious(fn)) {
      const err = new Error();
      err.code = "forbidden";
      throw err;
    }
    libraryFlowsCachedResult = null;
    if (storageModule.hasOwnProperty("saveFlow")) {
      return storageModule.saveFlow(fn, data);
    }
    return storageModule.saveLibraryEntry("flows", fn, {}, data);
  },
  /* End deprecated functions */
};

function listFlows(path) {
  return storageModule.getLibraryEntry("flows", path).then((res) => {
    const promises = [];
    res.forEach((r) => {
      if (typeof r === "string") {
        promises.push(listFlows(Path.join(path, r)));
      } else {
        promises.push(Promise.resolve(r));
      }
    });
    return Promise.all(promises).then((res2) => {
      let i = 0;
      const result = {};
      res2.forEach((r) => {
        // TODO: name||fn
        if (r.fn) {
          let { name } = r;
          if (!name) {
            name = r.fn.replace(/\.json$/, "");
          }
          result.f = result.f || [];
          result.f.push(name);
        } else {
          result.d = result.d || {};
          result.d[res[i]] = r;
          // console.log(">",r.value);
        }
        i++;
      });
      return result;
    });
  });
}

module.exports = storageModuleInterface;
