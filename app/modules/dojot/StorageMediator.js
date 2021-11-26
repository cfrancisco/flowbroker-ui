const { Logger, ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

const MainStorage = require("../../repository/MainStorage");

/**
 * This module bind the Flow storage for each tenant in a unified interface,
 * acting as a Mediator (design pattern).
 *
 * The mediator interacts with multiple objects, based on the params passed,
 * and provides a unified abstraction at a higher level.
 *
 * @class
 */
const storageMediator = {
  init() {
    if (config.dojot === null || config.dojot.flow === null) {
      throw new Error("Required parameters to initialize the Storage Mediator are not defined.");
    }
    this.logger = new Logger("flowbroker-ui:storageMediator");
    this.logger.info("Dojot Storage Mediator initialized.");
  },
  /**
   *  Getting flows from the DojotHandler of the given tenant
   * @returns {Promise<array>} a list of installed flows in Dojot
   *
   */
  getFlows: function async(tenant) {
    const dojotHandler = MainStorage.getByTenant(tenant, "dojotHandler");
    return dojotHandler.getFlows();
  },

  /**
   * Saves flows using the DojotHandler of the tenant
   * @returns {Promise<array>} a list of saved flows in Dojot
   *
   */
  saveFlows(flows, user) {
    const dojotHandler = MainStorage.getByTenant(user.tenant, "dojotHandler");
    return dojotHandler.saveFlows(flows, user);
  },

  getCredentials() {
    return new Promise((resolve) => {
      resolve({});
    });
  },

  saveCredentials() {
    return Promise.resolve();
  },

  getSettings() {
    return [];
  },
  saveSettings() {
    return [];
  },
  getSessions() {
    return [];
  },
  saveSessions() {
    return [];
  },

  getLibraryEntry() {
    return [];
  },

  saveLibraryEntry() {
    return [];
  },
};

module.exports = storageMediator;
