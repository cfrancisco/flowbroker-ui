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

const fs = require("fs");

let runtime;

function init(_runtime) {
  runtime = _runtime;
}

function getEntry(type, path) {
  let examples = runtime.nodes.getNodeExampleFlows() || {};
  const result = [];
  if (path === "") {
    return Promise.resolve(Object.keys(examples));
  }
  path = path.replace(/\/$/, "");
  const parts = path.split("/");
  let module = parts.shift();
  if (module[0] === "@") {
    module = `${module}/${parts.shift()}`;
  }
  if (examples.hasOwnProperty(module)) {
    examples = examples[module];
    examples = parts.reduce((ex, k) => {
      if (ex) {
        if (ex.d && ex.d[k]) {
          return ex.d[k];
        }
        if (ex.f && ex.f.indexOf(k) > -1) {
          return runtime.nodes.getNodeExampleFlowPath(module, parts.join("/"));
        }
      } else {
        return null;
      }
    }, examples);

    if (!examples) {
      return new Promise((resolve, reject) => {
        const error = new Error("not_found");
        error.code = "not_found";
        return reject(error);
      });
    }
    if (typeof examples === "string") {
      return new Promise((resolve, reject) => {
        try {
          fs.readFile(examples, "utf8", (err, data) => {
            runtime.log.audit({
              event: "library.get",
              library: "_examples",
              type: "flow",
              path,
            });
            if (err) {
              return reject(err);
            }
            return resolve(data);
          });
        } catch (err) {
          return reject(err);
        }
      });
    }
    if (examples.d) {
      for (const d in examples.d) {
        if (examples.d.hasOwnProperty(d)) {
          result.push(d);
        }
      }
    }
    if (examples.f) {
      examples.f.forEach((f) => {
        result.push({ fn: f });
      });
    }
    return Promise.resolve(result);
  }
  return new Promise((resolve, reject) => {
    const error = new Error("not_found");
    error.code = "not_found";
    return reject(error);
  });
}

module.exports = {
  id: "examples",
  label: "editor:library.types.examples",
  icon: "font-awesome/fa-life-ring",
  types: ["flows"],
  readOnly: true,
  init,
  getEntry,
};
