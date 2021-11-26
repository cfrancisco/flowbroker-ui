const express = require("express");

const path = require("path");

const fs = require("fs");

const os = require("os");

const { Logger } = require("@dojot/microservice-sdk");

const {
  log, i18n, events, exec, util, hooks
} = require("@node-red/util");

const importFresh = require("import-fresh");

const externalAPI = importFresh("./api");

const storage = importFresh("./storage");

const library = require("./library");
const plugins = require("./plugins");
const settings = require("./settings");

// Internal Variables
let runtimeMetricInterval = null;
let started = false;

const logger = new Logger("flowbroker-ui:runtime");

const stubbedExpressApp = {
  get() {},
  post() {},
  put() {},
  delete() {},
};

let adminApi = {
  auth: {
    needsPermission() {
      return function (req, res, next) {
        next();
      };
    },
  },
  adminApp: stubbedExpressApp,
  server: {},
};

let version;

function getVersion() {
  if (!version) {
    version = require(path.join(__dirname, "..", "package.json")).version;
    /* istanbul ignore else */
    try {
      fs.statSync(path.join(__dirname, "..", "..", "..", "..", ".git"));
      version += "-git";
    } catch (err) {
      // No git directory
    }
  }
  return version;
}

// To preserve de original code, we are using Object schema with importFresh
// that works as a new instance.

// This is the internal api
const runtime = {
  version: getVersion,
  log,
  i18n,
  events,
  settings,
  storage,
  hooks,
  nodes: null,
  plugins,
  instanceId: "",
  tenant: "",
  library,
  exec,
  util,
  nodeApp: null,
  adminApp: null,
  server: null,
  get adminApi() {
    return adminApi;
  },
  isStarted() {
    return started;
  },
};

/**
 * Initialize the runtime module.
 * @param {Object} settings - the runtime settings object
 * @param {HTTPServer} server - the http server instance for the server to use
 * @param {AdminAPI} adminApi - an instance of @node-red/editor-api. <B>TODO</B>: This needs to be
 *                              better abstracted.
 * @memberof @node-red/runtime
 */
function init(userSettings, httpServer, _adminApi, _instanceId, _tenant) {
  runtime.server = httpServer;
  runtime.instanceId = _instanceId;
  runtime.tenant = _tenant;

  runtime.nodes = importFresh("./nodes");

  runtime.nodes.tenant = _tenant;

  // @TODO maybe we should set the code below in Http Server constructor
  if (runtime.server && runtime.server.on) {
    // Add a listener to the upgrade event so that we can properly timeout connection
    // attempts that do not get handled by any nodes in the user's flow.
    // See #2956
    runtime.server.on("upgrade", (request, socket, head) => {
      // Add a no-op handler to the error event in case nothing upgrades this socket
      // before the remote end closes it. This ensures we don't get as uncaughtException
      socket.on("error", (err) => {});
      setTimeout(() => {
        // If this request has been handled elsewhere, the upgrade will have
        // been completed and bytes written back to the client.
        // If nothing has been written on the socket, nothing has handled the
        // upgrade, so we can consider this an unhandled upgrade.
        if (socket.bytesWritten === 0) {
          socket.destroy();
        }
      }, userSettings.inboundWebSocketTimeout || 5000);
    });
  }

  userSettings.version = getVersion();
  settings.init(userSettings);
  i18n.init(userSettings);

  runtime.nodeApp = express();
  runtime.adminApp = express();

  if (_adminApi) {
    adminApi = _adminApi;
  }

  logger.debug(`Initialized runtime with ID: ${runtime.instanceId}`, {
    rid: `tenant/${runtime.tenant}`,
  });

  runtime.nodes.init(runtime);
  externalAPI.init(runtime);
}

/**
 * Start the runtime.
 * @return {Promise} - resolves when the runtime is started. This does not mean the
 *   flows will be running as they are started asynchronously.
 * @memberof @node-red/runtime
 */
function start() {
  return i18n
    .registerMessageCatalog(
      "runtime",
      path.resolve(path.join(__dirname, "..", "locales")),
      "runtime.json",
    )
    .then(() => storage.init(runtime))
    .then(() => settings.load(storage))
    .then(() => library.init(runtime))
    .then(() => {
      if (log.metric()) {
        runtimeMetricInterval = setInterval(() => {
          reportMetrics();
        }, settings.runtimeMetricInterval || 15000);
      }
      log.info(`\n\n${log._("runtime.welcome")}\n===================\n`);
      if (settings.version) {
        log.info(
          log._("runtime.version", { component: "Node-RED", version: `v${settings.version}` }),
        );
      }
      log.info(log._("runtime.version", { component: "Node.js ", version: process.version }));
      if (settings.UNSUPPORTED_VERSION) {
        log.error("*****************************************************************");
        log.error(
          `* ${log._("runtime.unsupported_version", {
            component: "Node.js",
            version: process.version,
            requires: ">=8.9.0",
          })} *`,
        );
        log.error("*****************************************************************");
        events.emit("runtime-event", {
          id: "runtime-unsupported-version",
          payload: { type: "error", text: "notification.errors.unsupportedVersion" },
          retain: true,
        });
      }
      log.info(`${os.type()} ${os.release()} ${os.arch()} ${os.endianness()}`);

      return runtime.nodes.load().then(() => {
        let autoInstallModules = false;
        if (settings.hasOwnProperty("autoInstallModules")) {
          log.warn(
            log._("server.deprecatedOption", {
              old: "autoInstallModules",
              new: "externalModules.autoInstall",
            }),
          );
          autoInstallModules = true;
        }
        if (settings.externalModules) {
          // autoInstallModules = autoInstall enabled && (no palette setting || palette install not disabled)
          autoInstallModules = settings.externalModules.autoInstall
            && (!settings.externalModules.palette
              || settings.externalModules.palette.allowInstall !== false);
        }
        let i;
        const nodeErrors = runtime.nodes.getNodeList((n) => n.err != null);

        const nodeMissing = runtime.nodes.getNodeList(
          (n) => n.module && n.enabled && !n.loaded && !n.err,
        );

        if (nodeErrors.length > 0) {
          log.warn("-------------------------------------------------");
          for (i = 0; i < nodeErrors.length; i += 1) {
            if (nodeErrors[i].err.code === "type_already_registered") {
              log.warn(
                `[${nodeErrors[i].id}] ${log._("server.type-already-registered", {
                  type: nodeErrors[i].err.details.type,
                  module: nodeErrors[i].err.details.moduleA,
                })}`,
              );
            } else {
              log.warn(`[${nodeErrors[i].id}] ${nodeErrors[i].err}`);
            }
          }
          log.warn("------------------------------------------------------");
        }
        if (nodeMissing.length > 0) {
          log.warn(log._("server.missing-modules"));
          const missingModules = {};
          for (i = 0; i < nodeMissing.length; i++) {
            const missing = nodeMissing[i];
            missingModules[missing.module] = missingModules[missing.module] || {
              module: missing.module,
              version: missing.pending_version || missing.version,
              types: [],
            };
            missingModules[missing.module].types = missingModules[missing.module].types.concat(
              missing.types,
            );
          }
          const moduleList = [];
          const promises = [];
          const installingModules = [];

          for (i in missingModules) {
            if (missingModules.hasOwnProperty(i)) {
              log.warn(
                ` - ${i} (${missingModules[i].version}): ${missingModules[i].types.join(", ")}`,
              );
              if (autoInstallModules && i != "node-red") {
                installingModules.push({ id: i, version: missingModules[i].version });
              }
            }
          }
          if (!autoInstallModules) {
            log.info(log._("server.removing-modules"));
            runtime.nodes.cleanModuleList();
          } else if (installingModules.length > 0) {
            reinstallAttempts = 0;
            reinstallModules(installingModules);
          }
        }
        if (settings.settingsFile) {
          log.info(log._("runtime.paths.settings", { path: settings.settingsFile }));
        }
        if (settings.httpRoot !== undefined) {
          log.warn(
            log._("server.deprecatedOption", {
              old: "httpRoot",
              new: "httpNodeRoot/httpAdminRoot",
            }),
          );
        }
        if (settings.readOnly) {
          log.info(log._("settings.readonly-mode"));
        }
        if (settings.httpStatic) {
          log.info(log._("runtime.paths.httpStatic", { path: path.resolve(settings.httpStatic) }));
        }

        return runtime.nodes.loadContextsPlugin().then(() => {
          logger.debug("Runtime requesting flows.", {
            rid: `tenant/${runtime.tenant}`,
          });

          runtime.nodes
            .loadFlows(null)
            .then(runtime.nodes.startFlows)
            .catch((err) => {
              logger.error(err.message, {
                rid: `tenant/${runtime.tenant}`,
              });
            });
          started = true;
        });
      });
    });
}

var reinstallAttempts = 0;
let reinstallTimeout;
function reinstallModules(moduleList) {
  const promises = [];
  const reinstallList = [];
  let installRetry = 30000;
  if (settings.hasOwnProperty("autoInstallModulesRetry")) {
    log.warn(
      log._("server.deprecatedOption", {
        old: "autoInstallModulesRetry",
        new: "externalModules.autoInstallRetry",
      }),
    );
    installRetry = settings.autoInstallModulesRetry;
  }
  if (settings.externalModules && settings.externalModules.hasOwnProperty("autoInstallRetry")) {
    installRetry = settings.externalModules.autoInstallRetry * 1000;
  }
  for (let i = 0; i < moduleList.length; i++) {
    if (moduleList[i].id != "node-red") {
      (function (mod) {
        promises.push(
          nodes
            .installModule(mod.id, mod.version)
            .then((m) => {
              events.emit("runtime-event", { id: "node/added", retain: false, payload: m.nodes });
            })
            .catch((err) => {
              reinstallList.push(mod);
            }),
        );
      }(moduleList[i]));
    }
  }
  Promise.all(promises).then((results) => {
    if (reinstallList.length > 0) {
      reinstallAttempts++;
      // First 5 at 1x timeout, next 5 at 2x, next 5 at 4x, then 8x
      const timeout = installRetry * Math.pow(2, Math.min(Math.floor(reinstallAttempts / 5), 3));
      reinstallTimeout = setTimeout(() => {
        reinstallModules(reinstallList);
      }, timeout);
    }
  });
}

function reportMetrics() {
  const memUsage = process.memoryUsage();

  log.log({
    level: log.METRIC,
    event: "runtime.memory.rss",
    value: memUsage.rss,
  });
  log.log({
    level: log.METRIC,
    event: "runtime.memory.heapTotal",
    value: memUsage.heapTotal,
  });
  log.log({
    level: log.METRIC,
    event: "runtime.memory.heapUsed",
    value: memUsage.heapUsed,
  });
}

/**
 * Stops the runtime.
 *
 * Once called, Node-RED should not be restarted until the Node.JS process is
 * restarted.
 *
 * @return {Promise} - resolves when the runtime is stopped.
 * @memberof @node-red/runtime
 */
function stop() {
  if (runtimeMetricInterval) {
    clearInterval(runtimeMetricInterval);
    runtimeMetricInterval = null;
  }
  if (reinstallTimeout) {
    clearTimeout(reinstallTimeout);
  }
  started = false;
  return runtime.nodes.stopFlows().then(() => runtime.nodes.closeContextsPlugin());
}

/**
 * This module provides the core runtime component of Node-RED.
 * It does *not* include the Node-RED editor. All interaction with
 * this module is done using the api provided.
 *
 * @namespace @node-red/runtime
 */
module.exports = {
  init,
  start,
  stop,
  get instanceId() {
    return runtime.instanceId;
  },
  set instanceId(str) {
    runtime.instanceId = str;
  },
  get tenant() {
    return runtime.tenant;
  },
  set tenant(str) {
    runtime.tenant = str;
  },
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_comms
   */
  comms: externalAPI.comms,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_flows
   */
  flows: externalAPI.flows,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_library
   */
  library: externalAPI.library,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_nodes
   */
  nodes: externalAPI.nodes,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_settings
   */
  settings: externalAPI.settings,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_projects
   */
  projects: externalAPI.projects,
  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_context
   */
  context: externalAPI.context,

  /**
   * @memberof @node-red/runtime
   * @mixes @node-red/runtime_plugins
   */
  plugins: externalAPI.plugins,

  /**
   * Returns whether the runtime is started
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @return {Promise<Boolean>} - whether the runtime is started
   * @function
   * @memberof @node-red/runtime
   */
  isStarted: externalAPI.isStarted,

  /**
   * Returns version number of the runtime
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @return {Promise<String>} - the runtime version number
   * @function
   * @memberof @node-red/runtime
   */
  version: externalAPI.version,

  storage,
  events,
  hooks,
  util: require("@node-red/util").util,
  get httpNode() {
    return runtime.nodeApp;
  },
  get httpAdmin() {
    return runtime.adminApp;
  },
  get server() {
    return runtime.server;
  },

  _: runtime,
};
