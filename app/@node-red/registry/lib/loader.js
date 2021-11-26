/* === This is a file from Node-Red being used as-is. === */
/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * */

const fs = require("fs-extra");
const path = require("path");
const semver = require("semver");

const { i18n } = require("@node-red/util");
const { log } = require("@node-red/util");
const localfilesystem = require("./localfilesystem");
const registry = require("./registry");
const registryUtil = require("./util");

let settings;

function init(_runtime) {
  settings = _runtime.settings;
  localfilesystem.init(settings);
  registryUtil.init(_runtime);
}

function load(disableNodePathScan) {
  // To skip node scan, the following line will use the stored node list.
  // We should expose that as an option at some point, although the
  // performance gains are minimal.
  // return loadModuleFiles(registry.getModuleList());
  log.info(log._("server.loading"));

  const modules = localfilesystem.getNodeFiles(disableNodePathScan);
  return loadModuleFiles(modules);
}

function loadModuleTypeFiles(module, type) {
  const things = module[type];
  let first = true;
  const promises = [];
  for (var thingName in things) {
    /* istanbul ignore else */
    if (things.hasOwnProperty(thingName)) {
      if (module.name != "node-red" && first) {
        // Check the module directory exists
        first = false;
        const fn = things[thingName].file;
        const parts = fn.split("/");
        let i = parts.length - 1;
        for (; i >= 0; i--) {
          if (parts[i] == "node_modules") {
            break;
          }
        }
        const moduleFn = parts.slice(0, i + 2).join("/");

        try {
          const stat = fs.statSync(moduleFn);
        } catch (err) {
          // Module not found, don't attempt to load its nodes
          break;
        }
      }

      try {
        var promise;
        if (type === "nodes") {
          promise = loadNodeConfig(things[thingName]);
        } else if (type === "plugins") {
          promise = loadPluginConfig(things[thingName]);
        }
        promises.push(
          promise
            .then(
              (function () {
                const m = module.name;
                const n = thingName;
                return function (nodeSet) {
                  things[n] = nodeSet;
                  return nodeSet;
                };
              })(),
            )
            .catch((err) => {
              console.log(err);
            }),
        );
      } catch (err) {
        console.log(err);
        //
      }
    }
  }
  return promises;
}

function loadModuleFiles(modules) {
  let pluginPromises = [];
  let nodePromises = [];
  for (const module in modules) {
    /* istanbul ignore else */
    if (modules.hasOwnProperty(module)) {
      if (
        modules[module].redVersion &&
        !semver.satisfies(
          (settings.version || "0.0.0").replace(
            /(\-[1-9A-Za-z-][0-9A-Za-z-\.]*)?(\+[0-9A-Za-z-\.]+)?$/,
            "",
          ),
          modules[module].redVersion,
        )
      ) {
        // TODO: log it
        log.warn(
          `[${module}] ${log._("server.node-version-mismatch", {
            version: modules[module].redVersion,
          })}`,
        );
        modules[module].err = "version_mismatch";
        continue;
      }
      if (module == "node-red" || !registry.getModuleInfo(module)) {
        if (modules[module].nodes) {
          nodePromises = nodePromises.concat(loadModuleTypeFiles(modules[module], "nodes"));
        }
        if (modules[module].plugins) {
          pluginPromises = pluginPromises.concat(loadModuleTypeFiles(modules[module], "plugins"));
        }
      }
    }
  }
  let pluginList;
  let nodeList;

  return Promise.all(pluginPromises)
    .then((results) => {
      pluginList = results.filter((r) => !!r);
      // Initial plugin load has happened. Ensure modules that provide
      // plugins are in the registry now.
      for (const module in modules) {
        if (modules.hasOwnProperty(module)) {
          if (modules[module].plugins && Object.keys(modules[module].plugins).length > 0) {
            // Add the modules for plugins
            if (!modules[module].err) {
              registry.addModule(modules[module]);
            }
          }
        }
      }
      return loadNodeSetList(pluginList);
    })
    .then(() => Promise.all(nodePromises))
    .then((results) => {
      nodeList = results.filter((r) => !!r);
      // Initial node load has happened. Ensure remaining modules are in the registry
      for (const module in modules) {
        if (modules.hasOwnProperty(module)) {
          if (!modules[module].plugins || Object.keys(modules[module].plugins).length === 0) {
            if (!modules[module].err) {
              registry.addModule(modules[module]);
            }
          }
        }
      }
      return loadNodeSetList(nodeList);
    });
}

async function loadPluginTemplate(plugin) {
  return fs
    .readFile(plugin.template, "utf8")
    .then((content) => {
      plugin.config = content;
      return plugin;
    })
    .catch((err) => {
      if (err.code === "ENOENT") {
        plugin.err = `Error: ${plugin.template} does not exist`;
      } else {
        plugin.err = err.toString();
      }
      return plugin;
    });
}

async function loadNodeTemplate(node) {
  return fs
    .readFile(node.template, "utf8")
    .then((content) => {
      const types = [];

      let regExp = /<script (?:[^>]*)data-template-name\s*=\s*['"]([^'"]*)['"]/gi;
      let match = null;

      while ((match = regExp.exec(content)) !== null) {
        types.push(match[1]);
      }
      node.types = types;

      const langRegExp = /^<script[^>]* data-lang\s*=\s*['"](.+?)['"]/i;
      regExp = /(<script[^>]* data-help-name=[\s\S]*?<\/script>)/gi;
      match = null;
      let mainContent = "";
      const helpContent = {};
      let index = 0;
      while ((match = regExp.exec(content)) !== null) {
        mainContent += content.substring(index, regExp.lastIndex - match[1].length);
        index = regExp.lastIndex;
        const help = content.substring(regExp.lastIndex - match[1].length, regExp.lastIndex);

        let lang = i18n.defaultLang;
        if ((match = langRegExp.exec(help)) !== null) {
          lang = match[1];
        }
        if (!helpContent.hasOwnProperty(lang)) {
          helpContent[lang] = "";
        }

        helpContent[lang] += help;
      }
      mainContent += content.substring(index);

      node.config = mainContent;
      node.help = helpContent;
      // TODO: parse out the javascript portion of the template
      // node.script = "";
      /*
        only is allowed one typeId for node
      */
      /*
      for (let i = 0; i < node.types.length; i++) {
        if (registry.getTypeId(node.types[i])) {
          node.err = `${node.types[i]} already registered`;
          break;
        }
      }
      */
      return node;
    })
    .catch((err) => {
      // ENOENT means no html file. We can live with that. But any other error
      // should be fatal
      // node.err = "Error: "+node.template+" does not exist";
      node.types = node.types || [];
      if (err.code !== "ENOENT") {
        node.err = err.toString();
      }
      return node;
    });
}

async function loadNodeLocales(node) {
  if (node.module === "node-red") {
    // do not look up locales directory for core nodes
    node.namespace = node.module;
    return node;
  }
  const baseFile = node.file || node.template;
  return fs
    .stat(path.join(path.dirname(baseFile), "locales"))
    .then((stat) => {
      node.namespace = node.id;
      return i18n
        .registerMessageCatalog(
          node.id,
          path.join(path.dirname(baseFile), "locales"),
          path.basename(baseFile).replace(/\.[^.]+$/, ".json"),
        )
        .then(() => node);
    })
    .catch((err) => {
      node.namespace = node.module;
      return node;
    });
}

async function loadNodeConfig(fileInfo) {
  const { file } = fileInfo;
  const { module } = fileInfo;
  const { name } = fileInfo;
  const { version } = fileInfo;

  const id = `${module}/${name}`;
  const info = registry.getNodeInfo(id);
  let isEnabled = true;
  if (info) {
    if (info.hasOwnProperty("loaded")) {
      throw new Error(`${file} already loaded`);
    }
    isEnabled = !(info.enabled === false);
  }

  const node = {
    type: "node",
    id,
    module,
    name,
    file,
    template: file.replace(/\.js$/, ".html"),
    enabled: isEnabled,
    loaded: false,
    version,
    local: fileInfo.local,
    types: [],
    config: "",
    help: {},
  };
  if (fileInfo.hasOwnProperty("types")) {
    node.types = fileInfo.types;
  }
  await loadNodeLocales(node);
  if (!settings.disableEditor) {
    return loadNodeTemplate(node);
  }
  return node;
}

async function loadPluginConfig(fileInfo) {
  const { file } = fileInfo;
  const { module } = fileInfo;
  const { name } = fileInfo;
  const { version } = fileInfo;

  const id = `${module}/${name}`;
  const isEnabled = true;

  // TODO: registry.getPluginInfo

  // var info = registry.getPluginInfo(id);
  // if (info) {
  //     if (info.hasOwnProperty("loaded")) {
  //         throw new Error(file+" already loaded");
  //     }
  //     isEnabled = info.enabled;
  // }

  if (!fs.existsSync(jsFile)) {
  }

  const plugin = {
    type: "plugin",
    id,
    module,
    name,
    enabled: isEnabled,
    loaded: false,
    version,
    local: fileInfo.local,
    plugins: [],
    config: "",
    help: {},
  };
  var jsFile = file.replace(/\.[^.]+$/, ".js");
  const htmlFile = file.replace(/\.[^.]+$/, ".html");
  if (fs.existsSync(jsFile)) {
    plugin.file = jsFile;
  }
  if (fs.existsSync(htmlFile)) {
    plugin.template = htmlFile;
  }
  await loadNodeLocales(plugin);

  if (plugin.template && !settings.disableEditor) {
    return loadPluginTemplate(plugin);
  }
  return plugin;
}

/**
 * Loads the specified node into the runtime
 * @param node a node info object - see loadNodeConfig
 * @return a promise that resolves to an update node info object. The object
 *         has the following properties added:
 *            err: any error encountered whilst loading the node
 *
 */
function loadNodeSet(node) {
  if (!node.enabled) {
    console.log("BAIL ON", node.id);
    return Promise.resolve(node);
  }

  try {
    let loadPromise = null;
    const r = require(node.file);

    if (typeof r === "function") {
      const red = registryUtil.createNodeApi(node);
      if (!red.alreadyStored) {
        const promise = r(red);
        if (promise != null && typeof promise.then === "function") {
          loadPromise = promise
            .then(() => {
              node.enabled = true;
              node.loaded = true;
              return node;
            })
            .catch((err) => {
              node.err = err;
              return node;
            });
        }
      }
    }
    if (loadPromise == null) {
      node.enabled = true;
      node.loaded = true;
      loadPromise = Promise.resolve(node);
    }
    return loadPromise;
  } catch (err) {
    node.err = err;
    const { stack } = err;
    let message;
    if (stack) {
      let filePath = node.file;
      try {
        filePath = fs.realpathSync(filePath);
      } catch (e) {
        // ignore canonicalization error
      }
      const i = stack.indexOf(filePath);
      if (i > -1) {
        const excerpt = stack.substring(i + filePath.length + 1, i + filePath.length + 20);
        const m = /^(\d+)/.exec(excerpt);
        if (m) {
          node.err = `${err} (line:${m[1]})`;
        }
      }
    }
    return Promise.resolve(node);
  }
}

async function loadPlugin(plugin) {
  if (!plugin.file) {
    // No runtime component - nothing to load
    return plugin;
  }
  try {
    const r = require(plugin.file);
    if (typeof r === "function") {
      const red = registryUtil.createNodeApi(plugin);
      const promise = r(red);
      if (promise != null && typeof promise.then === "function") {
        return promise
          .then(() => {
            plugin.enabled = true;
            plugin.loaded = true;
            return plugin;
          })
          .catch((err) => {
            plugin.err = err;
            return plugin;
          });
      }
    }
    plugin.enabled = true;
    plugin.loaded = true;
    return plugin;
  } catch (err) {
    console.log(err);
    plugin.err = err;
    const { stack } = err;
    let message;
    if (stack) {
      const i = stack.indexOf(plugin.file);
      if (i > -1) {
        const excerpt = stack.substring(i + node.file.length + 1, i + plugin.file.length + 20);
        const m = /^(\d+):(\d+)/.exec(excerpt);
        if (m) {
          plugin.err = `${err} (line:${m[1]})`;
        }
      }
    }
    return plugin;
  }
}

function loadNodeSetList(nodes) {
  const promises = [];
  nodes.forEach((node) => {
    if (!node.err) {
      if (node.type === "plugin") {
        promises.push(loadPlugin(node).catch((err) => {}));
      } else {
        promises.push(loadNodeSet(node).catch((err) => {}));
      }
    } else {
      promises.push(node);
    }
  });

  return Promise.all(promises).then(() => {
    if (settings.available()) {
      return registry.saveNodeList();
    }
  });
}

function addModule(module) {
  if (!settings.available()) {
    throw new Error("Settings unavailable");
  }
  const nodes = [];
  const existingInfo = registry.getModuleInfo(module);
  if (existingInfo) {
    // TODO: nls
    const e = new Error("module_already_loaded");
    e.code = "module_already_loaded";
    return Promise.reject(e);
  }
  try {
    const moduleFiles = {};
    const moduleStack = [module];
    while (moduleStack.length > 0) {
      const moduleToLoad = moduleStack.shift();
      const files = localfilesystem.getModuleFiles(moduleToLoad);
      if (files[moduleToLoad]) {
        moduleFiles[moduleToLoad] = files[moduleToLoad];
        if (moduleFiles[moduleToLoad].dependencies) {
          log.debug(`Loading dependencies for ${module}`);
          for (let i = 0; i < moduleFiles[moduleToLoad].dependencies.length; i++) {
            const dep = moduleFiles[moduleToLoad].dependencies[i];
            if (!registry.getModuleInfo(dep)) {
              log.debug(` - load ${dep}`);
              moduleStack.push(dep);
            } else {
              log.debug(` - already loaded ${dep}`);
              registry.addModuleDependency(dep, moduleToLoad);
            }
          }
        }
      }
    }
    return loadModuleFiles(moduleFiles).then(() => module);
  } catch (err) {
    return Promise.reject(err);
  }
}

function loadNodeHelp(node, lang) {
  const base = path.basename(node.template);
  let localePath;
  if (node.module === "node-red") {
    const cat_dir = path.dirname(node.template);
    const cat = path.basename(cat_dir);
    var dir = path.dirname(cat_dir);
    localePath = path.join(dir, "..", "locales", lang, cat, base);
  } else {
    var dir = path.dirname(node.template);
    localePath = path.join(dir, "locales", lang, base);
  }
  try {
    // TODO: make this async
    const content = fs.readFileSync(localePath, "utf8");
    return content;
  } catch (err) {
    return null;
  }
}

function getNodeHelp(node, lang) {
  if (!node.help[lang]) {
    let help = loadNodeHelp(node, lang);
    if (help == null) {
      const langParts = lang.split("-");
      if (langParts.length == 2) {
        help = loadNodeHelp(node, langParts[0]);
      }
    }
    if (help) {
      node.help[lang] = help;
    } else if (lang === i18n.defaultLang) {
      return null;
    } else {
      node.help[lang] = getNodeHelp(node, i18n.defaultLang);
    }
  }
  return node.help[lang];
}

module.exports = {
  init,
  load,
  addModule,
  loadNodeSet,
  getNodeHelp,
};
