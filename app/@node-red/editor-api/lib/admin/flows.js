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

const { Logger } = require("@dojot/microservice-sdk");

const apiUtils = require("../util");

const logger = new Logger("flowbroker-ui:editor-api/admin/flows");

let runtimeAPI;

module.exports = {
  init(_runtimeAPI) {
    runtimeAPI = _runtimeAPI;
  },
  get(req, res) {
    const version = req.get("Node-RED-API-Version") || "v1";
    if (!/^v[12]$/.test(version)) {
      return res
        .status(400)
        .json({ code: "invalid_api_version", message: "Invalid API Version requested" });
    }

    const opts = {
      tenant: req.baseUrl.split("/")[1],
      user: req.user,
      req: apiUtils.getRequestLogObject(req),
      token: apiUtils.getToken(req.headers)
    };

    if (!apiUtils.tenantChecker(opts.tenant, req.tokenTenant)) {
      const err = new Error("Requesting data from wrong tenant.");
      err.code = 412;
      apiUtils.rejectHandler(req, res, err);
      return false;
    }

    logger.debug(`Valid flow requested in Editor-API/admin for tenant: ${opts.tenant}`, {
      rid: `tenant/${runtimeAPI.tenant}`,
    });

    runtimeAPI.flows
      .getFlows(opts)
      .then((result) => {
        if (version === "v1") {
          res.json(result.flows);
        } else if (version === "v2") {
          res.json(result);
        }
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
  post(req, res) {
    const version = req.get("Node-RED-API-Version") || "v1";
    if (!/^v[12]$/.test(version)) {
      return res
        .status(400)
        .json({ code: "invalid_api_version", message: "Invalid API Version requested" });
    }
    const opts = {
      tenant: req.baseUrl.split("/")[1],
      user: req.user,
      token: apiUtils.getToken(req.headers),
      deploymentType: req.get("Node-RED-Deployment-Type") || "full",
      req: apiUtils.getRequestLogObject(req),
    };

    if (opts.deploymentType !== "reload") {
      if (version === "v1") {
        opts.flows = { flows: req.body };
      } else {
        opts.flows = req.body;
      }
    }

    logger.debug(`Saving Flows in Editor-API/admin for tenant: ${opts.tenant}`, {
      rid: `tenant/${runtimeAPI.tenant}`,
    });
    runtimeAPI.flows
      .setFlows(opts)
      .then((result) => {
        if (version === "v1") {
          res.status(204).end();
        } else {
          res.json(result);
        }
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
};
