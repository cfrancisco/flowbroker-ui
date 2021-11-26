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

const child_process = require("child_process");

const sshkeygenCommand = "ssh-keygen";

const { log } = require("@node-red/util");

function runSshKeygenCommand(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = child_process.spawn(sshkeygenCommand, args, { cwd, detached: true, env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data;
    });
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.on("close", (code, signal) => {
      // console.log(code);
      // console.log(stdout);
      // console.log(stderr);
      if (code !== 0) {
        const err = new Error(stderr);
        err.stdout = stdout;
        err.stderr = stderr;
        if (/short/.test(stderr)) {
          err.code = "key_passphrase_too_short";
        } else if (/Key must at least be 1024 bits/.test(stderr)) {
          err.code = "key_length_too_short";
        }
        reject(err);
      } else {
        resolve(stdout);
      }
    });
    child.on("error", (err) => {
      if (/ENOENT/.test(err.toString())) {
        err.code = "command_not_found";
      }
      reject(err);
    });
  });
}

function generateKey(options) {
  const args = ["-q", "-t", "rsa"];
  let err;
  if (options.size) {
    if (options.size < 1024) {
      err = new Error("key_length_too_short");
      err.code = "key_length_too_short";
      throw err;
    }
    args.push("-b", options.size);
  }
  if (options.location) {
    args.push("-f", options.location);
  }
  if (options.comment) {
    args.push("-C", options.comment);
  }
  if (options.password) {
    if (options.password.length < 5) {
      err = new Error("key_passphrase_too_short");
      err.code = "key_passphrase_too_short";
      throw err;
    }
    args.push("-N", options.password || "");
  } else {
    args.push("-N", "");
  }

  return runSshKeygenCommand(args, __dirname);
}

module.exports = {
  generateKey,
};
