const { Logger, ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const logger = new Logger("flowbroker-ui:main-storage");

const DojotHandler = require("../modules/dojot/DojotHandler");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

const _tenants = {};

const _wsConns = {};

/**
 * The Main Storage used to dynamically handle the multiple instances of node-RED
 * application (one for each tenant), with uniques runtime, express server,
 * settings, and dojot handlers.

  @singleton
  A class with only a single instance with global access points.
 */
class MainStorage {
  /**
   * The methods belows are used when WebSocket emmited the connection
   * request for a goiven tenant.
   *
   * @param {string} tenantpath Unique ID for the tenant channel
   */
  static isTenantConnected(tenantpath) {
    return _wsConns[tenantpath];
  }

  static setConnected(tenantpath) {
    logger.debug(`Websocket emits connection to client: ${tenantpath}`);
    _wsConns[tenantpath] = true;
  }

  static closeConnection(tenantpath) {
    logger.debug("Connection with client was closed.");
    _wsConns[tenantpath] = false;
  }

  get webSocketServer() {
    return this._webSocketServer;
  }

  set webSocketServer(_ws) {
    logger.debug("The webSocketServer was added.");
    this._webSocketServer = _ws;
  }

  /**
   * Storing the node-Red Instance for a given tenant
   *
   *  @param {String} tenantName alias for the referral tenant
   *  @param {node-Red} instance instance of a Node-RED application
   */
  static setInstance(tenantName, instance) {
    _tenants[tenantName].redInstance = instance;
  }

  /**
   * Get a list of Tenants
   *
   * @returns {Array<String>} List of all Tenants already instantiated.
   */
  static getTenants() {
    return Object.keys(_tenants);
  }

  static newTenant(tenantName) {
    // @TODO this could be a class

    // Dojot Handler is responsible for handling Dojot requests.
    const newTenant = {
      storage: "",
      runtime: "",
      httpServer: "",
      setting: "",
      redInstance: "",
      dojotHandler: new DojotHandler(config.dojot, tenantName),
    };
    _tenants[tenantName] = newTenant;
  }

  /**
   * Generic method to get a property from the given tenant.
   *
   * @returns {Object} Reffered object for this tenant
   */
  static getByTenant(tenantName, prop) {
    logger.debug(`Getting ${prop} for tenant:${tenantName}`);
    if (_tenants) {
      return _tenants[tenantName][prop];
    }
    return null;
  }

  static setByTenant(tenantName, prop, value) {
    logger.debug(`Setting for ${tenantName} prop ${prop} value ${value}`);
    _tenants[tenantName][prop] = value;
  }
}

module.exports = MainStorage;
