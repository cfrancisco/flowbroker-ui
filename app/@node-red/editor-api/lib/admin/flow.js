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

let runtimeAPI;
const apiUtils = require("../util");

module.exports = {
  init(_runtimeAPI) {
    runtimeAPI = _runtimeAPI;
  },
  get(req, res) {
    const opts = {
      user: req.user,
      id: req.params.id,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.flows
      .getFlow(opts)
      .then((result) => res.json(result))
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
  post(req, res) {
    const opts = {
      user: req.user,
      flow: req.body,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.flows
      .addFlow(opts)
      .then((id) => res.json({ id }))
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
  put(req, res) {
    const opts = {
      user: req.user,
      id: req.params.id,
      flow: req.body,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.flows
      .updateFlow(opts)
      .then((id) => res.json({ id }))
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
  delete(req, res) {
    const opts = {
      user: req.user,
      id: req.params.id,
      req: apiUtils.getRequestLogObject(req),
    };
    runtimeAPI.flows
      .deleteFlow(opts)
      .then(() => {
        res.status(204).end();
      })
      .catch((err) => {
        apiUtils.rejectHandler(req, res, err);
      });
  },
};
