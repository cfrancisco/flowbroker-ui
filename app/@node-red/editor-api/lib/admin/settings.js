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
const apiUtils = require("../util");

let runtimeAPI;
let settings;
const theme = require("../editor/theme");
const clone = require("clone");

const { i18n } = require("@node-red/util");

function extend(target, source) {
  const keys = Object.keys(source);
  let i = keys.length;
  while (i--) {
    const value = source[keys[i]];
    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean" || Array.isArray(value)) {
      target[keys[i]] = value;
    } else if (value === null) {
      if (target.hasOwnProperty(keys[i])) {
        delete target[keys[i]];
      }
    } else {
      // Object
      if (target.hasOwnProperty(keys[i])) {
        target[keys[i]] = extend(target[keys[i]], value);
      } else {
        target[keys[i]] = value;
      }
    }
  }
  return target;
}

module.exports = {
  init(_settings, _runtimeAPI) {
    runtimeAPI = _runtimeAPI;
    settings = _settings;
  },
  runtimeSettings(req, res) {
    const opts = {
      tenant: req.tenant,
      user: req.user,
    };
    runtimeAPI.settings.getRuntimeSettings(opts).then((result) => {
      if (!settings.disableEditor) {
        result.editorTheme = result.editorTheme || {};
        const themeSettings = theme.settings();
        if (themeSettings) {
          // result.editorTheme may already exist with the palette
          // disabled. Need to merge that into the receive settings
          result.editorTheme = extend(clone(themeSettings), result.editorTheme);
        }
        result.editorTheme.languages = i18n.availableLanguages("editor");
      }
      res.json(result);
    });
  },
};
