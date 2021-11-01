const { Logger, ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

const MainStorage = require("../storage/MainStorage");

/**
 * This module bind the Node-Red's storage schema to Dojot
 * @class
 */
const storageModule = {
  init() {
    if (config.dojot == null || config.dojot.tenant == null) {
      throw new Error("Dojot storage module required parameters are not defined.");
    }
    this.logger = new Logger("flowbroker-ui:storageModule");
    this.logger.info("Storage Module initialized.");
  },
  /**
   * request flows from DojotHandler
   * @returns {Promise.<array>} a list of installed flows on Dojot
   *
   */
  getFlows: function async(tenant) {
    const dojotHandler = MainStorage.getByTenant(tenant, "dojotHandler");
    return (async () => {
      await dojotHandler.init();
      return dojotHandler.getFlows();
    })();
  },

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

module.exports = storageModule;
