const { Logger } = require("@dojot/microservice-sdk");

const logger = new Logger("flowbroker-ui:runtime/api");

let runtime;

var api = (module.exports = {
  init(_runtime) {
    logger.info("External Runtime API initialized.", { rid: `tenant/${_runtime.tenant}` });

    runtime = _runtime;
    api.comms.init(runtime);
    api.flows.init(runtime);
    api.nodes.init(runtime);
    api.settings.init(runtime);
    api.library.init(runtime);
    api.projects.init(runtime);
    api.context.init(runtime);
    api.plugins.init(runtime);
  },

  comms: require("./comms"),
  flows: require("./flows"),
  library: require("./library"),
  nodes: require("./nodes"),
  settings: require("./settings"),
  projects: require("./projects"),
  context: require("./context"),
  plugins: require("./plugins"),

  async isStarted(opts) {
    return runtime.isStarted();
  },
  async version(opts) {
    return runtime.version();
  },
});
