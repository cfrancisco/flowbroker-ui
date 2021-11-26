/**
 * @mixin @node-red/runtime_flows
 */

/**
 * @typedef Flows
 * @type {object}
 * @property {string} rev - the flow revision identifier
 * @property {Array}  flows - the flow configuration, an array of node configuration objects
 */

const { Mutex } = require("async-mutex");

const { Logger } = require("@dojot/microservice-sdk");

const MainStorage = require("../../../../repository/MainStorage");

const logger = new Logger("flowbroker-ui:runtime/api");

const mutex = new Mutex();

const { log } = require("@node-red/util");

let runtime;

const api = {
  init(_runtime) {
    runtime = _runtime;
    logger.debug(" Initializing runtimeAPI...", {
      rid: `tenant/${runtime.tenant}`,
    });
  },
  /**
   * Gets the current flow configuration
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Flows>} - the active flow configuration
   * @memberof @node-red/runtime_flows
   */
  async getFlows(opts) {
    // Issue: runtime.flows isn't bound with right runtime, so will get from the MainStorage
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    log.audit({ event: "flows.get" }, opts.req);
    console.log(
      "Requesting Flows for tenant: ",
      opts.tenant,
      ` Using runtimeAPI: ${runtime.tenant}`,
    );

    return _runtime._.nodes.flows.getFlows();
  },
  /**
   * Sets the current flow configuration
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.flows - the flow configuration: `{flows: [..], credentials: {}}`
   * @param {Object} opts.deploymentType - the type of deployment:
   *     - "full", "nodes", "flows", "reload"
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Flows>} - the active flow configuration
   * @memberof @node-red/runtime_flows
   */
  async setFlows(opts) {
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    logger.info(
      `Requesting Flows for tenant: ${opts.tenant}, deployment: ${opts.deploymentType}.`,
      { rid: `tenant/${runtime.tenant}` },
    );

    return mutex.runExclusive(async () => {
      const { flows } = opts;

      // When receives from UI, for Dojot, we always setting deploymentType as full.
      const deploymentType = opts.deploymentType || "full";
      log.audit({ event: "flows.set", type: deploymentType }, opts.req);

      let apiPromise;
      if (deploymentType === "reload") {
        apiPromise = _runtime._.nodes.flows.loadFlows(true);
      } else {
        if (flows.hasOwnProperty("rev")) {
          const currentVersion = _runtime._.nodes.flows.getFlows(_runtime).rev;
          if (currentVersion !== flows.rev) {
            let err;
            err = new Error();
            err.code = "version_mismatch";
            err.status = 409;
            // TODO: log warning
            throw err;
          }
        }
        const user = { ...opts.user, tenant: _runtime.tenant, token: opts.token };
        apiPromise = _runtime._.nodes.flows.setFlows(
          flows.flows,
          flows.credentials,
          deploymentType,
          null,
          null,
          user,
        );
      }
      return apiPromise
        .then((flowId) => ({ rev: flowId }))
        .catch((err) => {
          log.warn(
            log._(`api.flows.error-${deploymentType === "reload" ? "reload" : "save"}`, {
              message: err.message,
            }),
          );
          log.warn(err.stack);
          throw err;
        });
    });
  },

  /**
   * Adds a flow configuration
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.flow - the flow to add
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<String>} - the id of the added flow
   * @memberof @node-red/runtime_flows
   */
  async addFlow(opts) {
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    logger.info(`Adding Flow for tenant: ${opts.tenant}`, { rid: `tenant/${runtime.tenant}` });

    return mutex.runExclusive(async () => {
      const { flow } = opts;
      return _runtime._.nodes.flows
        .addFlow(flow, opts.user)
        .then((id) => {
          log.audit({ event: "flow.add", id }, opts.req);
          return id;
        })
        .catch((err) => {
          log.audit(
            {
              event: "flow.add",
              error: err.code || "unexpected_error",
              message: err.toString(),
            },
            opts.req,
          );
          err.status = 400;
          throw err;
        });
    });
  },

  /**
   * Gets an individual flow configuration
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.id - the id of the flow to retrieve
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Flow>} - the active flow configuration
   * @memberof @node-red/runtime_flows
   */
  async getFlow(opts) {
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    logger.info(`Get Flow for tenant: ${opts.tenant}`, { rid: `tenant/${runtime.tenant}` });

    const flow = _runtime._.nodes.flows.getFlow(opts.id);
    if (flow) {
      log.audit({ event: "flow.get", id: opts.id }, opts.req);
      return flow;
    }
    log.audit({ event: "flow.get", id: opts.id, error: "not_found" }, opts.req);
    const err = new Error();
    err.code = "not_found";
    err.status = 404;
    throw err;
  },
  /**
   * Updates an existing flow configuration
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.id - the id of the flow to update
   * @param {Object} opts.flow - the flow configuration
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<String>} - the id of the updated flow
   * @memberof @node-red/runtime_flows
   */
  async updateFlow(opts) {
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    logger.info(`Update Flow for tenant: ${opts.tenant}`, { rid: `tenant/${runtime.tenant}` });

    return mutex.runExclusive(async () => {
      const { flow } = opts;
      const { id } = opts;
      return _runtime._.nodes.flows
        .updateFlow(id, flow, opts.user, opts.token)
        .then(() => {
          log.audit({ event: "flow.update", id }, opts.req);
          return id;
        })
        .catch((err) => {
          if (err.code === 404) {
            log.audit({ event: "flow.update", id, error: "not_found" }, opts.req);
            // TODO: this swap around of .code and .status isn't ideal
            err.status = 404;
            err.code = "not_found";
          } else {
            log.audit(
              {
                event: "flow.update",
                error: err.code || "unexpected_error",
                message: err.toString(),
              },
              opts.req,
            );
            err.status = 400;
          }
          throw err;
        });
    });
  },
  /**
   * Deletes a flow
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {Object} opts.id - the id of the flow to delete
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise} - resolves if successful
   * @memberof @node-red/runtime_flows
   */
  async deleteFlow(opts) {
    const _runtime = MainStorage.getByTenant(opts.tenant, "runtime");
    logger.info(`Delete Flow for tenant: ${opts.tenant}`, { rid: `tenant/${runtime.tenant}` });

    return mutex.runExclusive(() => {
      const { id } = opts;
      return _runtime._.nodes.flows
        .removeFlow(id, opts.user)
        .then(() => {
          log.audit({ event: "flow.remove", id }, opts.req);
        })
        .catch((err) => {
          if (err.code === 404) {
            log.audit({ event: "flow.remove", id, error: "not_found" }, opts.req);
            // TODO: this swap around of .code and .status isn't ideal
            err.status = 404;
            err.code = "not_found";
          } else {
            log.audit(
              {
                event: "flow.remove",
                id,
                error: err.code || "unexpected_error",
                message: err.toString(),
              },
              opts.req,
            );
            err.status = 400;
          }
          throw err;
        });
    });
  },

  /**
   * Gets the safe credentials for a node
   * @param {Object} opts
   * @param {User} opts.user - the user calling the api
   * @param {String} opts.type - the node type to return the credential information for
   * @param {String} opts.id - the node id
   * @param {Object} opts.req - the request to log (optional)
   * @return {Promise<Object>} - the safe credentials
   * @memberof @node-red/runtime_flows
   */
  async getNodeCredentials(opts) {
    log.audit({ event: "credentials.get", type: opts.type, id: opts.id }, opts.req);
    const credentials = runtime.nodes.getCredentials(opts.id);
    if (!credentials) {
      return {};
    }
    const sendCredentials = {};
    let cred;
    if (/^subflow(:|$)/.test(opts.type)) {
      for (cred in credentials) {
        if (credentials.hasOwnProperty(cred)) {
          sendCredentials[`has_${cred}`] = credentials[cred] != null && credentials[cred] !== "";
        }
      }
    } else {
      const definition = runtime.nodes.getCredentialDefinition(opts.type) || {};
      for (cred in definition) {
        if (definition.hasOwnProperty(cred)) {
          if (definition[cred].type == "password") {
            const key = `has_${cred}`;
            sendCredentials[key] = credentials[cred] != null && credentials[cred] !== "";
            continue;
          }
          sendCredentials[cred] = credentials[cred] || "";
        }
      }
    }
    return sendCredentials;
  },
};

module.exports = api;
