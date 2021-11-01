const { unflatten } = require("flat");

const { Logger, ConfigManager, ServiceStateManager } = require("@dojot/microservice-sdk");
const express = require("express");
const path = require("path");
const { HTTPServer } = require("./app/server/HTTPServer");

const { RedFactory } = require("./app/RedFactory");

const userConfigFile = process.env.FLOWUI_USER_CONFIG_FILE || "production.conf";

// const http = require("http");

const MainStorage = require("./app/modules/storage/MainStorage");

ConfigManager.loadSettings("FLOWBROKER-UI", userConfigFile);

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

/* Configuring Loggers */
Logger.setTransport("console", {
  level: config.logger.console.level.toLowerCase(),
});
if (config.logger.file.enable) {
  Logger.setTransport("file", {
    level: config.logger.file.level.toLowerCase(),
    filename: config.logger.file.name,
    dirname: config.logger.file.dir,
    maxFiles: config.logger.file.max,
    maxSize: config.logger.file.size,
  });
}
Logger.setVerbose(config.logger.verbose);

/*
Using Dependency Inversion
*/
// const DIContainer = require("./src/DIContainer");

// const container = DIContainer(config);

const logger = new Logger("flowbroker-ui:index");

const stateManager = new ServiceStateManager({
  lightship: {
    port: config.server.healthcheck.port,
    shutdownDelay: config.server.shutdown.delay,
    gracefulShutdownTimeout: config.server.shutdown.gracefultimeoutms,
    shutdownHandlerTimeout: config.server.shutdown.handlertimeoutms,
  },
});

/*
   Instantiate Main HTTP Server */
const server = new HTTPServer(config.flowui, stateManager);

MainStorage.webSocketServer = server;

/*
// instantiate Websocket Server
stateManager.registerService("wsSocket");
stateManager.signalReady("wsSocket");
let httpServer = http.createServer((request, response) => {
  logger.debug(`${new Date()} Received request for ${request.url}`);
  response.writeHead(404);
  response.end();
});
httpServer.listen(7000, () => {
  logger.info(`${new Date()} Server is listening on port 7000`);
});
MainStorage.webSocketServer = httpServer;
*/

/*
   Load node-RED configuration e override settings
   config using the dojot configuration
   file schema.
  */
const settings = require("./config/red-settings");

settings.uiPort = config.flowui.port;
settings.uiHost = config.flowui.host;
settings.serverPort = config.flowui.port;
settings.settingsFile = "./config/red-settings.js";
settings.coreNodesDir = path.dirname(require.resolve("./app/@node-red/nodes"));

/*
  Factory used to create new RED instances */
const redFactory = new RedFactory(stateManager, logger);

/*
TODO
Request  DATA
*/
const tenantList = ["admin", "francisco"];

// Setting /nodered endpoint to Editor Admin API
// The path for  Editor Admin API will be the related tenant
const redInstances = [];

/* For each tenant received we create a new RED instance,
adding its storage.
*/
tenantList.forEach((tenant) => {
  // Todo
  // Create a HTTP Server from httpServer.js
  const tenantServer = express();

  MainStorage.newTenant(tenant);

  // Creating an application for each tenant
  const redInstance = redFactory.create(tenant);
  MainStorage.setInstance(tenant, redInstance);

  // initializes the Node-RED
  logger.info(`Initializing Node-RED with ID: ${redInstance.instanceId}`);
  redInstance.init(tenantServer, settings, redInstance.instanceId, redInstance.tenant);

  // Setting routes to Express
  server.use(`/${tenant}${settings.httpAdminRoot}`, tenantServer);
  tenantServer.use("/", redInstance.httpAdmin);

  // Starting Node-RED
  redInstance.start().then(() => {
    //  Node-RED instance successfully loaded
    stateManager.signalReady(`RED-instance-${redInstance.tenant}`);
  });
  logger.info(`Instantiating RED Application for Tenant ${tenant}`);
});

// Starting the main HTTP Server
server.init();

/*
      Methods to close the main process
*/
process.on("unhandledRejection", async (reason) => {
  // The 'unhandledRejection' event is emitted whenever a Promise is rejected and
  // no error handler is attached to the promise within a turn of the event loop.
  logger.error(`Unhandled Rejection at: ${reason.stack || reason}.`);
  exitWhenStopped();
  process.kill(process.pid, "SIGTERM");
});

process.on("uncaughtException", async (ex) => {
  // The 'uncaughtException' event is emitted when an uncaught JavaScript
  // exception bubbles all the way back to the event loop.
  logger.error(`uncaughtException: Unhandled Exception at: ${ex.stack || ex}. Bailing out!!`);
  exitWhenStopped();
  process.kill(process.pid, "SIGTERM");
});

let stopping = false;
function exitWhenStopped() {
  if (!stopping) {
    stateManager.signalNotReady("wsSocket");
    stopping = true;
    tenantList.forEach((tenant) => {
      console.log("tenant", tenant);
      const inst = MainStorage.getByTenant(tenant, "redInstance");
      console.log("inst.tenant", inst.tenant);
      stateManager.signalNotReady(`RED-instance-${inst.tenant}`);
      inst.stop().then(() => {
        process.exit();
      });
    });
    server.close();
  }
}

process.on("SIGINT", exitWhenStopped);
process.on("SIGTERM", exitWhenStopped);
process.on("SIGHUP", exitWhenStopped);
process.on("SIGUSR2", exitWhenStopped); // for nodemon restart
