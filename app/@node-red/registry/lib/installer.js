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

const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const tar = require("tar");

const { exec, log, events, hooks } = require("@node-red/util");
const child_process = require("child_process");
const registry = require("./registry");
const registryUtil = require("./util");
const library = require("./library");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
let installerEnabled = false;

let settings;
const moduleRe = /^(@[^/@]+?[/])?[^/@]+?$/;
const slashRe = process.platform === "win32" ? /\\|[/]/ : /[/]/;
const pkgurlRe = /^(https?|git(|\+https?|\+ssh|\+file)):\/\//;
const localtgzRe = /^([a-zA-Z]:|\/).+tgz$/;

// Default allow/deny lists
let installAllowList = ["*"];
let installDenyList = [];
let installAllAllowed = true;
let installVersionRestricted = false;

function init(_settings) {
  settings = _settings;
  // TODO: This is duplicated in localfilesystem.js
  //       Should it *all* be managed by util?
  if (settings.externalModules && settings.externalModules.palette) {
    if (settings.externalModules.palette.allowList || settings.externalModules.palette.denyList) {
      installAllowList = settings.externalModules.palette.allowList;
      installDenyList = settings.externalModules.palette.denyList;
    }
  }
  installAllowList = registryUtil.parseModuleList(installAllowList);
  installDenyList = registryUtil.parseModuleList(installDenyList);
  installAllAllowed = installDenyList.length === 0;
  if (!installAllAllowed) {
    installAllowList.forEach((rule) => {
      installVersionRestricted = installVersionRestricted || !!rule.version;
    });
    if (!installVersionRestricted) {
      installDenyList.forEach((rule) => {
        installVersionRestricted = installVersionRestricted || !!rule.version;
      });
    }
  }
}

let activePromise = Promise.resolve();

function checkModulePath(folder) {
  let moduleName;
  let moduleVersion;
  let err;
  const fullPath = path.resolve(folder);
  const packageFile = path.join(fullPath, "package.json");
  try {
    const pkg = require(packageFile);
    moduleName = pkg.name;
    moduleVersion = pkg.version;
    if (!pkg["node-red"]) {
      // TODO: nls
      err = new Error("Invalid Node-RED module");
      err.code = "invalid_module";
      throw err;
    }
  } catch (err2) {
    err = new Error("Module not found");
    err.code = 404;
    throw err;
  }
  return {
    name: moduleName,
    version: moduleVersion,
  };
}
async function installModule(module, version, url) {
  if (Buffer.isBuffer(module)) {
    return installTarball(module);
  }
  module = module || "";
  activePromise = activePromise
    .then(async () => {
      // TODO: ensure module is 'safe'
      let installName = module;
      let isRegistryPackage = true;
      let isUpgrade = false;
      let isExisting = false;
      if (url) {
        if (pkgurlRe.test(url) || localtgzRe.test(url)) {
          // Git remote url or Tarball url - check the valid package url
          installName = url;
          isRegistryPackage = false;
        } else {
          log.warn(log._("server.install.install-failed-url", { name: module, url }));
          const e = new Error("Invalid url");
          e.code = "invalid_module_url";
          throw e;
        }
      } else if (moduleRe.test(module)) {
        // Simple module name - assume it can be npm installed
        if (version) {
          installName += `@${version}`;
        }
      } else if (slashRe.test(module)) {
        // A path - check if there's a valid package.json
        installName = module;
        const info = checkModulePath(module);
        module = info.name;
        isRegistryPackage = false;
      } else {
        log.warn(log._("server.install.install-failed-name", { name: module }));
        const e = new Error("Invalid module name");
        e.code = "invalid_module_name";
        throw e;
      }
      if (!installAllAllowed) {
        let installVersion = version;
        if (installVersionRestricted && isRegistryPackage) {
          installVersion = await getModuleVersionFromNPM(module, version);
        }

        if (
          !registryUtil.checkModuleAllowed(
            module,
            installVersion,
            installAllowList,
            installDenyList,
          )
        ) {
          const e = new Error("Install not allowed");
          e.code = "install_not_allowed";
          throw e;
        }
      }

      const info = registry.getModuleInfo(module);
      if (info) {
        if (!info.user) {
          log.debug(`Installing existing module: ${module}`);
          isExisting = true;
        } else if (!version || info.version === version) {
          const err = new Error("Module already loaded");
          err.code = "module_already_loaded";
          throw err;
        }
        isUpgrade = true;
      } else {
        isUpgrade = false;
      }

      if (!isUpgrade) {
        log.info(
          log._("server.install.installing", { name: module, version: version || "latest" }),
        );
      } else {
        log.info(log._("server.install.upgrading", { name: module, version: version || "latest" }));
      }

      const installDir = settings.userDir || process.env.NODE_RED_HOME || ".";
      const triggerPayload = {
        module,
        version,
        url,
        dir: installDir,
        isExisting,
        isUpgrade,
        args: [
          "--no-audit",
          "--no-update-notifier",
          "--no-fund",
          "--save",
          "--save-prefix=~",
          "--production",
          "--engine-strict",
        ],
      };

      return hooks
        .trigger("preInstall", triggerPayload)
        .then((result) => {
          // preInstall passed
          // - run install
          if (result !== false) {
            const extraArgs = triggerPayload.args || [];
            const args = ["install", ...extraArgs, installName];
            log.trace(npmCommand + JSON.stringify(args));
            return exec.run(npmCommand, args, { cwd: installDir }, true);
          }
          log.trace("skipping npm install");
        })
        .then(() => hooks.trigger("postInstall", triggerPayload))
        .then(() => {
          if (isExisting) {
            // This is a module we already have installed as a non-user module.
            // That means it was discovered when loading, but was not listed
            // in package.json and has been hidden from the editor.
            // The user has requested to install this module. Having run
            // the npm install above, it will now be listed in package.json.
            // Update the registry to mark it as a user module so it will
            // be available to the editor.
            log.info(log._("server.install.installed", { name: module }));
            return require("./registry").setUserInstalled(module, true).then(reportAddedModules);
          }
          if (!isUpgrade) {
            log.info(log._("server.install.installed", { name: module }));
            return require("./index").addModule(module).then(reportAddedModules);
          }
          log.info(log._("server.install.upgraded", { name: module, version }));
          events.emit("runtime-event", {
            id: "restart-required",
            payload: { type: "warning", text: "notification.warnings.restartRequired" },
            retain: true,
          });
          return require("./registry").setModulePendingUpdated(module, version);
        })
        .catch((err) => {
          let e;
          if (err.hook) {
            // preInstall failed
            log.warn(log._("server.install.install-failed-long", { name: module }));
            log.warn("------------------------------------------");
            log.warn(err.toString());
            log.warn("------------------------------------------");
            e = new Error(`${log._("server.install.install-failed")}: ${err.toString()}`);
            if (err.hook === "postInstall") {
              return exec
                .run(npmCommand, ["remove", module], { cwd: installDir }, false)
                .finally(() => {
                  throw e;
                });
            }
          } else {
            // npm install failed
            const output = err.stderr;
            const lookFor404 = new RegExp(` 404 .*${module}`, "m");
            const lookForVersionNotFound = new RegExp(
              `version not found: ${module}@${version}`,
              "m",
            );
            if (lookFor404.test(output)) {
              log.warn(log._("server.install.install-failed-not-found", { name: module }));
              e = new Error("Module not found");
              e.code = 404;
            } else if (isUpgrade && lookForVersionNotFound.test(output)) {
              log.warn(log._("server.install.upgrade-failed-not-found", { name: module }));
              e = new Error("Module not found");
              e.code = 404;
            } else {
              log.warn(log._("server.install.install-failed-long", { name: module }));
              log.warn("------------------------------------------");
              log.warn(output);
              log.warn("------------------------------------------");
              e = new Error(log._("server.install.install-failed"));
            }
          }
          if (e) {
            throw e;
          }
        });
    })
    .catch((err) => {
      // In case of error, reset activePromise to be resolvable
      activePromise = Promise.resolve();
      throw err;
    });
  return activePromise;
}

function reportAddedModules(info) {
  if (info.nodes.length > 0) {
    log.info(log._("server.added-types"));
    for (let i = 0; i < info.nodes.length; i++) {
      for (let j = 0; j < info.nodes[i].types.length; j++) {
        log.info(
          ` - ${info.nodes[i].module ? `${info.nodes[i].module}:` : ""}${info.nodes[i].types[j]}${
            info.nodes[i].err ? ` : ${info.nodes[i].err}` : ""
          }`,
        );
      }
    }
  }
  return info;
}

function reportRemovedModules(removedNodes) {
  // comms.publish("node/removed",removedNodes,false);
  log.info(log._("server.removed-types"));
  for (let j = 0; j < removedNodes.length; j++) {
    for (let i = 0; i < removedNodes[j].types.length; i++) {
      log.info(
        ` - ${removedNodes[j].module ? `${removedNodes[j].module}:` : ""}${
          removedNodes[j].types[i]
        }`,
      );
    }
  }
  return removedNodes;
}

async function getExistingPackageVersion(moduleName) {
  try {
    const packageFilename = path.join(
      settings.userDir || process.env.NODE_RED_HOME || ".",
      "package.json",
    );
    const pkg = await fs.readJson(packageFilename);
    if (pkg.dependencies) {
      return pkg.dependencies[moduleName];
    }
  } catch (err) {}
  return null;
}

async function getModuleVersionFromNPM(module, version) {
  let installName = module;
  if (version) {
    installName += `@${version}`;
  }

  return new Promise((resolve, reject) => {
    child_process.execFile(npmCommand, ["info", "--json", installName], (err, stdout, stderr) => {
      try {
        if (!stdout) {
          log.warn(log._("server.install.install-failed-not-found", { name: module }));
          e = new Error("Version not found");
          e.code = 404;
          reject(e);
          return;
        }
        const response = JSON.parse(stdout);
        if (response.error) {
          if (response.error.code === "E404") {
            log.warn(log._("server.install.install-failed-not-found", { name: module }));
            e = new Error("Module not found");
            e.code = 404;
            reject(e);
          } else {
            log.warn(log._("server.install.install-failed-long", { name: module }));
            log.warn("------------------------------------------");
            log.warn(response.error.summary);
            log.warn("------------------------------------------");
            reject(new Error(log._("server.install.install-failed")));
          }
          return;
        }
        resolve(response.version);
      } catch (err) {
        log.warn(log._("server.install.install-failed-long", { name: module }));
        log.warn("------------------------------------------");
        if (stdout) {
          log.warn(stdout);
        }
        if (stderr) {
          log.warn(stderr);
        }
        log.warn(err);
        log.warn("------------------------------------------");
        reject(new Error(log._("server.install.install-failed")));
      }
    });
  });
}

async function installTarball(tarball) {
  if (
    settings.externalModules &&
    settings.externalModules.palette &&
    settings.externalModules.palette.allowUpload === false
  ) {
    throw new Error("Module upload disabled");
  }

  // Check this tarball contains a valid node-red module.
  // Get its module name/version
  const moduleInfo = await getTarballModuleInfo(tarball);

  // Write the tarball to <userDir>/nodes/<filename.tgz>
  // where the filename is the normalised form based on module name/version
  const normalisedModuleName =
    moduleInfo.name[0] === "@" ? moduleInfo.name.substr(1).replace(/\//g, "-") : moduleInfo.name;
  const tarballFile = `${normalisedModuleName}-${moduleInfo.version}.tgz`;
  const tarballPath = path.resolve(
    path.join(settings.userDir || process.env.NODE_RED_HOME || ".", "nodes", tarballFile),
  );

  // (from fs-extra - move to writeFile with promise once Node 8 dropped)
  await fs.outputFile(tarballPath, tarball);

  // Next, need to check to see if this module is listed in `<userDir>/package.json`
  const existingVersion = await getExistingPackageVersion(moduleInfo.name);
  let existingFile = null;
  let isUpdate = false;

  // If this is a known module, need to check if there will be an old tarball
  // to remove after the install of this one
  if (existingVersion) {
    // - Known module
    if (/^file:nodes\//.test(existingVersion)) {
      existingFile = existingVersion.substring(11);
      isUpdate = true;
      if (tarballFile === existingFile) {
        // Edge case: a tar with the same name has bee uploaded.
        // Carry on with the install, but don't remove the 'old' file
        // as it will have been overwritten by the new one
        existingFile = null;
      }
    }
  }

  // Install the tgz
  return installModule(moduleInfo.name, moduleInfo.version, tarballPath).then((info) => {
    if (existingFile) {
      // Remove the old file
      return fs
        .remove(
          path.resolve(
            path.join(settings.userDir || process.env.NODE_RED_HOME || ".", "nodes", existingFile),
          ),
        )
        .then(() => info)
        .catch(() => info);
    }
    return info;
  });
}

async function getTarballModuleInfo(tarball) {
  const tarballDir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-tarball-"));
  const removeExtractedTar = function (done) {
    fs.remove(tarballDir, (err) => {
      done();
    });
  };
  return new Promise((resolve, reject) => {
    const writeStream = tar
      .x({
        cwd: tarballDir,
      })
      .on("error", (err) => {
        reject(err);
      })
      .on("finish", () => {
        try {
          const moduleInfo = checkModulePath(path.join(tarballDir, "package"));
          removeExtractedTar((err) => {
            resolve(moduleInfo);
          });
        } catch (err) {
          removeExtractedTar(() => {
            reject(err);
          });
        }
      });
    writeStream.end(tarball);
  });
}

function uninstallModule(module) {
  activePromise = activePromise
    .then(
      () =>
        new Promise((resolve, reject) => {
          if (/[\s;]/.test(module)) {
            reject(new Error(log._("server.install.invalid")));
            return;
          }
          const installDir = settings.userDir || process.env.NODE_RED_HOME || ".";
          const moduleDir = path.join(installDir, "node_modules", module);

          try {
            fs.statSync(moduleDir);
          } catch (err) {
            return reject(new Error(log._("server.install.uninstall-failed", { name: module })));
          }

          const list = registry.removeModule(module);
          log.info(log._("server.install.uninstalling", { name: module }));

          const triggerPayload = {
            module,
            dir: installDir,
            args: ["--no-audit", "--no-update-notifier", "--no-fund", "--save"],
          };
          return hooks
            .trigger("preUninstall", triggerPayload)
            .then((result) => {
              // preUninstall passed
              // - run uninstall
              if (result !== false) {
                const extraArgs = triggerPayload.args || [];
                const args = ["remove", ...extraArgs, module];
                log.trace(npmCommand + JSON.stringify(args));
                return exec.run(npmCommand, args, { cwd: installDir }, true);
              }
              log.trace("skipping npm uninstall");
            })
            .then(() => {
              log.info(log._("server.install.uninstalled", { name: module }));
              reportRemovedModules(list);
              library.removeExamplesDir(module);
              return hooks
                .trigger("postUninstall", triggerPayload)
                .catch((err) => {
                  log.warn("------------------------------------------");
                  log.warn(err.toString());
                  log.warn("------------------------------------------");
                })
                .finally(() => {
                  resolve(list);
                });
            })
            .catch((result) => {
              const output = result.stderr || result;
              log.warn(log._("server.install.uninstall-failed-long", { name: module }));
              log.warn("------------------------------------------");
              log.warn(output.toString());
              log.warn("------------------------------------------");
              reject(new Error(log._("server.install.uninstall-failed", { name: module })));
            });
        }),
    )
    .catch((err) => {
      // In case of error, reset activePromise to be resolvable
      activePromise = Promise.resolve();
      throw err;
    });
  return activePromise;
}

async function checkPrereq() {
  if (settings.editorTheme && settings.editorTheme.palette) {
    if (settings.editorTheme.palette.hasOwnProperty("editable")) {
      log.warn(
        log._("server.deprecatedOption", {
          old: "editorTheme.palette.editable",
          new: "externalModules.palette.allowInstall",
        }),
      );
    }
    if (settings.editorTheme.palette.hasOwnProperty("upload")) {
      log.warn(
        log._("server.deprecatedOption", {
          old: "editorTheme.palette.upload",
          new: "externalModules.palette.allowUpload",
        }),
      );
    }
  }

  try {
    if (settings.editorTheme.palette.editable === false) {
      log.info(log._("server.palette-editor.disabled"));
      installerEnabled = false;
      return;
    }
  } catch (err) {}

  try {
    if (settings.externalModules.palette.allowInstall === false) {
      log.info(log._("server.palette-editor.disabled"));
      installerEnabled = false;
      return;
    }
  } catch (err) {}

  if (
    settings.hasOwnProperty("editorTheme") &&
    settings.editorTheme.hasOwnProperty("palette") &&
    settings.editorTheme.palette.hasOwnProperty("editable") &&
    settings.editorTheme.palette.editable === false
  ) {
    log.info(log._("server.palette-editor.disabled"));
    installerEnabled = false;
  } else {
    return new Promise((resolve) => {
      child_process.execFile(npmCommand, ["-v"], (err, stdout) => {
        if (err) {
          log.info(log._("server.palette-editor.npm-not-found"));
          installerEnabled = false;
        } else if (parseInt(stdout.split(".")[0]) < 3) {
          log.info(log._("server.palette-editor.npm-too-old"));
          installerEnabled = false;
        } else {
          installerEnabled = true;
        }
        resolve();
      });
    });
  }
}

module.exports = {
  init,
  checkPrereq,
  installModule,
  uninstallModule,
  installerEnabled() {
    return installerEnabled;
  },
};
