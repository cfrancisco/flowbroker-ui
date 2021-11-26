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
      tenant: req.tenant,
      user: req.user,
      req: apiUtils.getRequestLogObject(req),
      token: apiUtils.getToken(req.headers),
    };

    // We will not do a double-check for now since we are using the
    // same URL to address all tenants.
    /*
    if (!apiUtils.tenantChecker(opts.tenant, req.tokenTenant)) {
      const err = new Error("Requesting data from wrong tenant.");
      err.code = 412;
      apiUtils.rejectHandler(req, res, err);
      return false;
    }
    */

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
      tenant: req.tenant,
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
