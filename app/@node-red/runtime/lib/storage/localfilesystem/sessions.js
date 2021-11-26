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

const fs = require("fs-extra");
const fspath = require("path");

const { log } = require("@node-red/util"); // TODO: separate module

const util = require("./util");

let sessionsFile;
let settings;

module.exports = {
  init(_settings) {
    settings = _settings;
    sessionsFile = fspath.join(settings.userDir, ".sessions.json");
  },
  async getSessions() {
    return new Promise((resolve, reject) => {
      fs.readFile(sessionsFile, "utf8", (err, data) => {
        if (!err) {
          try {
            return resolve(util.parseJSON(data));
          } catch (err2) {
            log.trace("Corrupted sessions file - resetting");
          }
        }
        resolve({});
      });
    });
  },
  async saveSessions(sessions) {
    if (settings.readOnly) {
      return;
    }
    return util.writeFile(sessionsFile, JSON.stringify(sessions));
  },
};
