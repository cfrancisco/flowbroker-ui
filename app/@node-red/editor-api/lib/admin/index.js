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

const express = require("express");

const { Logger } = require("@dojot/microservice-sdk");
const nodes = require("./nodes");
const flows = require("./flows");
const flow = require("./flow");
const context = require("./context");
const auth = require("../auth");
const info = require("./settings");
const plugins = require("./plugins");

const apiUtil = require("../util");

const logger = new Logger("flowbroker-ui:editor-api/admin");

module.exports = {
  init(settings, runtimeAPI, editorApp) {
    logger.debug(" Initializing Editor-api/admin...", {
      rid: `tenant/${runtimeAPI.tenant}`,
    });

    flows.init(runtimeAPI);
    flow.init(runtimeAPI);
    nodes.init(runtimeAPI);
    context.init(runtimeAPI);
    info.init(settings, runtimeAPI);
    plugins.init(runtimeAPI);

    const { needsPermission } = auth;

    const adminApp = express();

    const defaultServerSettings = {
      "x-powered-by": false,
    };
    const serverSettings = { ...defaultServerSettings, ...(settings.httpServerOptions || {}) };
    for (const eOption in serverSettings) {
      adminApp.set(eOption, serverSettings[eOption]);
    }

    // Flows
    adminApp.get("/flows", needsPermission("flows.read"), flows.get, apiUtil.errorHandler);
    adminApp.post("/flows", needsPermission("flows.write"), flows.post, apiUtil.errorHandler);

    // Flow
    adminApp.get("/flow/:id", needsPermission("flows.read"), flow.get, apiUtil.errorHandler);
    adminApp.post("/flow", needsPermission("flows.write"), flow.post, apiUtil.errorHandler);
    adminApp.delete("/flow/:id", needsPermission("flows.write"), flow.delete, apiUtil.errorHandler);
    adminApp.put("/flow/:id", needsPermission("flows.write"), flow.put, apiUtil.errorHandler);

    // Nodes
    editorApp.get("/nodes", needsPermission("nodes.read"), nodes.getAll, apiUtil.errorHandler);

    if (
      !settings.externalModules ||
      !settings.externalModules.palette ||
      settings.externalModules.palette.allowInstall !== false
    ) {
      if (
        !settings.externalModules ||
        !settings.externalModules.palette ||
        settings.externalModules.palette.allowUpload !== false
      ) {
        const multer = require("multer");
        const upload = multer({ storage: multer.memoryStorage() });
        editorApp.post(
          "/nodes",
          needsPermission("nodes.write"),
          upload.single("tarball"),
          nodes.post,
          apiUtil.errorHandler,
        );
      } else {
        editorApp.post("/nodes", needsPermission("nodes.write"), nodes.post, apiUtil.errorHandler);
      }
    }
    editorApp.get(
      /^\/nodes\/messages/,
      needsPermission("nodes.read"),
      nodes.getModuleCatalogs,
      apiUtil.errorHandler,
    );
    editorApp.get(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+\/[^\/]+)\/messages/,
      needsPermission("nodes.read"),
      nodes.getModuleCatalog,
      apiUtil.errorHandler,
    );
    editorApp.get(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,
      needsPermission("nodes.read"),
      nodes.getModule,
      apiUtil.errorHandler,
    );
    editorApp.put(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,
      needsPermission("nodes.write"),
      nodes.putModule,
      apiUtil.errorHandler,
    );
    editorApp.delete(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+)$/,
      needsPermission("nodes.write"),
      nodes.delete,
      apiUtil.errorHandler,
    );
    editorApp.get(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,
      needsPermission("nodes.read"),
      nodes.getSet,
      apiUtil.errorHandler,
    );
    editorApp.put(
      /^\/nodes\/((@[^\/]+\/)?[^\/]+)\/([^\/]+)$/,
      needsPermission("nodes.write"),
      nodes.putSet,
      apiUtil.errorHandler,
    );

    // Context
    adminApp.get(
      "/context/:scope(global)",
      needsPermission("context.read"),
      context.get,
      apiUtil.errorHandler,
    );
    adminApp.get(
      "/context/:scope(global)/*",
      needsPermission("context.read"),
      context.get,
      apiUtil.errorHandler,
    );
    adminApp.get(
      "/context/:scope(node|flow)/:id",
      needsPermission("context.read"),
      context.get,
      apiUtil.errorHandler,
    );
    adminApp.get(
      "/context/:scope(node|flow)/:id/*",
      needsPermission("context.read"),
      context.get,
      apiUtil.errorHandler,
    );

    // adminApp.delete("/context/:scope(global)",needsPermission("context.write"),context.delete,apiUtil.errorHandler);
    adminApp.delete(
      "/context/:scope(global)/*",
      needsPermission("context.write"),
      context.delete,
      apiUtil.errorHandler,
    );
    // adminApp.delete("/context/:scope(node|flow)/:id",needsPermission("context.write"),context.delete,apiUtil.errorHandler);
    adminApp.delete(
      "/context/:scope(node|flow)/:id/*",
      needsPermission("context.write"),
      context.delete,
      apiUtil.errorHandler,
    );

    editorApp.get(
      "/settings",
      needsPermission("settings.read"),
      info.runtimeSettings,
      apiUtil.errorHandler,
    );

    // Plugins
    editorApp.get(
      "/plugins",
      needsPermission("plugins.read"),
      plugins.getAll,
      apiUtil.errorHandler,
    );
    editorApp.get(
      "/plugins/messages",
      needsPermission("plugins.read"),
      plugins.getCatalogs,
      apiUtil.errorHandler,
    );

    return adminApp;
  },
};
