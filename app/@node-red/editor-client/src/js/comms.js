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

RED.comms = (function () {
  let errornotification = null;
  let clearErrorTimer = null;
  let connectCountdownTimer = null;
  let connectCountdown = 10;
  const subscriptions = {};
  let ws;
  let pendingAuth = false;
  let reconnectAttempts = 0;
  let active = false;

  function connectWS() {
    active = true;
    let wspath;

    if (RED.settings.apiRootUrl) {
      const m = /^(https?):\/\/(.*)$/.exec(RED.settings.apiRootUrl);
      if (m) {
        console.log(m);
        wspath = `ws${m[1] === "https" ? "s" : ""}://${m[2]}comms`;
      }
    } else {
      let path = location.hostname;
      const { port } = location;
      // const port = 7000;
      if (port.length !== 0) {
        path = `${path}:${port}`;
      }
      path += document.location.pathname;
      path = `${path + (path.slice(-1) == "/" ? "" : "/")}comms`;
      wspath = `ws${document.location.protocol == "https:" ? "s" : ""}://${path}`;
    }

    const auth_tokens = RED.settings.get("auth-tokens");
    pendingAuth = auth_tokens != null;

    function completeConnection() {
      for (const t in subscriptions) {
        if (subscriptions.hasOwnProperty(t)) {
          ws.send(JSON.stringify({ subscribe: t }));
        }
      }
    }

    ws = new WebSocket(wspath);
    ws.onopen = function () {
      reconnectAttempts = 0;
      if (errornotification) {
        clearErrorTimer = setTimeout(() => {
          errornotification.close();
          errornotification = null;
        }, 1000);
      }
      if (pendingAuth) {
        ws.send(JSON.stringify({ auth: auth_tokens.access_token }));
      } else {
        completeConnection();
      }
    };
    ws.onmessage = function (event) {
      const message = JSON.parse(event.data);
      if (message.auth) {
        if (pendingAuth) {
          if (message.auth === "ok") {
            pendingAuth = false;
            completeConnection();
          } else if (message.auth === "fail") {
            // anything else is an error...
            active = false;
            RED.user.login({ updateMenu: true }, () => {
              connectWS();
            });
          }
        } else if (message.auth === "fail") {
          // Our current session has expired
          active = false;
          RED.user.login({ updateMenu: true }, () => {
            connectWS();
          });
        }
      } else {
        // Otherwise, 'message' is an array of actual comms messages
        for (let m = 0; m < message.length; m++) {
          const msg = message[m];
          if (msg.topic) {
            for (const t in subscriptions) {
              if (subscriptions.hasOwnProperty(t)) {
                const re = new RegExp(
                  `^${t
                    .replace(/([\[\]\?\(\)\\\\$\^\*\.|])/g, "\\$1")
                    .replace(/\+/g, "[^/]+")
                    .replace(/\/#$/, "(/.*)?")}$`,
                );
                if (re.test(msg.topic)) {
                  const subscribers = subscriptions[t];
                  if (subscribers) {
                    for (let i = 0; i < subscribers.length; i++) {
                      subscribers[i](msg.topic, msg.data);
                    }
                  }
                }
              }
            }
          }
        }
      }
    };
    ws.onclose = function () {
      if (!active) {
        return;
      }
      if (clearErrorTimer) {
        clearTimeout(clearErrorTimer);
        clearErrorTimer = null;
      }
      reconnectAttempts++;
      if (reconnectAttempts < 10) {
        setTimeout(connectWS, 1000);
        if (reconnectAttempts > 5 && errornotification == null) {
          errornotification = RED.notify(
            RED._("notification.errors.lostConnection"),
            "error",
            true,
          );
        }
      } else if (reconnectAttempts < 20) {
        setTimeout(connectWS, 2000);
      } else {
        connectCountdown = 60;
        connectCountdownTimer = setInterval(() => {
          connectCountdown--;
          if (connectCountdown === 0) {
            errornotification.update(RED._("notification.errors.lostConnection"));
            clearInterval(connectCountdownTimer);
            connectWS();
          } else {
            const msg = `${RED._("notification.errors.lostConnectionReconnect", {
              time: connectCountdown,
            })} <a href="#">${RED._("notification.errors.lostConnectionTry")}</a>`;
            errornotification.update(msg, { silent: true });
            $(errornotification)
              .find("a")
              .on("click", (e) => {
                e.preventDefault();
                errornotification.update(RED._("notification.errors.lostConnection"), {
                  silent: true,
                });
                clearInterval(connectCountdownTimer);
                connectWS();
              });
          }
        }, 1000);
      }
    };
  }

  function subscribe(topic, callback) {
    if (subscriptions[topic] == null) {
      subscriptions[topic] = [];
    }
    subscriptions[topic].push(callback);
    if (ws && ws.readyState == 1) {
      ws.send(JSON.stringify({ subscribe: topic }));
    }
  }

  function unsubscribe(topic, callback) {
    if (subscriptions[topic]) {
      for (let i = 0; i < subscriptions[topic].length; i++) {
        if (subscriptions[topic][i] === callback) {
          subscriptions[topic].splice(i, 1);
          break;
        }
      }
      if (subscriptions[topic].length === 0) {
        delete subscriptions[topic];
      }
    }
  }

  return {
    connect: connectWS,
    subscribe,
    unsubscribe,
  };
})();
