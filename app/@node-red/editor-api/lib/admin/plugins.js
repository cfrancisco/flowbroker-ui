/* === This is a file from Node-Red being used as-is. === */
const apiUtils = require("../util");

let runtimeAPI;

module.exports = {
  init(_runtimeAPI) {
    runtimeAPI = _runtimeAPI;
  },
  getAll(req, res) {
    const opts = {
      user: req.user,
      req: apiUtils.getRequestLogObject(req),
    };
    if (req.get("accept") === "application/json") {
      runtimeAPI.plugins.getPluginList(opts).then((list) => {
        res.json(list);
      });
    } else {
      opts.lang = apiUtils.determineLangFromHeaders(req.acceptsLanguages());
      if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
        opts.lang = "en-US";
      }
      runtimeAPI.plugins.getPluginConfigs(opts).then((configs) => {
        res.send(configs);
      });
    }
  },
  getCatalogs(req, res) {
    const opts = {
      user: req.user,
      lang: req.query.lng,
      req: apiUtils.getRequestLogObject(req),
    };
    if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
      opts.lang = "en-US";
    }
    runtimeAPI.plugins
      .getPluginCatalogs(opts)
      .then((result) => {
        res.json(result);
      })
      .catch((err) => {
        console.log(err.stack);
        apiUtils.rejectHandler(req, res, err);
      });
  },
};
