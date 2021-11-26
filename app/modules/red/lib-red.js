const { Logger } = require("@dojot/microservice-sdk");

const redUtil = require("@node-red/util");

const importFresh = require("import-fresh");

const MainStorage = require("../../repository/MainStorage");

const RepoLibRed = require("../../repository/RepoLibRed");

const api = importFresh("../../@node-red/editor-api/lib");

const logger = new Logger("flowbroker-ui:lib-red");

const repo = new RepoLibRed();

/**
 * This module provides the full Node-RED application, with both the runtime and
 *  editor components built in.
 *
 * The API this module exposes allows it to be embedded within another Node.js application.
 *
 * @namespace node-red
 */
module.exports = {
  /**
   * Initialize the Node-RED application.
   * @param {server} httpServer - the HTTP server object to use
   * @param {Object} userSettings - an object containing the runtime settings
   * @param {string} _instanceId - Node-RED Application UUID
   * @param {string} _tenant - The tenant related to this Node-RED Application
   * @memberof node-red
   */
  init(httpServer, userSettings, _instanceId, _tenant) {
    logger.info(`Initializing Node-RED with ID: ${_instanceId}`);

    if (!userSettings) {
      userSettings = httpServer;
      httpServer = null;
    }

    repo.instanceId = _instanceId;
    repo.tenant = _tenant;

    // ImportFresh is necessary to create new memory addresses for Runtime object
    repo.runtime = importFresh("../../@node-red/runtime/lib");

    // Saving the runtime memory address for this tenant
    MainStorage.setByTenant(_tenant, "runtime", repo.runtime);

    // Initialize the utils
    redUtil.init(userSettings);

    // Initialize the runtime setting the environment variables
    repo.runtime.init(userSettings, httpServer, api, _instanceId, _tenant);

    // Initialize the editor-api
    api.init(userSettings, httpServer, repo.runtime.storage, repo.runtime);

    // Attach the runtime admin app to the api admin app
    api.httpAdmin.use(repo.runtime.httpAdmin);

    repo.apiEnabled = true;
    repo.server = httpServer;
    logger.info("RED Application initialized.", { rid: `tenant/${repo.tenant}` });
  },

  /**
   * Start the Node-RED application.
   * @return {Promise} - resolves when complete
   * @memberof node-red
   */
  start() {
    // The top level red.js has always used 'otherwise' on the promise returned
    // here. This is a non-standard promise function coming from our early use
    // of the when.js library.
    // We want to remove all dependency on when.js as native Promises now exist.
    // But we have the issue that some embedders of Node-RED may have copied our
    // top-level red.js a bit too much.
    //
    logger.info("Starting a new RED Application.", { rid: `tenant/${repo.tenant}` });

    const reun = MainStorage.getByTenant(repo.tenant, "runtime");
    // To help any troubleshooting issues
    logger.debug(
      `Checking the data segregation: theses values should be the same tenant: ${repo.tenant}, ${reun.tenant}, ${reun._.tenant}.`,
      { rid: `tenant/${repo.tenant}` },
    );

    const startPromise = MainStorage.getByTenant(repo.tenant, "runtime")
      .start()
      .then(() => {
        if (repo.apiEnabled) {
          return api.start();
        }
        return Promise.resolve();
      });
    startPromise._then = startPromise.then;
    startPromise.then = function (resolve, reject) {
      const inner = startPromise._then(resolve, reject);
      inner.otherwise = function (cb) {
        redUtil.log.error("**********************************************");
        redUtil.log.error("* Deprecated call to RED.start().otherwise() *");
        redUtil.log.error("* This will be removed in Node-RED 2.x       *");
        redUtil.log.error("* Use RED.start().catch() instead            *");
        redUtil.log.error("**********************************************");
        return inner.catch(cb);
      };
      return inner;
    };
    return startPromise;
  },
  /**
   * Stop the Node-RED application.
   *
   * Once called, Node-RED should not be restarted until the Node.JS process is
   * restarted.
   *
   * @return {Promise} - resolves when complete
   * @memberof node-red
   */
  stop() {
    return repo.runtime.stop().then(() => {
      if (repo.apiEnabled) {
        return api.stop();
      }
      return Promise.resolve();
    });
  },
  /**
   * The unique ID for this instance
   * @type string
   */
  instanceId: repo.instanceId,
  /**
   * The Tenant for this instance
   * @type string
   */
  get tenant() {
    return repo.tenant;
  },
  /**
   * Logging utilities
   * @see @node-red/util_log
   * @memberof node-red
   */
  log: redUtil.log,

  /**
   * General utilities
   * @see @node-red/util_util
   * @memberof node-red
   */
  util: redUtil.util,

  /**
   * This provides access to the internal nodes module of the
   * runtime. The details of this API remain undocumented as they should not
   * be used directly.
   *
   * Most administrative actions should be performed use the runtime api
   * under [node-red.runtime]{@link node-red.runtime}.
   *
   * @memberof node-red
   */
  get nodes() {
    return repo.runtime._.nodes;
  },

  /**
   * Runtime events emitter
   * @see @node-red/util_events
   * @memberof node-red
   */
  events: redUtil.events,

  /**
   * Runtime hooks engine
   * @see @node-red/runtime_hooks
   * @memberof node-red
   */
  hooks: repo.runtime.hooks,

  /**
   * This provides access to the internal settings module of the
   * runtime.
   *
   * @memberof node-red
   */
  get settings() {
    return repo.runtime._.settings;
  },

  /**
   * Get the version of the runtime
   * @return {String} - the runtime version
   * @function
   * @memberof node-red
   */
  get version() {
    return repo.runtime._.version;
  },

  /**
   * The express application for the Editor Admin API
   * @type ExpressApplication
   * @memberof node-red
   */
  get httpAdmin() {
    return api.httpAdmin;
  },

  /**
   * The express application for HTTP Nodes
   * @type ExpressApplication
   * @memberof node-red
   */
  get httpNode() {
    return repo.runtime.httpNode;
  },

  /**
   * The HTTP Server used by the runtime
   * @type HTTPServer
   * @memberof node-red
   */
  get server() {
    return repo.server;
  },

  /**
   * The runtime api getter
   * @see @node-red/runtime
   * @memberof node-red
   */
  get runtime() {
    return repo.runtime;
  },
  /**
   * The runtime api setter
   * @see @node-red/runtime
   * @memberof node-red
   */
  set runtime(rt) {
    repo.runtime = rt;
  },

  /**
   * The editor authentication api.
   * @see @node-red/editor-api_auth
   * @memberof node-red
   */
  auth: api.auth,
};
