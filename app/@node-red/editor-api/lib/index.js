/**
 * This module provides an Express application to serve the
 * Node-RED editor.
 *
 * It implements the Node-RED HTTP Admin API the Editor uses
 * to interact with the Node-RED runtime.
 *
 * @namespace @node-red/editor-api
 */

const { Logger } = require("@dojot/microservice-sdk");

const importFresh = require("import-fresh");

const logger = new Logger("flowbroker-ui:editor-api");

const express = require("express");

const bodyParser = require("body-parser");

const passport = require("passport");

const cors = require("cors");

const auth = require("./auth");

const apiUtil = require("./util");

const RepoEditorApi = require("../../../repository/RepoEditorApi");

const repo = new RepoEditorApi();

/**
 * Initialize the module.
 * @param  {Object}     settings   The runtime settings
 * @param  {HTTPServer} _server     An instance of HTTP Server
 * @param  {Storage}    storage    An instance of Node-RED Storage
 * @param  {Runtime}    runtimeAPI An instance of Node-RED Runtime
 * @memberof @node-red/editor-api
 */
function init(settings, _server, storage, runtimeAPI) {
  repo.server = _server;
  logger.info("Initializing the module editor-api.", { rid: `tenant/${runtimeAPI.tenant}` });
  repo.tenant = runtimeAPI.tenant;

  repo.adminApp = express();

  var corsHandler = cors({
    origin: "*",
    methods: "GET,PUT,POST,DELETE",
  });
  repo.adminApp.use(corsHandler);

  if (settings.httpAdminMiddleware) {
    if (
      typeof settings.httpAdminMiddleware === "function" ||
      Array.isArray(settings.httpAdminMiddleware)
    ) {
      repo.adminApp.use(settings.httpAdminMiddleware);
    }
  }

  const defaultServerSettings = {
    "x-powered-by": false,
  };
  const serverSettings = { ...defaultServerSettings, ...(settings.httpServerOptions || {}) };
  for (const eOption in serverSettings) {
    repo.adminApp.set(eOption, serverSettings[eOption]);
  }

  auth.init(settings, storage);

  const maxApiRequestSize = settings.apiMaxLength || "5mb";
  repo.adminApp.use(bodyParser.json({ limit: maxApiRequestSize }));
  repo.adminApp.use(bodyParser.urlencoded({ limit: maxApiRequestSize, extended: true }));

  repo.adminApp.get("/auth/login", auth.login, apiUtil.errorHandler);
  if (settings.adminAuth) {
    if (settings.adminAuth.type === "strategy") {
      auth.genericStrategy(repo.adminApp, settings.adminAuth.strategy);
    } else if (settings.adminAuth.type === "credentials") {
      repo.adminApp.use(passport.initialize());
      repo.adminApp.post(
        "/auth/token",
        auth.ensureClientSecret,
        auth.authenticateClient,
        auth.getToken,
        auth.errorHandler,
      );
    }
    repo.adminApp.post("/auth/revoke", auth.needsPermission(""), auth.revoke, apiUtil.errorHandler);
  }

  // Editor
  repo.editor = importFresh("./editor");
  const editorApp = repo.editor.init(repo.server, settings, runtimeAPI);
  repo.adminApp.use(editorApp);

  if (settings.httpAdminCors) {
    var corsHandler = cors(settings.httpAdminCors);
    repo.adminApp.use(corsHandler);
  }

  logger.info("Requesting initialization for Admin-API to be set in express service.", {
    rid: `tenant/${runtimeAPI.tenant}`,
  });

  const adminApiApp = importFresh("./admin").init(settings, runtimeAPI, editorApp);
  // ${repo.tenant}
  repo.adminApp.use("/", adminApiApp);
}

/**
 * Start the module.
 * @return {Promise} resolves when the application is ready to handle requests
 * @memberof @node-red/editor-api
 */
async function start() {
  logger.info("Starting Editor-API.", {
    rid: `tenant/${repo.tenant}`,
  });
  if (repo.editor) {
    return repo.editor.start();
  }
}

/**
 * Stop the module.
 * @return {Promise} resolves when the application is stopped
 * @memberof @node-red/editor-api
 */
async function stop() {
  if (repo.editor) {
    repo.editor.stop();
  }
}
module.exports = {
  init,
  start,
  stop,

  /**
   * @memberof @node-red/editor-api
   * @mixes @node-red/editor-api_auth
   */
  auth: {
    needsPermission: auth.needsPermission,
  },
  /**
   * The Express app used to serve the Node-RED Editor
   * @type ExpressApplication
   * @memberof @node-red/editor-api
   */
  get httpAdmin() {
    return repo.adminApp;
  },
};
