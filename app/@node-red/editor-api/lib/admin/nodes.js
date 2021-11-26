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

const apiUtils = require("../util");

let runtimeAPI;

module.exports = {
  init(_runtimeAPI) {
    runtimeAPI = _runtimeAPI;
  },
  getAll(req, res) {
    const opts = {
      user: req.user,
      tenant: req.tenant,
      req: apiUtils.getRequestLogObject(req),
    };
    if (req.get("accept") === "application/json") {
      runtimeAPI.nodes.getNodeList(opts).then((list) => {
        res.json(list);
      });
    } else {
      opts.lang = apiUtils.determineLangFromHeaders(req.acceptsLanguages());
      if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
        opts.lang = "en-US";
      }
      runtimeAPI.nodes.getNodeConfigs(opts).then((configs) => {
        res.send(configs);
      });
    }
  },

  post(req, res) {
    const opts = {
      user: req.user,
      tenant: req.tenant,
      module: req.body.module,
      version: req.body.version,
      url: req.body.url,
      tarball: undefined,
      req: apiUtils.getRequestLogObject(req),
    };
    if (
      !runtimeAPI.settings.editorTheme ||
      !runtimeAPI.settings.editorTheme.palette ||
      runtimeAPI.settings.editorTheme.palette.upload !== false
    ) {
      if (req.file) {
        opts.tarball = {
          name: req.file.originalname,
          size: req.file.size,
          buffer: req.file.buffer,
        };
      }
    }
    runtimeAPI.nodes
      .addModule(opts)
      .then((info) => {
        res.json(info);
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },

  delete(req, res) {
    const opts = {
      user: req.user,
      module: req.params[0],
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.nodes
      .removeModule(opts)
      .then(() => {
        res.status(204).end();
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },

  getSet(req, res) {
    const opts = {
      user: req.user,
      id: `${req.params[0]}/${req.params[2]}`,
      req: apiUtils.getRequestLogObject(req),
    };
    if (req.get("accept") === "application/json") {
      runtimeAPI.nodes
        .getNodeInfo(opts)
        .then((result) => {
          res.send(result);
        })
        .catch((err) => {
          apiUtils.rejectHandler(req, res, err);
        });
    } else {
      opts.lang = apiUtils.determineLangFromHeaders(req.acceptsLanguages());
      if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
        opts.lang = "en-US";
      }
      runtimeAPI.nodes
        .getNodeConfig(opts)
        .then((result) => res.send(result))
        .catch((err) => {
          apiUtils.rejectHandler(req, res, err);
        });
    }
  },

  getModule(req, res) {
    const opts = {
      user: req.user,
      module: req.params[0],
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.nodes
      .getModuleInfo(opts)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },

  putSet(req, res) {
    const { body } = req;
    if (!body.hasOwnProperty("enabled")) {
      // log.audit({event: "nodes.module.set",error:"invalid_request"},req);
      res.status(400).json({ code: "invalid_request", message: "Invalid request" });
      return;
    }
    const opts = {
      user: req.user,
      id: `${req.params[0]}/${req.params[2]}`,
      enabled: body.enabled,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.nodes
      .setNodeSetState(opts)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },

  putModule(req, res) {
    const { body } = req;
    if (!body.hasOwnProperty("enabled")) {
      // log.audit({event: "nodes.module.set",error:"invalid_request"},req);
      res.status(400).json({ code: "invalid_request", message: "Invalid request" });
      return;
    }
    const opts = {
      user: req.user,
      module: req.params[0],
      enabled: body.enabled,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.nodes
      .setModuleState(opts)
      .then((result) => {
        res.send(result);
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },

  getModuleCatalog(req, res) {
    const opts = {
      user: req.user,
      module: req.params[0],
      lang: req.query.lng,
      req: apiUtils.getRequestLogObject(req),
    };
    if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
      opts.lang = "en-US";
    }
    runtimeAPI.nodes
      .getModuleCatalog(opts)
      .then((result) => {
        res.json(result);
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },

  getModuleCatalogs(req, res) {
    const opts = {
      user: req.user,
      lang: req.query.lng,
      req: apiUtils.getRequestLogObject(req),
    };
    if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
      opts.lang = "en-US";
    }
    runtimeAPI.nodes
      .getModuleCatalogs(opts)
      .then((result) => {
        res.json(result);
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },

  getIcons(req, res) {
    const opts = {
      user: req.user,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.nodes.getIconList(opts).then((list) => {
      res.json(list);
    });
  },
};
