const importFresh = require("import-fresh");

/**
 * A Factory to build a new instance of Node-RED Application.
 * @class
 */
class RedFactory {
  constructor(stateManager, logger) {
    this.stateManager = stateManager;
    this.logger = logger;
  }

  /**
   * Create a new Node-RED Application with new memory addresses
   * @param {string} tenantName a Dojot's Tenant
   */
  create(tenantName) {
    let redInstance = null;
    try {
      redInstance = importFresh("./lib-red");
      this.stateManager.registerService(`RED-instance-${tenantName}`);
    } catch (err) {
      this.logger.error("Failed to create a new Node-RED Application.", {
        rid: `tenant/${tenantName}`,
      });
      this.logger.error(err.stack || err);
      process.exit(1);
    }
    return redInstance;
  }
}

module.exports = { RedFactory };
