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

const authResponseServer = require("./authServer").ResponseServer;
const sshResponseServer = require("./authServer").ResponseSSHServer;
const clone = require("clone");
const path = require("path");

const gitCommand = "git";
let gitVersion;
const { log, exec } = require("@node-red/util");

function runGitCommand(args, cwd, env, emit) {
  log.trace(gitCommand + JSON.stringify(args));
  args.unshift("credential.helper=");
  args.unshift("-c");
  return exec
    .run(gitCommand, args, { cwd, detached: true, env }, emit)
    .then((result) => result.stdout)
    .catch((result) => {
      const { stdout } = result;
      const { stderr } = result;
      const err = new Error(stderr);
      err.stdout = stdout;
      err.stderr = stderr;
      if (/Connection refused/i.test(stderr)) {
        err.code = "git_connection_failed";
      } else if (/Connection timed out/i.test(stderr)) {
        err.code = "git_connection_failed";
      } else if (/Host key verification failed/i.test(stderr)) {
        // TODO: handle host key verification errors separately
        err.code = "git_host_key_verification_failed";
      } else if (/fatal: could not read/i.test(stderr)) {
        // Username/Password
        err.code = "git_auth_failed";
      } else if (/HTTP Basic: Access denied/i.test(stderr)) {
        err.code = "git_auth_failed";
      } else if (/Permission denied \(publickey\)/i.test(stderr)) {
        err.code = "git_auth_failed";
      } else if (/Authentication failed/i.test(stderr)) {
        err.code = "git_auth_failed";
      } else if (/commit your changes or stash/i.test(stderr)) {
        err.code = "git_local_overwrite";
      } else if (/CONFLICT/.test(err.stdout)) {
        err.code = "git_pull_merge_conflict";
      } else if (/not fully merged/i.test(stderr)) {
        err.code = "git_delete_branch_unmerged";
      } else if (/remote .* already exists/i.test(stderr)) {
        err.code = "git_remote_already_exists";
      } else if (/does not appear to be a git repository/i.test(stderr)) {
        err.code = "git_not_a_repository";
      } else if (/Repository not found/i.test(stderr)) {
        err.code = "git_repository_not_found";
      } else if (/repository '.*' does not exist/i.test(stderr)) {
        err.code = "git_repository_not_found";
      } else if (/refusing to merge unrelated histories/i.test(stderr)) {
        err.code = "git_pull_unrelated_history";
      } else if (/Please tell me who you are/i.test(stderr)) {
        err.code = "git_missing_user";
      } else if (/name consists only of disallowed characters/i.test(stderr)) {
        err.code = "git_missing_user";
      }
      throw err;
    });
}
function runGitCommandWithAuth(args, cwd, auth, emit) {
  log.trace(
    `runGitCommandWithAuth ${JSON.stringify(auth).replace(
      /("pass.*?"\s*:\s*").+?"/g,
      '$1[hidden]"',
    )}`,
  );
  return authResponseServer(auth).then((rs) => {
    const commandEnv = clone(process.env);
    commandEnv.GIT_ASKPASS = path.join(__dirname, "node-red-ask-pass.sh");
    commandEnv.NODE_RED_GIT_NODE_PATH = process.execPath;
    commandEnv.NODE_RED_GIT_SOCK_PATH = rs.path;
    commandEnv.NODE_RED_GIT_ASKPASS_PATH = path.join(__dirname, "authWriter.js");
    return runGitCommand(args, cwd, commandEnv, emit)
      .then((result) => {
        rs.close();
        return result;
      })
      .catch((err) => {
        rs.close();
        throw err;
      });
  });
}

function runGitCommandWithSSHCommand(args, cwd, auth, emit) {
  log.trace(
    `runGitCommandWithSSHCommand ${JSON.stringify(auth).replace(
      /("pass.*?"\s*:\s*").+?"/g,
      '$1[hidden]"',
    )}`,
  );
  return sshResponseServer(auth).then((rs) => {
    const commandEnv = clone(process.env);
    commandEnv.SSH_ASKPASS = path.join(__dirname, "node-red-ask-pass.sh");
    commandEnv.DISPLAY = "dummy:0";
    commandEnv.NODE_RED_GIT_NODE_PATH = process.execPath;
    commandEnv.NODE_RED_GIT_SOCK_PATH = rs.path;
    commandEnv.NODE_RED_GIT_ASKPASS_PATH = path.join(__dirname, "authWriter.js");
    // For git < 2.3.0
    commandEnv.GIT_SSH = path.join(__dirname, "node-red-ssh.sh");
    commandEnv.NODE_RED_KEY_FILE = auth.key_path;
    // GIT_SSH_COMMAND - added in git 2.3.0
    commandEnv.GIT_SSH_COMMAND = `ssh -i ${auth.key_path} -F /dev/null`;
    // console.log('commandEnv:', commandEnv);
    return runGitCommand(args, cwd, commandEnv, emit)
      .then((result) => {
        rs.close();
        return result;
      })
      .catch((err) => {
        rs.close();
        throw err;
      });
  });
}

function cleanFilename(name) {
  if (name[0] !== '"') {
    return name;
  }
  return name.substring(1, name.length - 1);
}
function parseFilenames(name) {
  const re = /([^ "]+|(".*?"))($| -> ([^ ]+|(".*"))$)/;
  const m = re.exec(name);
  const result = [];
  if (m) {
    result.push(cleanFilename(m[1]));
    if (m[4]) {
      result.push(cleanFilename(m[4]));
    }
  }
  return result;
}
// function getBranchInfo(localRepo) {
//     return runGitCommand(["status","--porcelain","-b"],localRepo).then(function(output) {
//         var lines = output.split("\n");
//         var unknownDirs = [];
//         var branchLineRE = /^## (No commits yet on )?(.+?)($|\.\.\.(.+?)($| \[(ahead (\d+))?.*?(behind (\d+))?\]))/m;
//         console.log(output);
//         console.log(lines);
//         var m = branchLineRE.exec(output);
//         console.log(m);
//         var result = {}; //commits:{}};
//         if (m) {
//             if (m[1]) {
//                 result.empty = true;
//             }
//             result.local = m[2];
//             if (m[4]) {
//                 result.remote = m[4];
//             }
//         }
//         return result;
//     });
// }
function getStatus(localRepo) {
  // parseFilename('"test with space"');
  // parseFilename('"test with space" -> knownFile.txt');
  // parseFilename('"test with space" -> "un -> knownFile.txt"');
  const result = {
    files: {},
    commits: {},
    branches: {},
  };
  return runGitCommand(["rev-list", "HEAD", "--count"], localRepo)
    .then((count) => {
      result.commits.total = parseInt(count);
    })
    .catch((err) => {
      if (/ambiguous argument/i.test(err.message)) {
        result.commits.total = 0;
      } else {
        throw err;
      }
    })
    .then(() =>
      runGitCommand(["ls-files", "--cached", "--others", "--exclude-standard"], localRepo).then(
        (output) => {
          const lines = output.split("\n");
          lines.forEach((l) => {
            if (l === "") {
              return;
            }
            const fullName = cleanFilename(l);
            // parseFilename(l);
            const parts = fullName.split("/");
            const p = result.files;
            var name;
            for (let i = 0; i < parts.length - 1; i++) {
              var name = `${parts.slice(0, i + 1).join("/")}/`;
              if (!p.hasOwnProperty(name)) {
                p[name] = {
                  type: "d",
                };
              }
            }
            result.files[fullName] = {
              type: /\/$/.test(fullName) ? "d" : "f",
            };
          });
          return runGitCommand(["status", "--porcelain", "-b"], localRepo).then((output) => {
            const lines = output.split("\n");
            const unknownDirs = [];
            const branchLineRE =
              /^## (?:(?:No commits yet on )|(?:Initial commit on))?(.+?)(?:$|\.\.\.(.+?)(?:$| \[(?:(?:ahead (\d+)(?:,\s*)?)?(?:behind (\d+))?|(gone))\]))/;
            lines.forEach((line) => {
              if (line === "") {
                return;
              }
              if (line[0] === "#") {
                const m = branchLineRE.exec(line);
                if (m) {
                  result.branches.local = m[1];
                  if (m[2]) {
                    result.branches.remote = m[2];
                    result.commits.ahead = 0;
                    result.commits.behind = 0;
                  }
                  if (m[3] !== undefined) {
                    result.commits.ahead = parseInt(m[3]);
                  }
                  if (m[4] !== undefined) {
                    result.commits.behind = parseInt(m[4]);
                  }
                  if (m[5] !== undefined) {
                    result.commits.ahead = result.commits.total;
                    result.branches.remoteError = {
                      code: "git_remote_gone",
                    };
                  }
                }
                return;
              }
              const status = line.substring(0, 2);
              let fileName;
              let names;
              if (status !== "??") {
                names = parseFilenames(line.substring(3));
              } else {
                names = [cleanFilename(line.substring(3))];
              }
              fileName = names[0];
              if (names.length > 1) {
                fileName = names[1];
              }

              // parseFilename(fileName);
              if (fileName.charCodeAt(0) === 34) {
                fileName = fileName.substring(1, fileName.length - 1);
              }
              if (result.files.hasOwnProperty(fileName)) {
                result.files[fileName].status = status;
              } else {
                result.files[fileName] = {
                  type: "f",
                  status,
                };
              }
              if (names.length > 1) {
                result.files[fileName].oldName = names[0];
              }
              if (status === "??" && fileName[fileName.length - 1] === "/") {
                unknownDirs.push(fileName);
              }
            });
            const allFilenames = Object.keys(result.files);
            allFilenames.forEach((f) => {
              const entry = result.files[f];
              if (!entry.hasOwnProperty("status")) {
                unknownDirs.forEach((uf) => {
                  if (f.startsWith(uf)) {
                    entry.status = "??";
                  }
                });
              }
            });
            // console.log(files);
            return result;
          });
        },
      ),
    );
}

function parseLog(log) {
  const lines = log.split("\n");
  let currentCommit = {};
  const commits = [];
  lines.forEach((l) => {
    if (l === "-----") {
      commits.push(currentCommit);
      currentCommit = {};
      return;
    }
    const m = /^(.*?): (.*)$/.exec(l);
    if (m) {
      // git 2.1.4 (Debian Stable) doesn't support %D for refs - so filter out
      if (m[1] === "refs" && m[2]) {
        if (m[2] !== "%D") {
          currentCommit[m[1]] = m[2].split(",").map((v) => v.trim());
        } else {
          currentCommit[m[1]] = [];
        }
      } else if (m[1] === "parents") {
        currentCommit[m[1]] = m[2].split(" ");
      } else {
        currentCommit[m[1]] = m[2];
      }
    }
  });
  return commits;
}

function getRemotes(cwd) {
  return runGitCommand(["remote", "-v"], cwd).then((output) => {
    let result;
    if (output.length > 0) {
      result = {};
      const remoteRE = /^(.+)\t(.+) \((.+)\)$/gm;
      let m;
      while ((m = remoteRE.exec(output)) !== null) {
        result[m[1]] = result[m[1]] || {};
        result[m[1]][m[3]] = m[2];
      }
    }
    return result;
  });
}

function getBranches(cwd, remote) {
  const args = ["branch", "-vv", "--no-color"];
  if (remote) {
    args.push("-r");
  }
  const branchRE =
    /^([ \*] )(\S+) +(\S+)(?: \[(\S+?)(?:: (?:ahead (\d+)(?:, )?)?(?:behind (\d+))?)?\])? (.*)$/;
  return runGitCommand(args, cwd).then((output) => {
    let branches = [];
    const lines = output.split("\n");
    branches = lines
      .map((l) => {
        const m = branchRE.exec(l);
        let branch = null;
        if (m) {
          branch = {
            name: m[2],
            remote: m[4],
            status: {
              ahead: m[5] || 0,
              behind: m[6] || 0,
            },
            commit: {
              sha: m[3],
              subject: m[7],
            },
          };
          if (m[1] === "* ") {
            branch.current = true;
          }
        }
        return branch;
      })
      .filter((v) => !!v && v.commit.sha !== "->");

    return { branches };
  });
}
function getBranchStatus(cwd, remoteBranch) {
  const commands = [
    // #commits master ahead
    runGitCommand(["rev-list", "HEAD", `^${remoteBranch}`, "--count"], cwd),
    // #commits master behind
    runGitCommand(["rev-list", "^HEAD", remoteBranch, "--count"], cwd),
  ];
  return Promise.all(commands).then((results) => ({
    commits: {
      ahead: parseInt(results[0]),
      behind: parseInt(results[1]),
    },
  }));
}

function addRemote(cwd, name, options) {
  const args = ["remote", "add", name, options.url];
  return runGitCommand(args, cwd);
}
function removeRemote(cwd, name) {
  const args = ["remote", "remove", name];
  return runGitCommand(args, cwd);
}

module.exports = {
  init(_settings) {
    return new Promise((resolve, reject) => {
      Promise.all([
        runGitCommand(["--version"]),
        runGitCommand(["config", "--global", "user.name"]).catch((err) => ""),
        runGitCommand(["config", "--global", "user.email"]).catch((err) => ""),
      ])
        .then((output) => {
          const m = / (\d\S+)/.exec(output[0]);
          gitVersion = m[1];
          const globalUserName = output[1].trim();
          const globalUserEmail = output[2].trim();
          const result = {
            version: gitVersion,
          };
          if (globalUserName && globalUserEmail) {
            result.user = {
              name: globalUserName,
              email: globalUserEmail,
            };
          }
          log.trace(`git init: ${JSON.stringify(result)}`);
          resolve(result);
        })
        .catch((err) => {
          log.trace("git init: git not found");
          resolve(null);
        });
    });
  },
  initRepo(cwd) {
    return runGitCommand(["init"], cwd);
  },
  setUpstream(cwd, remoteBranch) {
    const args = ["branch", "--set-upstream-to", remoteBranch];
    return runGitCommand(args, cwd);
  },
  pull(cwd, remote, branch, allowUnrelatedHistories, auth, gitUser) {
    const args = ["pull"];
    if (remote && branch) {
      args.push(remote);
      args.push(branch);
    }
    if (gitUser && gitUser.name && gitUser.email) {
      args.unshift(`user.name="${gitUser.name}"`);
      args.unshift("-c");
      args.unshift(`user.email="${gitUser.email}"`);
      args.unshift("-c");
    }
    if (allowUnrelatedHistories) {
      args.push("--allow-unrelated-histories");
    }
    let promise;
    if (auth) {
      if (auth.key_path) {
        promise = runGitCommandWithSSHCommand(args, cwd, auth, true);
      } else {
        promise = runGitCommandWithAuth(args, cwd, auth, true);
      }
    } else {
      promise = runGitCommand(args, cwd, undefined, true);
    }
    return promise;
    // .catch(function(err) {
    //     if (/CONFLICT/.test(err.stdout)) {
    //         var e = new Error("pull failed - merge conflict");
    //         e.code = "git_pull_merge_conflict";
    //         throw e;
    //     } else if (/Please commit your changes or stash/i.test(err.message)) {
    //         var e = new Error("Pull failed - local changes would be overwritten");
    //         e.code = "git_pull_overwrite";
    //         throw e;
    //     }
    //     throw err;
    // });
  },
  push(cwd, remote, branch, setUpstream, auth) {
    const args = ["push"];
    if (branch) {
      if (setUpstream) {
        args.push("-u");
      }
      args.push(remote);
      args.push(`HEAD:${branch}`);
    } else {
      args.push(remote);
    }
    args.push("--porcelain");
    let promise;
    if (auth) {
      if (auth.key_path) {
        promise = runGitCommandWithSSHCommand(args, cwd, auth, true);
      } else {
        promise = runGitCommandWithAuth(args, cwd, auth, true);
      }
    } else {
      promise = runGitCommand(args, cwd, undefined, true);
    }
    return promise.catch((err) => {
      if (err.code === "git_error") {
        if (/^!.*non-fast-forward/m.test(err.stdout)) {
          err.code = "git_push_failed";
        }
        throw err;
      } else {
        throw err;
      }
    });
  },
  clone(remote, auth, cwd) {
    const args = ["clone", remote.url];
    if (remote.name) {
      args.push("-o");
      args.push(remote.name);
    }
    if (remote.branch) {
      args.push("-b");
      args.push(remote.branch);
    }
    args.push(".");
    if (auth) {
      if (auth.key_path) {
        return runGitCommandWithSSHCommand(args, cwd, auth, true);
      }

      return runGitCommandWithAuth(args, cwd, auth, true);
    }
    return runGitCommand(args, cwd, undefined, true);
  },
  getStatus,
  getFile(cwd, filePath, treeish) {
    const args = ["show", `${treeish}:${filePath}`];
    return runGitCommand(args, cwd);
  },
  getFiles(cwd) {
    return getStatus(cwd).then((status) => status.files);
  },
  revertFile(cwd, filePath) {
    const args = ["checkout", filePath];
    return runGitCommand(args, cwd);
  },
  stageFile(cwd, file) {
    let args = ["add"];
    if (Array.isArray(file)) {
      args = args.concat(file);
    } else {
      args.push(file);
    }
    return runGitCommand(args, cwd);
  },
  unstageFile(cwd, file) {
    const args = ["reset", "--"];
    if (file) {
      args.push(file);
    }
    return runGitCommand(args, cwd);
  },
  commit(cwd, message, gitUser) {
    const args = ["commit", "-m", message];
    let env;
    if (gitUser && gitUser.name && gitUser.email) {
      args.unshift(`user.name="${gitUser.name}"`);
      args.unshift("-c");
      args.unshift(`user.email="${gitUser.email}"`);
      args.unshift("-c");
    }
    return runGitCommand(args, cwd, env);
  },
  getFileDiff(cwd, file, type) {
    const args = ["diff", "-w"];
    if (type === "tree") {
      // nothing else to do
    } else if (type === "index") {
      args.push("--cached");
    }
    args.push(file);
    return runGitCommand(args, cwd);
  },
  fetch(cwd, remote, auth) {
    const args = ["fetch", remote];
    if (auth) {
      if (auth.key_path) {
        return runGitCommandWithSSHCommand(args, cwd, auth);
      }

      return runGitCommandWithAuth(args, cwd, auth);
    }
    return runGitCommand(args, cwd);
  },
  getCommits(cwd, options) {
    const args = [
      "log",
      "--format=sha: %H%nparents: %p%nrefs: %D%nauthor: %an%ndate: %ct%nsubject: %s%n-----",
    ];
    const limit = parseInt(options.limit) || 20;
    args.push(`-n ${limit}`);
    const { before } = options;
    if (before) {
      args.push(before);
    }
    const commands = [
      runGitCommand(["rev-list", "HEAD", "--count"], cwd),
      runGitCommand(args, cwd).then(parseLog),
    ];
    return Promise.all(commands).then((results) => {
      const result = results[0];
      result.count = results[1].length;
      result.before = before;
      result.commits = results[1];
      return {
        count: results[1].length,
        commits: results[1],
        before,
        total: parseInt(results[0]),
      };
    });
  },
  getCommit(cwd, sha) {
    const args = ["show", sha];
    return runGitCommand(args, cwd);
  },
  abortMerge(cwd) {
    return runGitCommand(["merge", "--abort"], cwd);
  },
  getRemotes,
  getRemoteBranch(cwd) {
    return runGitCommand(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd).catch(
      (err) => {
        if (/no upstream configured for branch/i.test(err.message)) {
          return null;
        }
        throw err;
      },
    );
  },
  getBranches,
  // getBranchInfo: getBranchInfo,
  checkoutBranch(cwd, branchName, isCreate) {
    const args = ["checkout"];
    if (isCreate) {
      args.push("-b");
    }
    args.push(branchName);
    return runGitCommand(args, cwd);
  },
  deleteBranch(cwd, branchName, isRemote, force) {
    if (isRemote) {
      throw new Error("Deleting remote branches not supported");
    }
    const args = ["branch"];
    if (force) {
      args.push("-D");
    } else {
      args.push("-d");
    }
    args.push(branchName);
    return runGitCommand(args, cwd);
  },
  getBranchStatus,
  addRemote,
  removeRemote,
};
