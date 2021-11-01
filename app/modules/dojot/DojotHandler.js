const { Logger } = require("@dojot/microservice-sdk");

const axios = require("axios");

const { castFlowsToDojot, castDojotToFlows } = require("./utils");

const { removeFlow, saveFlow, updateFlow } = require("../../services/flows.service");

/**
 * Class representing a DojotHandler
 * @class
 */
class DojotHandler {
  /**
   * Creates a MQTTClient
   *
   * @param {String} configs.user User to login in Dojot
   * @param {String} configs.password Password to login in Dojot
   * @param {String} configs.flow.url Flow service URL
   * @param {String} configs.auth.url Auth service URL
   *
   * @constructor
   */
  constructor(configs, tenantName) {
    this.tenant = tenantName;
    this.logger = new Logger("flowbroker-ui:DojotHandler");
    this.configs = configs;
    this.user = configs.user;
    this.password = configs.password;
  }

  /**
   * Inits the DojotHandler, requesting a valid Token for the
   *  passed user/pass.
   */
  async init() {
    try {
      this.logger.info("Requesting Default User Token to Dojot.", {
        rid: `tenant/${this.tenant}`,
      });
      const res = await axios.post(
        this.configs.auth.url,
        { username: this.user, passwd: this.password },
        { accept: "application/json" },
      );
      this.defaultToken = res.data.jwt;
      this.logger.debug(`Token was received. Using ${this.defaultToken}`, {
        rid: `tenant/${this.tenant}`,
      });
      this.config = {
        accept: "application/json",
        headers: { Authorization: `Bearer ${this.defaultToken}` },
      };
    } catch (err) {
      this.logger.error(`init DojotHandler - Requesting error: ${err.toString()}`);
    }
  }

  /**
   * Gets the flows from Dojot.
   *
   */
  getFlows() {
    this.logger.info("Requesting Flows from Dojot.", {
      rid: `tenant/${this.tenant}`,
    });
    // return data as a promise
    return new Promise((resolve, reject) => {
      axios
        .get(this.configs.flow.url, this.config)
        .then((response) => {
          const dataReceived = castDojotToFlows(response.data.flows);
          this.logger.info(
            `Received ${dataReceived.filter((data) => data.type === "tab").length} flows. `,
          );
          resolve(dataReceived);
        })
        .catch((err) => {
          this.logger.error(`getFlows DojotHandler - Requesting error: ${err.toString()}`);
          reject(err.toString());
        });
    });
  }

  /**
   * Main method to save flows in Dojot.
   * To attempt it, we should uses the JWT Token sent by the requester.
   *
   * @param {array{object}} flows A list of Dojot flows
   */
  saveFlows(flows, user) {
    this.logger.info(`Saving Flows to Dojot with Token: ${user.token}`, {
      rid: `tenant/${this.tenant}`,
    });
    // create and return a promise
    const getAllFlows = castFlowsToDojot(flows);
    const promisesFlows = [];

    // create configuration to be used in axios
    const headers = {
      accept: "application/json",
      headers: { Authorization: `Bearer ${user.token}` },
    };

    getAllFlows.forEach((flow) => {
      // remove the "should be deleted" flows
      if (flow.shouldBeDeleted) {
        promisesFlows.push(removeFlow(flow, headers, this.tenant));
        return;
      }

      if (flow.isNew) {
        promisesFlows.push(saveFlow(flow, headers, this.tenant));
      } else {
        promisesFlows.push(updateFlow(flow, headers, this.tenant));
      }
    });
    return Promise.all(promisesFlows);
  }
}

module.exports = DojotHandler;
