const ws = require("ws");
const url = require("url");
const crypto = require("crypto");

const { log } = require("@node-red/util");
const MainStorage = require("../../../../repository/MainStorage");

let Tokens;
let Users;
let Permissions;
let Strategies;

let server;
let settings;
let runtimeAPI;

let wsServer;
const activeConnections = [];

let anonymousUser;

let heartbeatTimer;
let lastSentTime;
function init(_server, _settings, _runtimeAPI) {
  server = _server;
  settings = _settings;
  runtimeAPI = _runtimeAPI;
  Tokens = require("../auth/tokens");
  Tokens.onSessionExpiry(handleSessionExpiry);
  Users = require("../auth/users");
  Permissions = require("../auth/permissions");
  Strategies = require("../auth/strategies");
}

function handleSessionExpiry(session) {
  activeConnections.forEach((connection) => {
    if (connection.token === session.accessToken) {
      connection.ws.send(JSON.stringify({ auth: "fail" }));
      connection.ws.close();
    }
  });
}

function CommsConnection(ws, user) {
  this.session = crypto.randomBytes(32).toString("base64");
  this.ws = ws;
  this.stack = [];
  this.user = user;
  this.lastSentTime = 0;
  const self = this;

  log.audit({ event: "comms.open" });
  log.trace(`comms.open ${self.session}`);
  const preAuthed = !!user;
  let pendingAuth = !this.user && settings.adminAuth != null;

  if (!pendingAuth) {
    addActiveConnection(self);
  }
  ws.on("close", () => {
    log.audit({ event: "comms.close", user: self.user, session: self.session });
    log.trace(`comms.close ${self.session}`);
    removeActiveConnection(self);
  });
  ws.on("message", (data, flags) => {
    let msg = null;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      log.trace(`comms received malformed message : ${err.toString()}`);
      return;
    }
    if (!pendingAuth) {
      if (msg.subscribe) {
        self.subscribe(msg.subscribe);
        // handleRemoteSubscription(ws,msg.subscribe);
      }
    } else {
      const completeConnection = function (userScope, session, sendAck) {
        try {
          if (!userScope || !Permissions.hasPermission(userScope, "status.read")) {
            ws.send(JSON.stringify({ auth: "fail" }));
            ws.close();
          } else {
            pendingAuth = false;
            addActiveConnection(self);
            self.token = msg.auth;
            if (sendAck) {
              ws.send(JSON.stringify({ auth: "ok" }));
            }
          }
        } catch (err) {
          console.log(err.stack);
          // Just in case the socket closes before we attempt
          // to send anything.
        }
      };
      if (msg.auth) {
        Tokens.get(msg.auth).then((client) => {
          if (client) {
            Users.get(client.user).then((user) => {
              if (user) {
                self.user = user;
                log.audit({ event: "comms.auth", user: self.user });
                completeConnection(client.scope, msg.auth, true);
              } else {
                log.audit({ event: "comms.auth.fail" });
                completeConnection(null, null, false);
              }
            });
          } else {
            Users.tokens(msg.auth).then((user) => {
              if (user) {
                self.user = user;
                log.audit({ event: "comms.auth", user: self.user });
                completeConnection(user.permissions, msg.auth, true);
              } else {
                log.audit({ event: "comms.auth.fail" });
                completeConnection(null, null, false);
              }
            });
          }
        });
      } else if (anonymousUser) {
        log.audit({ event: "comms.auth", user: anonymousUser });
        self.user = anonymousUser;
        completeConnection(anonymousUser.permissions, null, false);
        // TODO: duplicated code - pull non-auth message handling out
        if (msg.subscribe) {
          self.subscribe(msg.subscribe);
        }
      } else {
        log.audit({ event: "comms.auth.fail" });
        completeConnection(null, null, false);
      }
    }
  });
  ws.on("error", (err) => {
    log.warn(log._("comms.error", { message: err.toString() }));
  });
}

CommsConnection.prototype.send = function (topic, data) {
  if (topic && data) {
    this.stack.push({ topic, data });
  }
  this._queueSend();
};
CommsConnection.prototype._queueSend = function () {
  const self = this;
  if (!this._xmitTimer) {
    this._xmitTimer = setTimeout(() => {
      try {
        self.ws.send(JSON.stringify(self.stack.splice(0, 50)));
        self.lastSentTime = Date.now();
      } catch (err) {
        removeActiveConnection(self);
        log.warn(log._("comms.error-send", { message: err.toString() }));
      }
      delete self._xmitTimer;
      if (self.stack.length > 0) {
        self._queueSend();
      }
    }, 50);
  }
};

CommsConnection.prototype.subscribe = function (topic) {
  runtimeAPI.comms.subscribe({
    user: this.user,
    client: this,
    topic,
  });
};

function start() {
  if (!settings.disableEditor) {
    Users.default().then((_anonymousUser) => {
      anonymousUser = _anonymousUser;
      const webSocketKeepAliveTime = settings.webSocketKeepAliveTime || 15000;
      const commsPath = `${server.mountpath}/comms`;

      wsServer = new ws.Server({ noServer: true });

      wsServer.on("connection", (ws, request, user) => {
        const commsConnection = new CommsConnection(ws, user);
      });
      wsServer.on("error", (err) => {
        log.warn(log._("comms.error-server", { message: err.toString() }));
      });
      wsServer.on("close", () => {
        MainStorage.closeConnection(server.mountpath);
      });

      MainStorage.webSocketServer.on("upgrade", (request, socket, head) => {
        const { pathname } = url.parse(request.url);
        if (pathname === commsPath) {
          if (Users.tokenHeader() !== null && request.headers[Users.tokenHeader()]) {
            // The user has provided custom token handling. For the websocket,
            // the token could be provided in two ways:
            //  - as an http header (only possible with a reverse proxy setup)
            //  - passed over the connected websock in an auth packet
            // If the header is present, verify the token. If not, use the auth
            // packet over the connected socket
            //
            Strategies.authenticateUserToken(request)
              .then((user) => {
                wsServer.handleUpgrade(request, socket, head, (ws) => {
                  wsServer.emit("connection", ws, request, user);
                });
              })
              .catch((err) => {
                log.audit({ event: "comms.auth.fail" });
                socket.destroy();
              });
            return;
          }
          if (!MainStorage.isTenantConnected(server.mountpath)) {
            MainStorage.setConnected(server.mountpath);
            wsServer.handleUpgrade(request, socket, head, (ws) => {
              wsServer.emit("connection", ws, request, null);
            });
          }
        }
        // Don't destroy the socket as other listeners may want to handle the
        // event.
      });

      lastSentTime = Date.now();

      heartbeatTimer = setInterval(() => {
        const now = Date.now();
        if (now - lastSentTime > webSocketKeepAliveTime) {
          activeConnections.forEach((connection) => connection.send("hb", lastSentTime));
        }
      }, webSocketKeepAliveTime);
    });
  }
}

function stop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (wsServer) {
    wsServer.close();
    MainStorage.closeConnection(server.mountpath);
    wsServer = null;
  }
}

function addActiveConnection(connection) {
  activeConnections.push(connection);
  runtimeAPI.comms.addConnection({ client: connection });
}
function removeActiveConnection(connection) {
  for (let i = 0; i < activeConnections.length; i++) {
    if (activeConnections[i] === connection) {
      activeConnections.splice(i, 1);
      runtimeAPI.comms.removeConnection({ client: connection });
      break;
    }
  }
}

module.exports = {
  init,
  start,
  stop,
};
