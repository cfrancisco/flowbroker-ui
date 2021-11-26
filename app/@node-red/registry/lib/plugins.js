/* === This is a file from Node-Red being used as-is. === */
const { events } = require("@node-red/util");
const clone = require("clone");
const registry = require("./registry");

let pluginConfigCache = {};
let pluginToId = {};
let plugins = {};
let pluginsByType = {};
let pluginSettings = {};
let settings;

function init(_settings) {
  settings = _settings;
  plugins = {};
  pluginConfigCache = {};
  pluginToId = {};
  pluginsByType = {};
  pluginSettings = {};
}

function registerPlugin(nodeSetId, id, definition) {
  const moduleId = registry.getModuleFromSetId(nodeSetId);
  const pluginId = registry.getNodeFromSetId(nodeSetId);

  definition.id = id;
  definition.module = moduleId;
  pluginToId[id] = nodeSetId;
  plugins[id] = definition;
  const module = registry.getModule(moduleId);

  definition.path = module.path;

  module.plugins[pluginId].plugins.push(definition);
  if (definition.type) {
    pluginsByType[definition.type] = pluginsByType[definition.type] || [];
    pluginsByType[definition.type].push(definition);
  }
  if (definition.settings) {
    pluginSettings[id] = definition.settings;
  }

  if (definition.onadd && typeof definition.onadd === "function") {
    definition.onadd();
  }
  events.emit("registry:plugin-added", id);
}

function getPlugin(id) {
  return plugins[id];
}

function getPluginsByType(type) {
  return pluginsByType[type] || [];
}

function getPluginConfigs(lang) {
  if (!pluginConfigCache[lang]) {
    let result = "";
    const script = "";
    const moduleConfigs = registry.getModuleList();
    for (const module in moduleConfigs) {
      /* istanbul ignore else */
      if (moduleConfigs.hasOwnProperty(module)) {
        const { plugins } = moduleConfigs[module];
        for (const plugin in plugins) {
          if (plugins.hasOwnProperty(plugin)) {
            const config = plugins[plugin];
            if (config.enabled && !config.err && config.config) {
              result += `\n<!-- --- [red-plugin:${config.id}] --- -->\n`;
              result += config.config;
            }
          }
        }
      }
    }
    pluginConfigCache[lang] = result;
  }
  return pluginConfigCache[lang];
}
function getPluginList() {
  const list = [];
  const moduleConfigs = registry.getModuleList();
  for (const module in moduleConfigs) {
    /* istanbul ignore else */
    if (moduleConfigs.hasOwnProperty(module)) {
      const { plugins } = moduleConfigs[module];
      for (const plugin in plugins) {
        /* istanbul ignore else */
        if (plugins.hasOwnProperty(plugin)) {
          const pluginInfo = registry.filterNodeInfo(plugins[plugin]);
          pluginInfo.version = moduleConfigs[module].version;
          // if (moduleConfigs[module].pending_version) {
          //     nodeInfo.pending_version = moduleConfigs[module].pending_version;
          // }
          list.push(pluginInfo);
        }
      }
    }
  }
  return list;
}

function exportPluginSettings(safeSettings) {
  for (const id in pluginSettings) {
    if (pluginSettings.hasOwnProperty(id)) {
      if (settings.hasOwnProperty(id) && !safeSettings.hasOwnProperty(id)) {
        const pluginTypeSettings = pluginSettings[id];
        let exportedSet = {};
        let defaultExportable = false;
        if (pluginTypeSettings["*"] && pluginTypeSettings["*"].hasOwnProperty("exportable")) {
          defaultExportable = pluginTypeSettings["*"].exportable;
        }
        if (defaultExportable) {
          exportedSet = clone(settings[id]);
        }
        for (const property in pluginTypeSettings) {
          if (pluginTypeSettings.hasOwnProperty(property)) {
            const setting = pluginTypeSettings[property];
            if (defaultExportable) {
              if (setting.exportable === false) {
                delete exportedSet[property];
              } else if (!exportedSet.hasOwnProperty(property) && setting.hasOwnProperty("value")) {
                exportedSet[property] = setting.value;
              }
            } else if (setting.exportable) {
              if (settings[id].hasOwnProperty(property)) {
                exportedSet[property] = settings[id][property];
              } else if (setting.hasOwnProperty("value")) {
                exportedSet[property] = setting.value;
              }
            }
          }
        }
        if (Object.keys(exportedSet).length > 0) {
          safeSettings[id] = exportedSet;
        }
      }
    }
  }

  return safeSettings;
}

module.exports = {
  init,
  registerPlugin,
  getPlugin,
  getPluginsByType,
  getPluginConfigs,
  getPluginList,
  exportPluginSettings,
};
