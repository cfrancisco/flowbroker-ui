const clone = require("clone");
const util = require("util");

const importFresh = require("import-fresh");

const registry = importFresh("./../../../../@node-red/registry");

const { events } = require("@node-red/util");
const { Logger } = require("@dojot/microservice-sdk");
const credentials = require("./credentials");

const flows = importFresh("../flows");
const flowUtil = require("../flows/util");
const context = require("./context");
const Node = require("./Node");

const logger = new Logger("flowbroker-ui:runtime/lib/nodes");

let settings;

/**
 * Registers a node constructor
 * @param nodeSet - the nodeSet providing the node (module/set)
 * @param type - the string type name
 * @param constructor - the constructor function for this node type
 * @param opts - optional additional options for the node
 */
function registerType(nodeSet, type, constructor, opts) {
  if (typeof type !== "string") {
    // This is someone calling the api directly, rather than via the
    // RED object provided to a node. Log a warning
    logger.warn(
      `[${nodeSet}] Deprecated call to RED.runtime.nodes.registerType - node-set name must be provided as first argument`,
    );
    opts = constructor;
    constructor = type;
    type = nodeSet;
    nodeSet = "";
  }
  if (opts) {
    if (opts.credentials) {
      credentials.register(type, opts.credentials);
    }
    if (opts.settings) {
      try {
        settings.registerNodeSettings(type, opts.settings);
      } catch (err) {
        logger.warn(`[${type}] ${err.message}`);
      }
    }
  }
  if (!(constructor.prototype instanceof Node)) {
    if (Object.getPrototypeOf(constructor.prototype) === Object.prototype) {
      util.inherits(constructor, Node);
    } else {
      let proto = constructor.prototype;
      while (Object.getPrototypeOf(proto) !== Object.prototype) {
        proto = Object.getPrototypeOf(proto);
      }
      // TODO: This is a partial implementation of util.inherits >= node v5.0.0
      //      which should be changed when support for node < v5.0.0 is dropped
      //      see: https://github.com/nodejs/node/pull/3455
      proto.constructor.super_ = Node;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(proto, Node.prototype);
      } else {
        // hack for node v0.10
        proto.__proto__ = Node.prototype;
      }
    }
  }

  registry.registerType(nodeSet, type, constructor, opts);
}

/**
 * Called from a Node's constructor function, invokes the super-class
 * constructor and attaches any credentials to the node.
 * @param node the node object being created
 * @param def the instance definition for the node
 */
function createNode(node, def) {
  Node.call(node, def);
  let { id } = node;
  if (def._alias) {
    id = def._alias;
  }
  let creds = credentials.get(id);
  if (creds) {
    creds = clone(creds);
    // console.log("Attaching credentials to ",node.id);
    // allow $(foo) syntax to substitute env variables for credentials also...
    for (const p in creds) {
      if (creds.hasOwnProperty(p)) {
        flowUtil.mapEnvVarProperties(creds, p, node._flow);
      }
    }
    node.credentials = creds;
  } else if (credentials.getDefinition(node.type)) {
    node.credentials = {};
  }
}

function registerSubflow(nodeSet, subflow) {
  // TODO: extract credentials definition from subflow properties
  const registeredType = registry.registerSubflow(nodeSet, subflow);

  if (subflow.env) {
    const creds = {};
    let hasCreds = false;
    subflow.env.forEach((e) => {
      if (e.type === "cred") {
        creds[e.name] = { type: "password" };
        hasCreds = true;
      }
    });
    if (hasCreds) {
      credentials.register(registeredType.type, creds);
    }
  }
}

function init(runtime) {
  logger.debug("Nodes initializing...", {
    rid: `tenant/${runtime.tenant}`,
  });
  settings = runtime.settings;
  credentials.init(runtime);
  flows.init(runtime);
  registry.init(runtime);
  context.init(runtime.settings);
}

function disableNode(id) {
  flows.checkTypeInUse(id);
  return registry.disableNode(id).then((info) => {
    reportNodeStateChange(info, false);
    return info;
  });
}

function enableNode(id) {
  return registry.enableNode(id).then((info) => {
    reportNodeStateChange(info, true);
    return info;
  });
}

function reportNodeStateChange(info, enabled) {
  if (info.enabled === enabled && !info.err) {
    events.emit("runtime-event", {
      id: `node/${enabled ? "enabled" : "disabled"}`,
      retain: false,
      payload: info,
    });
    logger.info(` ${logger._(`api.nodes.${enabled ? "enabled" : "disabled"}`)}`);
    for (let i = 0; i < info.types.length; i++) {
      logger.info(` - ${info.types[i]}`);
    }
  } else if (enabled && info.err) {
    logger.warn(logger._("api.nodes.error-enable"));
    logger.warn(` - ${info.name} : ${info.err}`);
  }
}

function installModule(module, version, url) {
  return registry.installModule(module, version, url).then((info) => {
    if (info.pending_version) {
      events.emit("runtime-event", {
        id: "node/upgraded",
        retain: false,
        payload: { module: info.name, version: info.pending_version },
      });
    } else {
      events.emit("runtime-event", { id: "node/added", retain: false, payload: info.nodes });
    }
    return info;
  });
}

function uninstallModule(module) {
  const info = registry.getModuleInfo(module);
  if (!info || !info.user) {
    throw new Error(logger._("nodes.index.unrecognised-module", { module }));
  } else {
    const nodeTypesToCheck = info.nodes.map((n) => `${module}/${n.name}`);
    for (let i = 0; i < nodeTypesToCheck.length; i++) {
      flows.checkTypeInUse(nodeTypesToCheck[i]);
    }
    return registry.uninstallModule(module).then((list) => {
      events.emit("runtime-event", { id: "node/removed", retain: false, payload: list });
      return list;
    });
  }
}

module.exports = {
  // Lifecycle
  init,
  load: registry.load,

  // Node registry
  createNode,
  getNode: flows.get,
  eachNode: flows.eachNode,
  getContext: context.get,

  installerEnabled: registry.installerEnabled,
  installModule,
  uninstallModule,

  enableNode,
  disableNode,

  // Node type registry
  registerType,
  registerSubflow,
  getType: registry.get,

  getNodeInfo: registry.getNodeInfo,
  getNodeList: registry.getNodeList,

  getModuleInfo: registry.getModuleInfo,

  getNodeConfigs: registry.getNodeConfigs,
  getNodeConfig: registry.getNodeConfig,
  getNodeIconPath: registry.getNodeIconPath,
  getNodeIcons: registry.getNodeIcons,
  getNodeExampleFlows: registry.getNodeExampleFlows,
  getNodeExampleFlowPath: registry.getNodeExampleFlowPath,
  getModuleResource: registry.getModuleResource,

  clearRegistry: registry.clear,
  cleanModuleList: registry.cleanModuleList,

  // Flow handling
  flows,
  loadFlows: flows.load,
  startFlows: flows.startFlows,
  stopFlows: flows.stopFlows,
  setFlows: flows.setFlows,
  getFlows: flows.getFlows,

  addFlow: flows.addFlow,
  getFlow: flows.getFlow,
  updateFlow: flows.updateFlow,
  removeFlow: flows.removeFlow,
  // disableFlow: flows.disableFlow,
  // enableFlow:  flows.enableFlow,

  // Credentials
  addCredentials: credentials.add,
  getCredentials: credentials.get,
  deleteCredentials: credentials.delete,
  getCredentialDefinition: credentials.getDefinition,
  setCredentialSecret: credentials.setKey,
  clearCredentials: credentials.clear,
  exportCredentials: credentials.export,
  getCredentialKeyType: credentials.getKeyType,

  // Contexts
  loadContextsPlugin: context.load,
  closeContextsPlugin: context.close,
  listContextStores: context.listStores,
};
