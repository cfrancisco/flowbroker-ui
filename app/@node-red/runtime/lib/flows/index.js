const clone = require("clone");

const { log } = require("@node-red/util");

const { Logger } = require("@dojot/microservice-sdk");

const { events } = require("@node-red/util");

const redUtil = require("@node-red/util").util;

const typeRegistry = require("../../../registry");

const Flow = require("./Flow");

const MainStorage = require("../../../../repository/MainStorage");

const { deprecated } = typeRegistry;

const context = require("../nodes/context");

const credentials = require("../nodes/credentials");

const flowUtil = require("./util");

const logger = new Logger("flowbroker-ui:runtime/flows");

const RepoFlows = require("../../../../repository/RepoFlows");

const repo = new RepoFlows();

function init(_runtime) {
  if (repo.started) {
    throw new Error("Cannot init without a stop");
  }

  MainStorage.setByTenant(_runtime.tenant, "settings", _runtime.settings);
  MainStorage.setByTenant(_runtime.tenant, "storage", _runtime.storage);
  // settings = _runtime.settings;
  // storage = _runtime.storage;
  repo.tenant = _runtime.tenant;
  repo.started = false;
  logger.debug("Flows initializing...", {
    rid: `tenant/${repo.tenant}`,
  });

  if (!repo.typeEventRegistered) {
    events.on("type-registered", (type) => {
      if (repo.activeFlowConfig && repo.activeFlowConfig.missingTypes.length > 0) {
        const i = repo.activeFlowConfig.missingTypes.indexOf(type);
        if (i != -1) {
          logger.info(log._("nodes.flows.registered-missing", { type }));
          repo.activeFlowConfig.missingTypes.splice(i, 1);
          if (repo.activeFlowConfig.missingTypes.length === 0 && repo.started) {
            events.emit("runtime-event", { id: "runtime-state", retain: true });
            start();
          }
        }
      }
    });
    repo.typeEventRegistered = true;
  }
  Flow.init(_runtime);
  flowUtil.init(_runtime);
}

function loadFlows() {
  logger.debug("Loading Flows.", { rid: `tenant/${repo.tenant}` });
  let config;
  return MainStorage.getByTenant(repo.tenant, "storage")
    .getFlows(repo.tenant)
    .then((_config) => {
      config = _config;
      logger.debug(`loaded flow revision: ${config.rev}`, { rid: `tenant/${repo.tenant}` });
      return credentials.load(config.credentials).then(() => {
        events.emit("runtime-event", { id: "runtime-state", retain: true });
        return config;
      });
    })
    .catch((err) => {
      repo.activeConfig = null;
      events.emit("runtime-event", {
        id: "runtime-state",
        payload: {
          type: "warning",
          error: err.code,
          project: err.project,
          text: `notification.warnings.${err.code}`,
        },
        retain: true,
      });
      if (err.code === "project_not_found") {
        logger.warn(
          log._("storage.localfilesystem.projects.project-not-found", { project: err.project }),
        );
      } else {
        logger.warn(log._("nodes.flows.error", { message: err.toString() }));
      }
      throw err;
    });
}

function load(forceStart) {
  return setFlows(null, null, "load", false, forceStart, null, repo.tenant);
}

/*
 * _config - new node array configuration
 * _credentials - new credentials configuration (optional)
 * type - full/nodes/flows/load (default full)
 * muteLog - don't emit the standard log messages (used for individual flow api)
 */
function setFlows(_config, _credentials, type, muteLog, forceStart, user) {
  logger.debug("Setting Flows.", { rid: `tenant/${repo.tenant}` });

  if (typeof _credentials === "string") {
    type = _credentials;
    _credentials = null;
  }
  type = type || "full";

  let configSavePromise = null;
  let config = null;
  let diff;
  let newFlowConfig;
  let isLoad = false;
  logger.debug(`Setting Flows with type:${type}`, { rid: `tenant/${repo.tenant}` });

  // sounds that setFlows with type=load the node-RED are only requesting the
  // flows from its storage, and not aiming save them in the database.
  if (type === "load") {
    isLoad = true;
    configSavePromise = loadFlows(repo.tenant).then((_config) => {
      config = clone(_config.flows);
      newFlowConfig = flowUtil.parseConfig(clone(config));
      type = "full";
      return _config.rev;
    });
  } else {
    // Clone the provided config so it can be manipulated
    config = clone(_config);
    // Parse the configuration
    newFlowConfig = flowUtil.parseConfig(clone(config));
    // Generate a diff to identify what has changed
    diff = flowUtil.diffConfigs(repo.activeFlowConfig, newFlowConfig);

    // Now the flows have been compared, remove any credentials from newFlowConfig
    // so they don't cause false-positive diffs the next time a flow is deployed
    for (const id in newFlowConfig.allNodes) {
      if (newFlowConfig.allNodes.hasOwnProperty(id)) {
        delete newFlowConfig.allNodes[id].credentials;
      }
    }
    var credsDirty;

    if (_credentials) {
      if (_credentials.$) {
        // this is a set of encrypted credentials - pass to load to decrypt
        // the complete set
        configSavePromise = credentials.load(_credentials);
      } else {
        credentials.clean(config);
        // A full set of credentials have been provided. Use those instead
        const credentialSavePromises = [];
        for (const id in _credentials) {
          if (_credentials.hasOwnProperty(id)) {
            credentialSavePromises.push(credentials.add(id, _credentials[id]));
          }
        }
        configSavePromise = Promise.all(credentialSavePromises);
        credsDirty = true;
      }
    } else {
      // Allow the credential store to remove anything no longer needed
      credentials.clean(config);

      // Remember whether credentials need saving or not
      var credsDirty = credentials.dirty();

      configSavePromise = Promise.resolve();
    }

    // Get the latest credentials and ask storage to save them (if needed)
    // as well as the new flow configuration.
    configSavePromise = configSavePromise
      .then(() => credentials.export())
      .then((creds) => {
        const saveConfig = {
          flows: config,
          credentialsDirty: credsDirty,
          credentials: creds,
        };
        logger.debug("Requesting for DojotHandler to save all flows. ", {
          rid: `tenant/${repo.tenant}`,
        });
        return MainStorage.getByTenant(repo.tenant, "storage").saveFlows(saveConfig, user);
      });
  }

  return configSavePromise.then((flowRevision) => {
    if (!isLoad) {
      logger.debug(`saved flow revision: ${flowRevision}`);
    }
    repo.activeConfig = {
      flows: config,
      rev: flowRevision,
    };
    repo.activeFlowConfig = newFlowConfig;

    if (forceStart || repo.started) {
      // Flows are running (or should be)

      // Stop the active flows (according to deploy type and the diff)
      return stop(type, diff, muteLog)
        .then(() =>
          // Once stopped, allow context to remove anything no longer needed
          context.clean(repo.activeFlowConfig),)
        .then(() => {
          // Start the active flows
          start(type, diff, muteLog, repo.tenant).then(() => {
            events.emit("runtime-event", {
              id: "runtime-deploy",
              payload: { revision: flowRevision },
              retain: true,
            });
          });
          // Return the new revision asynchronously to the actual start
          return flowRevision;
        })
        .catch((err) => {});
    }
    /*
    events.emit("runtime-event", {
      id: "runtime-deploy",
      payload: { revision: flowRevision },
      retain: true,
    });
    */
  });
}

function getNode(id) {
  let node;
  if (repo.activeNodesToFlow[id] && repo.activeFlows[repo.activeNodesToFlow[id]]) {
    return repo.activeFlows[repo.activeNodesToFlow[id]].getNode(id, true);
  }
  for (const flowId in repo.activeFlows) {
    if (repo.activeFlows.hasOwnProperty(flowId)) {
      node = repo.activeFlows[flowId].getNode(id, true);
      if (node) {
        return node;
      }
    }
  }
  return null;
}

function eachNode(cb) {
  for (const id in repo.activeFlowConfig.allNodes) {
    if (repo.activeFlowConfig.allNodes.hasOwnProperty(id)) {
      cb(repo.activeFlowConfig.allNodes[id]);
    }
  }
}

function getFlows() {
  logger.debug("Getting flows from GlobalStorage.", {
    rid: `tenant/${repo.tenant}`,
  });
  return repo.activeConfig;
}

async function start(type, diff, muteLog) {
  type = type || "full";
  repo.started = true;
  let i;
  const totalNodes = Object.keys(repo.activeFlowConfig.flows).length;
  logger.info(`Starting flows... total amount of flows: ${totalNodes}`, {
    rid: `tenant/${repo.tenant}`,
  });

  // If there are missing types, report them, emit the necessary runtime event and return
  if (repo.activeFlowConfig.missingTypes.length > 0) {
    logger.error(log._("nodes.flows.missing-types"), {
      rid: `tenant/${repo.tenant}`,
    });
    let knownUnknowns = 0;
    for (i = 0; i < repo.activeFlowConfig.missingTypes.length; i++) {
      const nodeType = repo.activeFlowConfig.missingTypes[i];
      const info = deprecated.get(nodeType);
      if (info) {
        logger.error(
          log._("nodes.flows.missing-type-provided", {
            type: repo.activeFlowConfig.missingTypes[i],
            module: info.module,
          }),
        );
        knownUnknowns += 1;
      } else {
        logger.info(` - ${repo.activeFlowConfig.missingTypes[i]}`);
      }
    }
    if (knownUnknowns > 0) {
      logger.error(log._("nodes.flows.missing-type-install-1"));
      logger.error("  npm install <module name>");
      logger.error(log._("nodes.flows.missing-type-install-2"));
    }
    events.emit("runtime-event", {
      id: "runtime-state",
      payload: {
        error: "missing-types",
        type: "warning",
        text: "notification.warnings.missing-types",
        types: repo.activeFlowConfig.missingTypes,
      },
      retain: true,
    });
    return;
  }
  try {
    await typeRegistry.checkFlowDependencies(repo.activeConfig.flows);
  } catch (err) {
    logger.error(`Failed to load external modules required by this flow:${err.message}`, {
      rid: `tenant/${repo.tenant}`,
    });
    const missingModules = [];
    for (i = 0; i < err.length; i++) {
      const errMessage = err[i].error.toString();
      missingModules.push({
        module: err[i].module.module,
        error: err[i].error.code || err[i].error.toString(),
      });
      console.info(` - ${err[i].module.spec} [${err[i].error.code || "unknown_error"}]`);
    }
    events.emit("runtime-event", {
      id: "runtime-state",
      payload: {
        error: "missing-modules",
        type: "warning",
        text: "notification.warnings.missing-modules",
        modules: missingModules,
      },
      retain: true,
    });
    return;
  }

  if (!muteLog) {
    if (type !== "full") {
      logger.debug(log._(`nodes.flows.starting-modified-${type}`), {
        rid: `tenant/${repo.tenant}`,
      });
    } else {
      logger.debug(log._("nodes.flows.starting-flows"), {
        rid: `tenant/${repo.tenant}`,
      });
    }
  }
  events.emit("flows:starting", { config: repo.activeConfig, type, diff });

  let id;
  if (type === "full") {
    // A full start means everything should

    // Check the 'global' flow is running
    /* if (!repo.activeFlows.global) {
      logger.debug("red/nodes/flows.start : starting flow : global", {
        rid: `tenant/${repo.tenant}`,
      });
      repo.activeFlows.global = Flow.create(flowAPI, repo.activeFlowConfig);
    } */

    // Check each flow in the active configuration
    for (id in repo.activeFlowConfig.flows) {
      if (repo.activeFlowConfig.flows.hasOwnProperty(id)) {
        if (!repo.activeFlowConfig.flows[id].disabled && !repo.activeFlows[id]) {
          // This flow is not disabled, nor is it currently active, so create it
          repo.activeFlows[id] = Flow.create(
            flowAPI,
            repo.activeFlowConfig,
            repo.activeFlowConfig.flows[id],
          );
          logger.debug(`red/nodes/flows.start : starting flow : ${id}`, {
            rid: `tenant/${repo.tenant}`,
          });
        } else {
          logger.debug(`red/nodes/flows.start : not starting disabled flow : ${id}`, {
            rid: `tenant/${repo.tenant}`,
          });
        }
      }
    }
  } else {
    // A modified-type deploy means restarting things that have changed

    // Update the global flow
    // repo.activeFlows.global.update(repo.activeFlowConfig, repo.activeFlowConfig);
    for (id in repo.activeFlowConfig.flows) {
      if (repo.activeFlowConfig.flows.hasOwnProperty(id)) {
        if (!repo.activeFlowConfig.flows[id].disabled) {
          if (repo.activeFlows[id]) {
            // This flow exists and is not disabled, so update it
            repo.activeFlows[id].update(repo.activeFlowConfig, repo.activeFlowConfig.flows[id]);
          } else {
            // This flow didn't previously exist, so create it
            repo.activeFlows[id] = Flow.create(
              flowAPI,
              repo.activeFlowConfig,
              repo.activeFlowConfig.flows[id],
            );
            logger.debug(`red/nodes/flows.start : starting flow : ${id}`, {
              rid: `tenant/${repo.tenant}`,
            });
          }
        } else {
          logger.debug(`red/nodes/flows.start : not starting disabled flow : ${id}`, {
            rid: `tenant/${repo.tenant}`,
          });
        }
      }
    }
  }

  // Having created or updated all flows, now start them.
  for (id in repo.activeFlows) {
    if (repo.activeFlows.hasOwnProperty(id)) {
      try {
        repo.activeFlows[id].start(diff);

        // Create a map of node id to flow id and also a subflowInstance lookup map
        const activeNodes = repo.activeFlows[id].getActiveNodes();
        Object.keys(activeNodes).forEach((nid) => {
          repo.activeNodesToFlow[nid] = id;
        });
      } catch (err) {
        console.log(err.stack);
      }
    }
  }
  events.emit("flows:started", { config: repo.activeConfig, type, diff });
  // Deprecated event
  events.emit("nodes-started");

  if (!muteLog) {
    if (type !== "full") {
      logger.debug(log._(`nodes.flows.started-modified-${type}`), {
        rid: `tenant/${repo.tenant}`,
      });
    } else {
      logger.debug(log._("nodes.flows.started-flows"), {
        rid: `tenant/${repo.tenant}`,
      });
    }
  }
}

function stop(type, diff, muteLog) {
  if (!repo.started) {
    return Promise.resolve();
  }
  type = type || "full";
  diff = diff || {
    added: [],
    changed: [],
    removed: [],
    rewired: [],
    linked: [],
  };
  if (!muteLog) {
    if (type !== "full") {
      logger.info(log._(`nodes.flows.stopping-modified-${type}`), {
        rid: `tenant/${repo.tenant}`,
      });
    } else {
      logger.info(log._("nodes.flows.stopping-flows"), {
        rid: `tenant/${repo.tenant}`,
      });
    }
  }
  repo.started = false;
  const promises = [];
  let stopList;
  const removedList = diff.removed;
  if (type === "nodes") {
    stopList = diff.changed.concat(diff.removed);
  } else if (type === "flows") {
    stopList = diff.changed.concat(diff.removed).concat(diff.linked);
  }

  events.emit("flows:stopping", { config: repo.activeConfig, type, diff });

  // Stop the global flow object last
  const activeFlowIds = Object.keys(repo.activeFlows);
  const globalIndex = activeFlowIds.indexOf("global");
  if (globalIndex !== -1) {
    activeFlowIds.splice(globalIndex, 1);
    activeFlowIds.push("global");
  }

  activeFlowIds.forEach((id) => {
    if (repo.activeFlows.hasOwnProperty(id)) {
      const flowStateChanged = diff && (diff.added.indexOf(id) !== -1 || diff.removed.indexOf(id) !== -1);
      logger.debug(`red/nodes/flows.stop : stopping flow : ${id}`);
      promises.push(repo.activeFlows[id].stop(flowStateChanged ? null : stopList, removedList));
      if (type === "full" || flowStateChanged || diff.removed.indexOf(id) !== -1) {
        delete repo.activeFlows[id];
      }
    }
  });

  return Promise.all(promises).then(() => {
    for (const id in repo.activeNodesToFlow) {
      if (repo.activeNodesToFlow.hasOwnProperty(id)) {
        if (!repo.activeFlows[repo.activeNodesToFlow[id]]) {
          delete repo.activeNodesToFlow[id];
        }
      }
    }
    if (stopList) {
      stopList.forEach((id) => {
        delete repo.activeNodesToFlow[id];
      });
    }
    if (!muteLog) {
      if (type !== "full") {
        logger.info(log._(`nodes.flows.stopped-modified-${type}`), {
          rid: `tenant/${repo.tenant}`,
        });
      } else {
        logger.info(log._("nodes.flows.stopped-flows"), {
          rid: `tenant/${repo.tenant}`,
        });
      }
    }
    events.emit("flows:stopped", { config: repo.activeConfig, type, diff });
    // Deprecated event
    events.emit("nodes-stopped");
  });
}

function checkTypeInUse(id) {
  const nodeInfo = typeRegistry.getNodeInfo(id);
  if (!nodeInfo) {
    throw new Error(log._("nodes.index.unrecognised-id", { id }));
  } else {
    const inUse = {};
    const config = getFlows();
    config.flows.forEach((n) => {
      inUse[n.type] = (inUse[n.type] || 0) + 1;
    });
    const nodesInUse = [];
    nodeInfo.types.forEach((t) => {
      if (inUse[t]) {
        nodesInUse.push(t);
      }
    });
    if (nodesInUse.length > 0) {
      const msg = nodesInUse.join(", ");
      const err = new Error(log._("nodes.index.type-in-use", { msg }));
      err.code = "type_in_use";
      throw err;
    }
  }
}

function updateMissingTypes() {
  const subflowInstanceRE = /^subflow:(.+)$/;
  repo.activeFlowConfig.missingTypes = [];

  for (const id in repo.activeFlowConfig.allNodes) {
    if (repo.activeFlowConfig.allNodes.hasOwnProperty(id)) {
      const node = repo.activeFlowConfig.allNodes[id];
      if (node.type !== "tab" && node.type !== "subflow") {
        console.log("node.type", node.type);
        const subflowDetails = subflowInstanceRE.exec(node.type);
        if (
          (subflowDetails && !repo.activeFlowConfig.subflows[subflowDetails[1]])
          || (!subflowDetails && !typeRegistry.get(node.type))
        ) {
          if (repo.activeFlowConfig.missingTypes.indexOf(node.type) === -1) {
            repo.activeFlowConfig.missingTypes.push(node.type);
          }
        }
      }
    }
  }
}

async function addFlow(flow, user) {
  logger.debug("Adding a new flow...", {
    rid: `tenant/${repo.tenant}`,
  });

  let i;
  let node;
  if (!flow.hasOwnProperty("nodes")) {
    throw new Error("missing nodes property");
  }
  flow.id = redUtil.generateId();

  const tabNode = {
    type: "tab",
    label: flow.label,
    id: flow.id,
  };
  if (flow.hasOwnProperty("info")) {
    tabNode.info = flow.info;
  }
  if (flow.hasOwnProperty("disabled")) {
    tabNode.disabled = flow.disabled;
  }

  const nodes = [tabNode];

  for (i = 0; i < flow.nodes.length; i++) {
    node = flow.nodes[i];
    if (repo.activeFlowConfig.allNodes[node.id]) {
      // TODO nls
      throw new Error("duplicate id");
    }
    if (node.type === "tab" || node.type === "subflow") {
      throw new Error(`invalid node type: ${node.type}`);
    }
    node.z = flow.id;
    nodes.push(node);
  }
  if (flow.configs) {
    for (i = 0; i < flow.configs.length; i++) {
      node = flow.configs[i];
      if (repo.activeFlowConfig.allNodes[node.id]) {
        // TODO nls
        throw new Error("duplicate id");
      }
      if (node.type === "tab" || node.type === "subflow") {
        throw new Error(`invalid node type: ${node.type}`);
      }
      node.z = flow.id;
      nodes.push(node);
    }
  }
  let newConfig = clone(repo.activeConfig.flows);
  newConfig = newConfig.concat(nodes);

  return setFlows(newConfig, null, "flows", true, null, user).then(() => {
    logger.info(
      log._("nodes.flows.added-flow", {
        label: `${flow.label ? `${flow.label} ` : ""}[${flow.id}]`,
      }),
    );
    return flow.id;
  });
}

function getFlow(id) {
  logger.debug("Getting flow...", {
    rid: `tenant/${repo.tenant}`,
  });

  let flow;
  if (id === "global") {
    flow = repo.activeFlowConfig;
  } else {
    flow = repo.activeFlowConfig.flows[id];
  }
  if (!flow) {
    return null;
  }
  const result = {
    id,
  };
  if (flow.label) {
    result.label = flow.label;
  }
  if (flow.hasOwnProperty("disabled")) {
    result.disabled = flow.disabled;
  }
  if (flow.hasOwnProperty("info")) {
    result.info = flow.info;
  }
  if (id !== "global") {
    result.nodes = [];
  }
  if (flow.nodes) {
    const nodeIds = Object.keys(flow.nodes);
    if (nodeIds.length > 0) {
      result.nodes = nodeIds.map((nodeId) => {
        const node = clone(flow.nodes[nodeId]);
        if (node.type === "link out") {
          delete node.wires;
        }
        return node;
      });
    }
  }
  if (flow.configs) {
    const configIds = Object.keys(flow.configs);
    result.configs = configIds.map((configId) => clone(flow.configs[configId]));
    if (result.configs.length === 0) {
      delete result.configs;
    }
  }
  if (flow.subflows) {
    const subflowIds = Object.keys(flow.subflows);
    result.subflows = subflowIds.map((subflowId) => {
      const subflow = clone(flow.subflows[subflowId]);
      const nodeIds = Object.keys(subflow.nodes);
      subflow.nodes = nodeIds.map((id) => subflow.nodes[id]);
      if (subflow.configs) {
        const configIds = Object.keys(subflow.configs);
        subflow.configs = configIds.map((id) => subflow.configs[id]);
      }
      delete subflow.instances;
      return subflow;
    });
    if (result.subflows.length === 0) {
      delete result.subflows;
    }
  }
  return result;
}

async function updateFlow(id, newFlow, user, token) {
  logger.debug(`Updating flow with ID:${id}`, {
    rid: `tenant/${repo.tenant}`,
  });

  let label = id;
  if (id !== "global") {
    if (!repo.activeFlowConfig.flows[id]) {
      const e = new Error();
      e.code = 404;
      throw e;
    }
    label = repo.activeFlowConfig.flows[id].label;
  }
  let newConfig = clone(repo.activeConfig.flows);
  let nodes;

  if (id === "global") {
    // Remove all nodes whose z is not a known flow
    // When subflows can be owned by a flow, this logic will have to take
    // that into account
    newConfig = newConfig.filter(
      (node) =>
        node.type === "tab"
        || (node.hasOwnProperty("z") && repo.activeFlowConfig.flows.hasOwnProperty(node.z)),
    );

    // Add in the new config nodes
    nodes = newFlow.configs || [];
    if (newFlow.subflows) {
      // Add in the new subflows
      newFlow.subflows.forEach((sf) => {
        nodes = nodes.concat(sf.nodes || []).concat(sf.configs || []);
        delete sf.nodes;
        delete sf.configs;
        nodes.push(sf);
      });
    }
  } else {
    newConfig = newConfig.filter((node) => node.z !== id && node.id !== id);
    const tabNode = {
      type: "tab",
      label: newFlow.label,
      id,
    };
    if (newFlow.hasOwnProperty("info")) {
      tabNode.info = newFlow.info;
    }
    if (newFlow.hasOwnProperty("disabled")) {
      tabNode.disabled = newFlow.disabled;
    }

    nodes = [tabNode].concat(newFlow.nodes || []).concat(newFlow.configs || []);
    nodes.forEach((n) => {
      if (n.type !== "tab") {
        n.z = id;
      }
    });
  }

  newConfig = newConfig.concat(nodes);
  return setFlows(newConfig, null, "flows", true, null, user, repo.tenant).then(() => {
    logger.info(log._("nodes.flows.updated-flow", { label: `${label ? `${label} ` : ""}[${id}]` }));
  });
}

async function removeFlow(id, user) {
  logger.debug(`Removing flow with ID:${id}`, {
    rid: `tenant/${repo.tenant}`,
  });

  if (id === "global") {
    // TODO: nls + error code
    throw new Error("not allowed to remove global");
  }
  const flow = repo.activeFlowConfig.flows[id];
  if (!flow) {
    const e = new Error();
    e.code = 404;
    throw e;
  }

  let newConfig = clone(repo.activeConfig.flows);
  newConfig = newConfig.filter((node) => node.z !== id && node.id !== id);

  return setFlows(newConfig, null, "flows", true, null, user, repo.tenant).then(() => {
    logger.info(
      log._("nodes.flows.removed-flow", {
        label: `${flow.label ? `${flow.label} ` : ""}[${flow.id}]`,
      }),
    );
  });
}

const flowAPI = {
  getNode,
  handleError: () => false,
  handleStatus: () => false,
  getSetting: (k) => flowUtil.getEnvVar(k),
  log: (m) => logger.log(m),
};

module.exports = {
  init,

  /**
   * Load the current flow configuration from storage
   * @return a promise for the loading of the config
   */
  load,
  loadFlows: load,
  repo,
  get: getNode,
  eachNode,

  /**
   * Gets the current flow configuration
   */
  getFlows,
  activeConfig: repo.activeConfig,
  /**
   * Sets the current active config.
   * @param config the configuration to enable
   * @param type the type of deployment to do: full (default), nodes, flows, load
   * @return a promise for the saving/starting of the new flow
   */
  setFlows,

  /**
   * Starts the current flow configuration
   */
  startFlows: start,

  /**
   * Stops the current flow configuration
   * @return a promise for the stopping of the flow
   */
  stopFlows: stop,

  get started() {
    return repo.started;
  },

  // handleError: handleError,
  // handleStatus: handleStatus,

  checkTypeInUse,

  addFlow,
  getFlow,
  updateFlow,
  removeFlow,
  disableFlow: null,
  enableFlow: null,
  isDeliveryModeAsync() {
    // If settings is null, this is likely being run by unit tests
    return (
      !MainStorage.getByTenant(repo.tenant, "settings")
      || !MainStorage.getByTenant(repo.tenant, "settings").runtimeSyncDelivery
    );
  },
};
