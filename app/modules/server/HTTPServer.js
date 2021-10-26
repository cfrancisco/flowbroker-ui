const { createHttpTerminator } = require("http-terminator");

const { Logger, WebUtils } = require("@dojot/microservice-sdk");

const express = require("express");

const logger = new Logger("flowbroker-ui:http-server");

/**
 * Wrapper to instantiate and configure a http server
 */
class HTTPServer {
  /**
   * @constructor
   * @param {*} config configuration data
   * @param {*} serviceStateManager instance of the @dojot/microservice-sdk.ServiceStateManager
   */
  constructor(config, serviceStateManager, alias = "server") {
    // Server configuration
    this.config = config;
    this.alias = alias;

    // Creating express wrapper
    this.server = WebUtils.createServer({ config: this.config, logger });

    const { requestLogInterceptor } = WebUtils.framework.interceptors;

    // Creating routes
    /*
    this.framework = WebUtils.framework.createExpress({
      interceptors: [
        requestLogInterceptor({
          logger,
        }),
      ],
 */

    // WebUtils.framework.defaultErrorHandler
    this.framework = express();

    logger.debug("Express Framework registered as listener for requests to the web server.");

    // service state manager
    this.serviceStateManager = serviceStateManager;
    this.serviceStateManager.registerService(alias);

    this.server.on("request", this.framework);

    // Emitted when the server has been bound after calling server.listen().
    this.server.on("listening", () => {
      logger.info("Server ready to accept connections!");
      logger.info(this.server.address());
      serviceStateManager.signalReady(alias);
    });

    // Emitted when the server closes. If connections exist,
    // this event is not emitted until all connections are ended.
    this.server.on("close", () => {
      serviceStateManager.signalNotReady(alias);
      logger.warn("The Server was closed.");
    });

    // Emitted when an error occurs. Unlike net.Socket, the 'close' event will not
    // be emitted directly following this event unless server.close() is manually called.
    this.server.on("error", (err) => {
      logger.error("Server experienced an error:", err);
      if (err.code === "EADDRINUSE") {
        throw err;
      }
    });

    // create an instance of http-terminator and instead of
    // using server.close(), use httpTerminator.terminate()
    // during the shutdown.
    const httpTerminator = createHttpTerminator({ server: this.server });

    // register handlers to gracefully shutdown the components...
    this.serviceStateManager.registerShutdownHandler(async () => {
      logger.debug("Stopping the server from accepting new connections...");
      await httpTerminator.terminate();
      logger.debug("The server no longer accepts connections!");
      return Promise.resolve(true);
    });
  }

  /**
   * Adding a new route in express framework
   *
   * @param {string} mountPoint be used as a route prefix
   */
  use(mountPoint, mountRouter) {
    logger.debug(`Adding route to ${mountPoint}.`);
    this.framework.use(mountPoint, mountRouter);
  }

  /**
   * The Express instance used
   * @type Express server
   */
  get express() {
    return this.framework;
  }

  /**
   * Initializes the server to accept requests.
   */
  init() {
    logger.debug(`Starting Server ${this.alias} at ${this.config.host}:${this.config.port}`);
    this.server.listen(this.config.port, this.config.host);
    this.serviceStateManager.signalReady(this.alias);
  }
}

module.exports = { HTTPServer };
