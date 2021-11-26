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
const fs = require("fs");
const path = require("path");
const Mustache = require("mustache");
const mime = require("mime");

const apiUtils = require("../util");

const theme = require("./theme");

let runtimeAPI;
const editorClientDir = path.dirname(require.resolve("./../../../editor-client"));

const defaultNodeIcon = path.join(
  editorClientDir,
  "public",
  "red",
  "images",
  "icons",
  "arrow-in.svg",
);
const editorTemplatePath = path.join(editorClientDir, "templates", "index.mst");
let editorTemplate;

module.exports = {
  init(_runtimeAPI) {
    runtimeAPI = _runtimeAPI;
    editorTemplate = fs.readFileSync(editorTemplatePath, "utf8");
    Mustache.parse(editorTemplate);
  },

  ensureSlash(req, res, next) {
    const parts = req.originalUrl.split("?");
    if (parts[0].slice(-1) != "/") {
      parts[0] += "/";
      const redirect = parts.join("?");
      res.redirect(301, redirect);
    } else {
      next();
    }
  },
  icon(req, res) {
    const { icon } = req.params;
    const { scope } = req.params;
    const module = scope ? `${scope}/${req.params.module}` : req.params.module;
    const opts = {
      user: req.user,
      module,
      icon,
    };
    runtimeAPI.nodes
      .getIcon(opts)
      .then((data) => {
        if (data) {
          const contentType = mime.getType(icon);
          res.set("Content-Type", contentType);
          res.send(data);
        } else {
          res.sendFile(defaultNodeIcon);
        }
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },

  moduleResource(req, res) {
    const resourcePath = req.params[1];
    const opts = {
      user: req.user,
      module: req.params[0],
      path: resourcePath,
    };

    runtimeAPI.nodes
      .getModuleResource(opts)
      .then((data) => {
        if (data) {
          const contentType = mime.getType(resourcePath);
          res.set("Content-Type", contentType);
          res.send(data);
        } else {
          res.status(404).end();
        }
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },

  async editor(req, res) {
    res.send(Mustache.render(editorTemplate, await theme.context()));
  },
  editorResources: express.static(path.join(editorClientDir, "public")),
};
