const { Logger, ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const logger = new Logger("flowbroker-ui:main-storage");

const DojotHandler = require("../dojot/DojotHandler");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

let _tenants = {};
const _flowsData = {};
const _wsConns = {};

class MainStorage {
  static isTenantConnected(tenantpath) {
    return _wsConns[tenantpath];
  }

  static setConnected(tenantpath) {
    logger.debug(`Websocket emits connection to client: ${tenantpath}`);
    _wsConns[tenantpath] = true;
  }

  static setClosed(tenantpath) {
    logger.debug("Connection with client was closed.");
    _wsConns[tenantpath] = false;
  }

  static newTenant(name) {
    // @TODO this could be a class
    const tenant = {
      storage: "",
      runtime: "",
      httpServer: "",
      setting: "",
      redInstance: "",
    };

    // Dojot Handler is responsible for handling Dojot requests.
    tenant.dojotHandler = new DojotHandler(config.dojot, name);
    _tenants[name] = tenant;
  }

  static getStorage() {
    logger.debug("MainStorage's instance was requested.");
    if (!_tenants) {
      _tenants = {};
    }
    return _tenants;
  }

  static getFlowsData(tenant) {
    return _flowsData[tenant];
  }

  static setFlowsData(tenant, attr, value) {
    if (!_flowsData[tenant]) {
      _flowsData[tenant] = {};
    }
    _flowsData[tenant][attr] = value;
  }

  get webSocketServer() {
    return this._webSocketServer;
  }

  set webSocketServer(_ws) {
    logger.debug("The webSocketServer was added.");
    this._webSocketServer = _ws;
  }

  static getByTenant(tenant, prop) {
    logger.debug(`getByTenant - ${tenant}:${prop}`);
    if (_tenants) {
      return _tenants[tenant][prop];
    }
    return null;
  }

  static setByTenant(tenant, prop, value) {
    console.log(`Setting for ${tenant} prop ${prop} value ${value}`);
    _tenants[tenant][prop] = value;
  }

  /*
    Handle RED instances
  */
  static setInstance(tenant, redInstance) {
    _tenants[tenant].redInstance = redInstance;
  }
}

module.exports = MainStorage;
