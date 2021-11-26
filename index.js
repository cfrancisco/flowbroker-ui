const { unflatten } = require("flat");

const { Logger, ConfigManager, ServiceStateManager } = require("@dojot/microservice-sdk");

const express = require("express");

const path = require("path");

const { v4: uuidv4 } = require("uuid");

const { RedFactory } = require("./app/modules/red/RedFactory");

const userConfigFile = process.env.FLOWUI_USER_CONFIG_FILE || "production.conf";

ConfigManager.loadSettings("FLOWBROKER-UI", userConfigFile);

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

/**
 * Configuring Loggers */
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

const logger = new Logger("flowbroker-ui:index");

/**
 * Configuring State Manager */
const stateManager = new ServiceStateManager({
  lightship: {
    port: config.server.healthcheck.port,
    shutdownDelay: config.server.shutdown.delay,
    gracefulShutdownTimeout: config.server.shutdown.gracefultimeoutms,
    shutdownHandlerTimeout: config.server.shutdown.handlertimeoutms,
  },
});

const TenantService = require("./app/services/tenants.service");

const MainStorage = require("./app/repository/MainStorage");

const { HTTPServer } = require("./app/server/HTTPServer");

/**
 * Instantiate the Main HTTP Server with  Websocket Server */
const server = new HTTPServer(config.flowui, stateManager);

MainStorage.webSocketServer = server;

/*
   Load node-RED configuration and overriding some configurations using the
   dojot configuration file schema. It is necessary to internal Node-RED classes
    uses these data.
  */
const settings = require("./config/red-settings");

settings.settingsFile = "./config/red-settings.js";
settings.coreNodesDir = path.dirname(require.resolve("./app/@node-red/nodes"));

/*
  Factory used to create new RED instances */
const redFactory = new RedFactory(stateManager, logger);

(async () => {
  let tenantList = [];
  tenantList = await TenantService.getTenants();
  logger.info(`Tenants retrieved: ${tenantList}`);

  /* For each tenant received we create a new RED instance,
    adding it to our storage.
  */
  tenantList.forEach((tenant) => {
    // Create a HTTP Server to handle the Tenant request
    const tenantServer = express();

    // Notifying Storage to create a new object for this tenant
    MainStorage.newTenant(tenant);

    // Initialize the DojotHandler for this tenant
    MainStorage.getByTenant(tenant, "dojotHandler").init();

    // Creating a new Node-RED application
    const redInstance = redFactory.create(tenant);
    MainStorage.setInstance(tenant, redInstance);

    // Setting the tenant properties and initializes the Node-RED
    redInstance.init(tenantServer, settings, uuidv4(), tenant);

    // Setting routes to Express
    server.use(`${settings.httpAdminRoot}`, tenantServer);
    tenantServer.use("/", redInstance.httpAdmin);

    // Starting Node-RED
    redInstance.start().then(() => {
      //  Node-RED instance successfully loaded
      stateManager.signalReady(`RED-instance-${redInstance.tenant}`);
    });
    logger.info(`Instantiating RED Application for Tenant ${tenant}`);
  });
  MainStorage.getTenants();
  // Starting the main HTTP Server
  server.init();
})();

/*
      Methods to close the main process
*/
let stopping = false;
function exitWhenStopped() {
  if (!stopping) {
    stopping = true;
    MainStorage.getTenants().forEach((tenant) => {
      const inst = MainStorage.getByTenant(tenant, "redInstance");
      stateManager.signalNotReady(`RED-instance-${inst.tenant}`);
      inst.stop().then(() => {
        process.exit();
      });
    });
    server.close();
  }
}

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

process.on("SIGINT", exitWhenStopped);

process.on("SIGTERM", exitWhenStopped);

process.on("SIGHUP", exitWhenStopped);

process.on("SIGUSR2", exitWhenStopped); // for nodemon restart
