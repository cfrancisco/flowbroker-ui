const { Logger } = require("@dojot/microservice-sdk");

const axios = require("axios");

this.logger = new Logger("flowbroker-ui:dojot/flows.service");

const { ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const configs = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));

/**
 * Remove an flow from Dojot.
 *
 * @param {object} flow The flow to be removed.
 */
const removeFlow = (flow, header, tenant) =>
  axios
    .delete(`${configs.dojot.flow.url}/${flow.id}`, header)
    .then(() => {
      this.logger.info(`Flow ${flow.name} successfully removed from Dojot.`, {
        rid: `tenant/${tenant}`,
      });
    })
    .catch((err) => {
      this.logger.error(`Error in removeFlow: ${err.toString()}`, { rid: `tenant/${tenant}` });
    });

/**
 * Saving flow to Dojot.
 *
 * @param {object} flow A flow to be saved in Dojot
 */
const saveFlow = (flow, header, tenant) =>
  axios
    .post(configs.dojot.flow.url, flow, header)
    .then(() => {
      this.logger.info(`Flow ${flow.name} successfully saved to Dojot.`, {
        rid: `tenant/${tenant}`,
      });
    })
    .catch((err) => {
      this.logger.error(`Error in saveFlow: ${err.toString()}`, { rid: `tenant/${tenant}` });
    });

/**
 * Updating flow in Dojot.
 *
 * @param {object} flow A flow to be updated in Dojot
 */
const updateFlow = (flow, header, tenant) =>
  axios
    .put(`${configs.dojot.flow.url}/${flow.id}`, flow, header)
    .then(() => {
      this.logger.info(`Flow ${flow.name} successfully updated in Dojot.`, {
        rid: `tenant/${tenant}`,
      });
    })
    .catch((err) => {
      this.logger.error(`Error in updateFlow: ${err.toString()}`, {
        rid: `tenant/${tenant}`,
      });
    });

module.exports = { removeFlow, saveFlow, updateFlow };
