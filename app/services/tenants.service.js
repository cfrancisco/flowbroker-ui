const axios = require("axios");

const { Logger } = require("@dojot/microservice-sdk");

const { ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

const logger = new Logger("flowbroker-ui:http.service");

/**
 * Requesting current tenants from Dojot
 *
 */
const getTenants = async () => {
  const host = `${config.dojot.auth.url}`;
  logger.debug(`Retrieving tenants from Dojot at ${host}`);

  const axiosConfig = {
    accept: "application/json",
  };

  try {
    const data = await axios.get(`${host}/admin/tenants`, axiosConfig);
    return data.data.tenants;
  } catch (err) {
    logger.error(`Call tenants.service - Requesting error: ${err.message}`);
    return [];
  }
};

module.exports = { getTenants };
