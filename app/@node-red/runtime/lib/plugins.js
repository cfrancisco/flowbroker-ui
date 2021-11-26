/* === This is a file from Node-Red being used as-is. === */
const registry = require("@node-red/registry");

module.exports = {
  init() {},
  registerPlugin: registry.registerPlugin,
  getPlugin: registry.getPlugin,
  getPluginsByType: registry.getPluginsByType,
  getPluginList: registry.getPluginList,
  getPluginConfigs: registry.getPluginConfigs,
  exportPluginSettings: registry.exportPluginSettings,
};
