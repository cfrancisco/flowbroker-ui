const createError = require("http-errors");

const jwtDecode = require("jwt-decode");

const { ConfigManager } = require("@dojot/microservice-sdk");

const { unflatten } = require("flat");

const configs = unflatten(ConfigManager.getConfig("FLOWBROKER-UI"));
/* *
 * A middleware  to  extract dojot tenant from jwt
 *
 * Decodes the JWT token that must be sent with the request.
 * After adds the referred tenant to req.tokenTenant;
 *
 * */

// Skip endpoints relate to non-private data
const skipList = configs.routes.skiplist;

module.exports = () => ({
  name: "dojot-tenant-jwt-parse-interceptor",
  middleware: (req, res, next) => {
    // Bocking only application/json requests
    if (req.get("Content-Type") !== "application/json") {
      return next();
    }

    const subDomain = `${req.path.split("/")[1]}/${req.path.split("/")[3]}`;
    if (skipList.includes(subDomain)) {
      return next();
    }

    const err = new createError.Unauthorized();
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization.split(" ");

      if (authHeader.length === 2 && authHeader[0] === "Bearer") {
        const token = authHeader[1];
        let payload = {};

        if (!token) {
          err.message = "Invalid Dojot JWT Token.";
          return next(err);
        }

        try {
          payload = jwtDecode(token);
        } catch (e) {
          err.message = e.message;
          return next(err);
        }

        if (!payload.service) {
          err.message = "Missing Tenant information.";
          return next(err);
        }
        req.tenant = payload.service;

        return next();
      }
      err.message = "Invalid Dojot JWT Token.";
      return next(err);
    }
    err.message = "Missing Dojot JWT Token.";
    return next(err);
  },
});
