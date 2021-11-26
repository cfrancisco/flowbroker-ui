const axios = require("axios");

const { Logger } = require("@dojot/microservice-sdk");

const { ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const config = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

const logger = new Logger("flowbroker-ui:http.service");

const host = `${config.dojot.host}:${config.dojot.port}`;

/**
 * Do a Login
 *
 */
const getToken = async () => {
  try {
    logger.info("Requesting Token to Dojot.");
    const res = await axios.post(
      `${host}/auth/`,
      { username: config.flowui.user, passwd: config.flowui.password },
      { accept: "application/json" },
    );
    return res.data.jwt;
  } catch (err) {
    logger.error(`Call Http.service - Requesting error: ${err.toString()}`);
    return null;
  }
};

const getDevices = async (params = "") => {
  try {
    const token = await getToken();
    logger.info("Getting Devices from Dojot.");
    const axiosConfig = {
      accept: "application/json",
      headers: { Authorization: `Bearer ${token}` },
    };
    return axios.get(`${host}/device${params}`, axiosConfig);
  } catch (err) {
    logger.error(`Call Http.service - Requesting error: ${err.toString()}`);
    return [];
  }
};

module.exports = { getDevices };
