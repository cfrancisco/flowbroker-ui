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
const keygen = require("./keygen");

let settings;
const { log } = require("@node-red/util");

let sshkeyDir;
let userSSHKeyDir;

function init(_settings) {
  settings = _settings;
  sshkeyDir = fspath.resolve(fspath.join(settings.userDir, "projects", ".sshkeys"));
  userSSHKeyDir = fspath.join(
    process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH,
    ".ssh",
  );
  // console.log('sshkeys.init()');
  return fs.ensureDir(sshkeyDir);
}

function listSSHKeys(username) {
  return listSSHKeysInDir(sshkeyDir, `${username}_`).then((customKeys) =>
    listSSHKeysInDir(userSSHKeyDir).then((existingKeys) => {
      existingKeys.forEach((k) => {
        k.system = true;
        customKeys.push(k);
      });
      return customKeys;
    }),
  );
}

function listSSHKeysInDir(dir, startStr) {
  startStr = startStr || "";
  return fs
    .readdir(dir)
    .then((fns) => {
      const ret = fns
        .sort()
        .filter((fn) => {
          const fullPath = fspath.join(dir, fn);
          if (fn.length > 2 || fn[0] != ".") {
            const stats = fs.lstatSync(fullPath);
            if (stats.isFile()) {
              return fn.startsWith(startStr);
            }
          }
          return false;
        })
        .map((filename) => filename.substr(startStr.length))
        .reduce(
          (prev, current) => {
            const parsePath = fspath.parse(current);
            if (parsePath) {
              if (parsePath.ext !== ".pub") {
                // Private Keys
                prev.keyFiles.push(parsePath.base);
              } else if (
                parsePath.ext === ".pub" &&
                prev.keyFiles.some((elem) => elem === parsePath.name)
              ) {
                prev.privateKeyFiles.push(parsePath.name);
              }
            }
            return prev;
          },
          { keyFiles: [], privateKeyFiles: [] },
        );
      return ret.privateKeyFiles.map((filename) => ({
        name: filename,
      }));
    })
    .then((result) => result)
    .catch(() => []);
}

function getSSHKey(username, name) {
  return checkSSHKeyFileAndGetPublicKeyFileName(username, name)
    .then((publicSSHKeyPath) => fs.readFile(publicSSHKeyPath, "utf-8"))
    .catch(() => {
      const privateKeyPath = fspath.join(userSSHKeyDir, name);
      const publicKeyPath = `${privateKeyPath}.pub`;
      return checkFilePairExist(privateKeyPath, publicKeyPath)
        .then(() => fs.readFile(publicKeyPath, "utf-8"))
        .catch(() => null);
    });
}

function generateSSHKey(username, options) {
  options = options || {};
  const name = options.name || "";
  if (!/^[a-zA-Z0-9\-_]+$/.test(options.name)) {
    const err = new Error("Invalid SSH Key name");
    e.code = "invalid_key_name";
    return Promise.reject(err);
  }
  return checkExistSSHKeyFiles(username, name).then((result) => {
    if (result) {
      const e = new Error("SSH Key name exists");
      e.code = "key_exists";
      throw e;
    } else {
      const comment = options.comment || "";
      const password = options.password || "";
      const size = options.size || 2048;
      const sshKeyFileBasename = `${username}_${name}`;
      const privateKeyFilePath = fspath.normalize(fspath.join(sshkeyDir, sshKeyFileBasename));
      return generateSSHKeyPair(name, privateKeyFilePath, comment, password, size);
    }
  });
}

function deleteSSHKey(username, name) {
  return checkSSHKeyFileAndGetPublicKeyFileName(username, name).then(() =>
    deleteSSHKeyFiles(username, name),
  );
}

function checkExistSSHKeyFiles(username, name) {
  const sshKeyFileBasename = `${username}_${name}`;
  const privateKeyFilePath = fspath.join(sshkeyDir, sshKeyFileBasename);
  const publicKeyFilePath = fspath.join(sshkeyDir, `${sshKeyFileBasename}.pub`);
  return checkFilePairExist(privateKeyFilePath, publicKeyFilePath)
    .then(() => true)
    .catch(() => false);
}

function checkSSHKeyFileAndGetPublicKeyFileName(username, name) {
  const sshKeyFileBasename = `${username}_${name}`;
  const privateKeyFilePath = fspath.join(sshkeyDir, sshKeyFileBasename);
  const publicKeyFilePath = fspath.join(sshkeyDir, `${sshKeyFileBasename}.pub`);
  return checkFilePairExist(privateKeyFilePath, publicKeyFilePath).then(() => publicKeyFilePath);
}

function checkFilePairExist(privateKeyFilePath, publicKeyFilePath) {
  return Promise.all([
    fs.access(privateKeyFilePath, (fs.constants || fs).R_OK),
    fs.access(publicKeyFilePath, (fs.constants || fs).R_OK),
  ]);
}

function deleteSSHKeyFiles(username, name) {
  const sshKeyFileBasename = `${username}_${name}`;
  const privateKeyFilePath = fspath.join(sshkeyDir, sshKeyFileBasename);
  const publicKeyFilePath = fspath.join(sshkeyDir, `${sshKeyFileBasename}.pub`);
  return Promise.all([fs.remove(privateKeyFilePath), fs.remove(publicKeyFilePath)]);
}

function generateSSHKeyPair(name, privateKeyPath, comment, password, size) {
  log.trace(
    `ssh-keygen[${[name, privateKeyPath, comment, size, `hasPassword?${!!password}`].join(",")}]`,
  );
  return keygen
    .generateKey({
      location: privateKeyPath,
      comment,
      password,
      size,
    })
    .then((stdout) => name)
    .catch((err) => {
      log.log("[SSHKey generation] error:", err);
      throw err;
    });
}

function getPrivateKeyPath(username, name) {
  const sshKeyFileBasename = `${username}_${name}`;
  let privateKeyFilePath = fspath.normalize(fspath.join(sshkeyDir, sshKeyFileBasename));
  try {
    fs.accessSync(privateKeyFilePath, (fs.constants || fs).R_OK);
  } catch (err) {
    privateKeyFilePath = fspath.join(userSSHKeyDir, name);
    try {
      fs.accessSync(privateKeyFilePath, (fs.constants || fs).R_OK);
    } catch (err2) {
      return null;
    }
  }
  if (fspath.sep === "\\") {
    privateKeyFilePath = privateKeyFilePath.replace(/\\/g, "\\\\");
  }
  return privateKeyFilePath;
}

module.exports = {
  init,
  listSSHKeys,
  getSSHKey,
  getPrivateKeyPath,
  generateSSHKey,
  deleteSSHKey,
};
