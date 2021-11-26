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

RED.deploy = (function () {
  const deploymentTypes = {
    full: { img: "red/images/deploy-full-o.svg" },
    nodes: { img: "red/images/deploy-nodes-o.svg" },
    flows: { img: "red/images/deploy-flows-o.svg" },
  };

  const ignoreDeployWarnings = {
    unknown: false,
    unusedConfig: false,
    invalid: false,
  };

  let deploymentType = "full";

  let deployInflight = false;

  let currentDiff = null;

  function changeDeploymentType(type) {
    deploymentType = type;
    $("#red-ui-header-button-deploy-icon").attr("src", deploymentTypes[type].img);
  }

  /**
   * options:
   *   type: "default" - Button with drop-down options - no further customisation available
   *   type: "simple"  - Button without dropdown. Customisations:
   *      label: the text to display - default: "Deploy"
   *      icon : the icon to use. Null removes the icon. default: "red/images/deploy-full-o.svg"
   */
  function init(options) {
    options = options || {};
    const type = options.type || "default";

    if (type == "default") {
      $(
        `${
          '<li><span class="red-ui-deploy-button-group button-group">' +
          '<a id="red-ui-header-button-deploy" class="red-ui-deploy-button disabled" href="#">' +
          '<span class="red-ui-deploy-button-content">' +
          '<img id="red-ui-header-button-deploy-icon" src="red/images/deploy-full-o.svg"> ' +
          "<span>"
        }${RED._("deploy.deploy")}</span>` +
          "</span>" +
          '<span class="red-ui-deploy-button-spinner hide">' +
          '<img src="red/images/spin.svg"/>' +
          "</span>" +
          "</a>" +
          '<a id="red-ui-header-button-deploy-options" class="red-ui-deploy-button" href="#"><i class="fa fa-caret-down"></i></a>' +
          "</span></li>",
      ).prependTo(".red-ui-header-toolbar");
      RED.menu.init({
        id: "red-ui-header-button-deploy-options",
        options: [
          {
            id: "deploymenu-item-full",
            toggle: "deploy-type",
            icon: "red/images/deploy-full.svg",
            label: RED._("deploy.full"),
            sublabel: RED._("deploy.fullDesc"),
            selected: true,
            onselect(s) {
              if (s) {
                changeDeploymentType("full");
              }
            },
          },
          {
            id: "deploymenu-item-flow",
            toggle: "deploy-type",
            icon: "red/images/deploy-flows.svg",
            label: RED._("deploy.modifiedFlows"),
            sublabel: RED._("deploy.modifiedFlowsDesc"),
            onselect(s) {
              if (s) {
                changeDeploymentType("flows");
              }
            },
          },
          {
            id: "deploymenu-item-node",
            toggle: "deploy-type",
            icon: "red/images/deploy-nodes.svg",
            label: RED._("deploy.modifiedNodes"),
            sublabel: RED._("deploy.modifiedNodesDesc"),
            onselect(s) {
              if (s) {
                changeDeploymentType("nodes");
              }
            },
          },
          null,
          {
            id: "deploymenu-item-reload",
            icon: "red/images/deploy-reload.svg",
            label: RED._("deploy.restartFlows"),
            sublabel: RED._("deploy.restartFlowsDesc"),
            onselect: "core:restart-flows",
          },
        ],
      });
    } else if (type == "simple") {
      const label = options.label || RED._("deploy.deploy");
      let icon = "red/images/deploy-full-o.svg";
      if (options.hasOwnProperty("icon")) {
        icon = options.icon;
      }

      $(
        `${
          '<li><span class="red-ui-deploy-button-group button-group">' +
          '<a id="red-ui-header-button-deploy" class="red-ui-deploy-button disabled" href="#">' +
          '<span class="red-ui-deploy-button-content">'
        }${
          icon ? `<img id="red-ui-header-button-deploy-icon" src="${icon}"> ` : ""
        }<span>${label}</span>` +
          "</span>" +
          '<span class="red-ui-deploy-button-spinner hide">' +
          '<img src="red/images/spin.svg"/>' +
          "</span>" +
          "</a>" +
          "</span></li>",
      ).prependTo(".red-ui-header-toolbar");
    }

    $("#red-ui-header-button-deploy").on("click", (event) => {
      event.preventDefault();
      save();
    });

    RED.actions.add("core:deploy-flows", save);
    if (type === "default") {
      RED.actions.add("core:restart-flows", restart);
      RED.actions.add("core:set-deploy-type-to-full", () => {
        RED.menu.setSelected("deploymenu-item-full", true);
      });
      RED.actions.add("core:set-deploy-type-to-modified-flows", () => {
        RED.menu.setSelected("deploymenu-item-flow", true);
      });
      RED.actions.add("core:set-deploy-type-to-modified-nodes", () => {
        RED.menu.setSelected("deploymenu-item-node", true);
      });
    }

    RED.events.on("workspace:dirty", (state) => {
      if (state.dirty) {
        window.onbeforeunload = function () {
          return RED._("deploy.confirm.undeployedChanges");
        };
        $("#red-ui-header-button-deploy").removeClass("disabled");
      } else {
        window.onbeforeunload = null;
        $("#red-ui-header-button-deploy").addClass("disabled");
      }
    });

    let activeNotifyMessage;
    RED.comms.subscribe("notification/runtime-deploy", (topic, msg) => {
      if (!activeNotifyMessage) {
        const currentRev = RED.nodes.version();
        if (currentRev === null || deployInflight || currentRev === msg.revision) {
          return;
        }
        const message = $("<p>").text(RED._("deploy.confirm.backgroundUpdate"));
        activeNotifyMessage = RED.notify(message, {
          modal: true,
          fixed: true,
          buttons: [
            {
              text: RED._("deploy.confirm.button.ignore"),
              click() {
                activeNotifyMessage.close();
                activeNotifyMessage = null;
              },
            },
            {
              text: RED._("deploy.confirm.button.review"),
              class: "primary",
              click() {
                activeNotifyMessage.close();
                const nns = RED.nodes.createCompleteNodeSet();
                resolveConflict(nns, false);
                activeNotifyMessage = null;
              },
            },
          ],
        });
      }
    });
  }

  function getNodeInfo(node) {
    let tabLabel = "";
    if (node.z) {
      let tab = RED.nodes.workspace(node.z);
      if (!tab) {
        tab = RED.nodes.subflow(node.z);
        tabLabel = tab.name;
      } else {
        tabLabel = tab.label;
      }
    }
    const label = RED.utils.getNodeLabel(node, node.id);
    return { tab: tabLabel, type: node.type, label };
  }
  function sortNodeInfo(A, B) {
    if (A.tab < B.tab) {
      return -1;
    }
    if (A.tab > B.tab) {
      return 1;
    }
    if (A.type < B.type) {
      return -1;
    }
    if (A.type > B.type) {
      return 1;
    }
    if (A.name < B.name) {
      return -1;
    }
    if (A.name > B.name) {
      return 1;
    }
    return 0;
  }

  function resolveConflict(currentNodes, activeDeploy) {
    const message = $("<div>");
    $('<p data-i18n="deploy.confirm.conflict"></p>').appendTo(message);
    const conflictCheck = $(
      '<div class="red-ui-deploy-dialog-confirm-conflict-row">' +
        '<img src="red/images/spin.svg"/><div data-i18n="deploy.confirm.conflictChecking"></div>' +
        "</div>",
    ).appendTo(message);
    const conflictAutoMerge = $(
      '<div class="red-ui-deploy-dialog-confirm-conflict-row">' +
        '<i class="fa fa-check"></i><div data-i18n="deploy.confirm.conflictAutoMerge"></div>' +
        "</div>",
    )
      .hide()
      .appendTo(message);
    const conflictManualMerge = $(
      '<div class="red-ui-deploy-dialog-confirm-conflict-row">' +
        '<i class="fa fa-exclamation"></i><div data-i18n="deploy.confirm.conflictManualMerge"></div>' +
        "</div>",
    )
      .hide()
      .appendTo(message);

    message.i18n();
    currentDiff = null;
    const buttons = [
      {
        text: RED._("common.label.cancel"),
        click() {
          conflictNotification.close();
        },
      },
      {
        id: "red-ui-deploy-dialog-confirm-deploy-review",
        text: RED._("deploy.confirm.button.review"),
        class: "primary disabled",
        click() {
          if (!$("#red-ui-deploy-dialog-confirm-deploy-review").hasClass("disabled")) {
            RED.diff.showRemoteDiff();
            conflictNotification.close();
          }
        },
      },
      {
        id: "red-ui-deploy-dialog-confirm-deploy-merge",
        text: RED._("deploy.confirm.button.merge"),
        class: "primary disabled",
        click() {
          if (!$("#red-ui-deploy-dialog-confirm-deploy-merge").hasClass("disabled")) {
            RED.diff.mergeDiff(currentDiff);
            conflictNotification.close();
          }
        },
      },
    ];
    if (activeDeploy) {
      buttons.push({
        id: "red-ui-deploy-dialog-confirm-deploy-overwrite",
        text: RED._("deploy.confirm.button.overwrite"),
        class: "primary",
        click() {
          save(true, activeDeploy);
          conflictNotification.close();
        },
      });
    }
    var conflictNotification = RED.notify(message, {
      modal: true,
      fixed: true,
      width: 600,
      buttons,
    });

    const now = Date.now();
    RED.diff.getRemoteDiff((diff) => {
      const ellapsed = Math.max(1000 - (Date.now() - now), 0);
      currentDiff = diff;
      setTimeout(() => {
        conflictCheck.hide();
        const d = Object.keys(diff.conflicts);
        if (d.length === 0) {
          conflictAutoMerge.show();
          $("#red-ui-deploy-dialog-confirm-deploy-merge").removeClass("disabled");
        } else {
          conflictManualMerge.show();
        }
        $("#red-ui-deploy-dialog-confirm-deploy-review").removeClass("disabled");
      }, ellapsed);
    });
  }
  function cropList(list) {
    if (list.length > 5) {
      const remainder = list.length - 5;
      list = list.slice(0, 5);
      list.push(RED._("deploy.confirm.plusNMore", { count: remainder }));
    }
    return list;
  }
  function sanitize(html) {
    return html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function restart() {
    const startTime = Date.now();
    $(".red-ui-deploy-button-content").css("opacity", 0);
    $(".red-ui-deploy-button-spinner").show();
    const deployWasEnabled = !$("#red-ui-header-button-deploy").hasClass("disabled");
    $("#red-ui-header-button-deploy").addClass("disabled");
    deployInflight = true;
    $("#red-ui-header-shade").show();
    $("#red-ui-editor-shade").show();
    $("#red-ui-palette-shade").show();
    $("#red-ui-sidebar-shade").show();

    $.ajax({
      url: "flows",
      type: "POST",
      headers: {
        "Node-RED-Deployment-Type": "reload",
      },
    })
      .done((data, textStatus, xhr) => {
        if (deployWasEnabled) {
          $("#red-ui-header-button-deploy").removeClass("disabled");
        }
        RED.notify(`<p>${RED._("deploy.successfulRestart")}</p>`, "success");
      })
      .fail((xhr, textStatus, err) => {
        if (deployWasEnabled) {
          $("#red-ui-header-button-deploy").removeClass("disabled");
        }
        if (xhr.status === 401) {
          RED.notify(
            RED._("deploy.deployFailed", { message: RED._("user.notAuthorized") }),
            "error",
          );
        } else if (xhr.status === 409) {
          resolveConflict(nns, true);
        } else if (xhr.responseText) {
          RED.notify(RED._("deploy.deployFailed", { message: xhr.responseText }), "error");
        } else {
          RED.notify(
            RED._("deploy.deployFailed", { message: RED._("deploy.errors.noResponse") }),
            "error",
          );
        }
      })
      .always(() => {
        deployInflight = false;
        const delta = Math.max(0, 300 - (Date.now() - startTime));
        setTimeout(() => {
          $(".red-ui-deploy-button-content").css("opacity", 1);
          $(".red-ui-deploy-button-spinner").hide();
          $("#red-ui-header-shade").hide();
          $("#red-ui-editor-shade").hide();
          $("#red-ui-palette-shade").hide();
          $("#red-ui-sidebar-shade").hide();
        }, delta);
      });
  }
  function save(skipValidation, force) {
    if (!$("#red-ui-header-button-deploy").hasClass("disabled")) {
      if (!RED.user.hasPermission("flows.write")) {
        RED.notify(RED._("user.errors.deploy"), "error");
        return;
      }
      if (!skipValidation) {
        let hasUnknown = false;
        let hasInvalid = false;
        var hasUnusedConfig = false;

        const unknownNodes = [];
        const invalidNodes = [];

        RED.nodes.eachNode((node) => {
          if (!node.valid && !node.d) {
            invalidNodes.push(getNodeInfo(node));
          }
          if (node.type === "unknown") {
            if (unknownNodes.indexOf(node.name) == -1) {
              unknownNodes.push(node.name);
            }
          }
        });
        hasUnknown = unknownNodes.length > 0;
        hasInvalid = invalidNodes.length > 0;

        const unusedConfigNodes = [];
        RED.nodes.eachConfig((node) => {
          if (node._def.hasUsers !== false && node.users.length === 0) {
            unusedConfigNodes.push(getNodeInfo(node));
            hasUnusedConfig = true;
          }
        });

        let showWarning = false;
        let notificationMessage;
        let notificationButtons = [];
        let notification;
        if (hasUnknown && !ignoreDeployWarnings.unknown) {
          showWarning = true;
          notificationMessage =
            `<p>${RED._("deploy.confirm.unknown")}</p>` +
            `<ul class="red-ui-deploy-dialog-confirm-list"><li>${cropList(unknownNodes)
              .map((n) => sanitize(n))
              .join("</li><li>")}</li></ul><p>${RED._("deploy.confirm.confirm")}</p>`;

          notificationButtons = [
            {
              id: "red-ui-deploy-dialog-confirm-deploy-deploy",
              text: RED._("deploy.confirm.button.confirm"),
              class: "primary",
              click() {
                save(true);
                notification.close();
              },
            },
          ];
        } else if (hasInvalid && !ignoreDeployWarnings.invalid) {
          showWarning = true;
          invalidNodes.sort(sortNodeInfo);

          notificationMessage =
            `<p>${RED._("deploy.confirm.improperlyConfigured")}</p>` +
            `<ul class="red-ui-deploy-dialog-confirm-list"><li>${cropList(
              invalidNodes.map((A) =>
                sanitize(`${(A.tab ? `[${A.tab}] ` : "") + A.label} (${A.type})`),
              ),
            ).join("</li><li>")}</li></ul><p>${RED._("deploy.confirm.confirm")}</p>`;
          notificationButtons = [
            {
              id: "red-ui-deploy-dialog-confirm-deploy-deploy",
              text: RED._("deploy.confirm.button.confirm"),
              class: "primary",
              click() {
                save(true);
                notification.close();
              },
            },
          ];
        }
        if (showWarning) {
          notificationButtons.unshift({
            text: RED._("common.label.cancel"),
            click() {
              notification.close();
            },
          });
          notification = RED.notify(notificationMessage, {
            modal: true,
            fixed: true,
            buttons: notificationButtons,
          });
          return;
        }
      }

      const nns = RED.nodes.createCompleteNodeSet();

      const startTime = Date.now();
      $(".red-ui-deploy-button-content").css("opacity", 0);
      $(".red-ui-deploy-button-spinner").show();
      $("#red-ui-header-button-deploy").addClass("disabled");

      const data = { flows: nns };

      if (!force) {
        data.rev = RED.nodes.version();
      }

      deployInflight = true;
      $("#red-ui-header-shade").show();
      $("#red-ui-editor-shade").show();
      $("#red-ui-palette-shade").show();
      $("#red-ui-sidebar-shade").show();
      $.ajax({
        url: "flows",
        type: "POST",
        data: JSON.stringify(data),
        contentType: "application/json; charset=utf-8",
        headers: {
          Authorization: `Bearer ${StorageService.getToken()}`,
          "Node-RED-Deployment-Type": deploymentType,
          "Content-Type": "application/json",
        },
      })
        .done((data, textStatus, xhr) => {
          RED.nodes.dirty(false);
          RED.nodes.version(data.rev);
          RED.nodes.originalFlow(nns);
          if (hasUnusedConfig) {
            RED.notify(
              `<p>${RED._("deploy.successfulDeploy")}</p>` +
                `<p>${RED._(
                  "deploy.unusedConfigNodes",
                )} <a href="#" onclick="RED.sidebar.config.show(true); return false;">${RED._(
                  "deploy.unusedConfigNodesLink",
                )}</a></p>`,
              "success",
              false,
              6000,
            );
          } else {
            RED.notify(`<p>${RED._("deploy.successfulDeploy")}</p>`, "success");
          }
          RED.nodes.eachNode((node) => {
            if (node.changed) {
              node.dirty = true;
              node.changed = false;
            }
            if (node.moved) {
              node.dirty = true;
              node.moved = false;
            }
            if (node.credentials) {
              delete node.credentials;
            }
          });
          RED.nodes.eachConfig((confNode) => {
            confNode.changed = false;
            if (confNode.credentials) {
              delete confNode.credentials;
            }
          });
          RED.nodes.eachSubflow((subflow) => {
            subflow.changed = false;
          });
          RED.nodes.eachWorkspace((ws) => {
            ws.changed = false;
          });
          // Once deployed, cannot undo back to a clean state
          RED.history.markAllDirty();
          RED.view.redraw();
          RED.events.emit("deploy");
        })
        .fail((xhr, textStatus, err) => {
          RED.nodes.dirty(true);
          $("#red-ui-header-button-deploy").removeClass("disabled");
          if (xhr.status === 401) {
            RED.notify(
              RED._("deploy.deployFailed", { message: RED._("user.notAuthorized") }),
              "error",
            );
          } else if (xhr.status === 409) {
            resolveConflict(nns, true);
          } else if (xhr.responseText) {
            RED.notify(RED._("deploy.deployFailed", { message: xhr.responseText }), "error");
          } else {
            RED.notify(
              RED._("deploy.deployFailed", { message: RED._("deploy.errors.noResponse") }),
              "error",
            );
          }
        })
        .always(() => {
          deployInflight = false;
          const delta = Math.max(0, 300 - (Date.now() - startTime));
          setTimeout(() => {
            $(".red-ui-deploy-button-content").css("opacity", 1);
            $(".red-ui-deploy-button-spinner").hide();
            $("#red-ui-header-shade").hide();
            $("#red-ui-editor-shade").hide();
            $("#red-ui-palette-shade").hide();
            $("#red-ui-sidebar-shade").hide();
          }, delta);
        });
    }
  }
  return {
    init,
    setDeployInflight(state) {
      deployInflight = state;
    },
  };
})();
