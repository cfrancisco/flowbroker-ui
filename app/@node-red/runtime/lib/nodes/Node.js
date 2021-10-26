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

const util = require("util");
const { EventEmitter } = require("events");

const redUtil = require("@node-red/util").util;
const Log = require("@node-red/util").log;
const { hooks } = require("@node-red/util");
const context = require("./context");
const flows = require("../flows");

const NOOP_SEND = function () {};

/**
 * The Node object is the heart of a Node-RED flow. It is the object that all
 * nodes extend.
 *
 * The Node object itself inherits from EventEmitter, although it provides
 * custom implementations of some of the EE functions in order to handle
 * `input` and `close` events properly.
 */
function Node(n) {
  this.id = n.id;
  this.type = n.type;
  this.z = n.z;
  this._closeCallbacks = [];
  this._inputCallback = null;
  this._inputCallbacks = null;

  if (n.name) {
    this.name = n.name;
  }
  if (n._alias) {
    this._alias = n._alias;
  }
  if (n._flow) {
    // Make this a non-enumerable property as it may cause
    // circular references. Any existing code that tries to JSON serialise
    // the object (such as dashboard) will not like circular refs
    // The value must still be writable in the case that a node does:
    //     Object.assign(this,config)
    // as part of its constructor - config._flow will overwrite this._flow
    // which we can tolerate as they are the same object.
    Object.defineProperty(this, "_flow", { value: n._flow, enumerable: false, writable: true });
  }
  this.updateWires(n.wires);
}

util.inherits(Node, EventEmitter);

/**
 * Update the wiring configuration for this node.
 *
 * We try to optimise the message handling path. To do this there are three
 * cases to consider:
 *  1. this node is wired to nothing. In this case we replace node.send with a
 *     NO-OP function.
 *  2. this node is wired to one other node. In this case we set `this._wire`
 *     as a reference to the node it is wired to. This means we avoid unnecessary
 *     iterations over what would otherwise be a 1-element array.
 *  3. this node is wired to multiple things. The normal node.send processing of
 *     this.wires applies.
 *
 * @param  {array} wires the new wiring configuration
 */
Node.prototype.updateWires = function (wires) {
  // console.log("UPDATE",this.id);
  this.wires = wires || [];
  delete this._wire;

  let wc = 0;
  this.wires.forEach((w) => {
    wc += w.length;
  });
  this._wireCount = wc;
  if (wc === 0) {
    // With nothing wired to the node, no-op send
    this.send = NOOP_SEND;
  } else {
    this.send = Node.prototype.send;
    if (this.wires.length === 1 && this.wires[0].length === 1) {
      // Single wire, so we can shortcut the send when
      // a single message is sent
      this._wire = this.wires[0][0];
    }
  }
};
/**
 * Get the context object for this node.
 *
 * As most nodes do not use context, this is a lazy function that will only
 * create a context instance for the node if it is needed.
 * @return {object} the context object
 */
Node.prototype.context = function () {
  if (!this._context) {
    this._context = context.get(this._alias || this.id, this.z);
  }
  return this._context;
};

/**
 * Handle the complete event for a message
 *
 * @param  {object} msg  The message that has completed
 * @param  {error} error (optional) an error hit whilst handling the message
 */
Node.prototype._complete = function (msg, error) {
  this.metric("done", msg);
  hooks.trigger("onComplete", { msg, error, node: { id: this.id, node: this } }, (err) => {
    if (err) {
      this.error(err);
    }
  });
  if (error) {
    // For now, delegate this to this.error
    // But at some point, the timeout handling will need to know about
    // this as well.
    this.error(error, msg);
  } else {
    this._flow.handleComplete(this, msg);
  }
};

/**
 * An internal reference to the original EventEmitter.on() function
 */
Node.prototype._on = Node.prototype.on;

/**
 * Register a callback function for a named event.
 * 'close' and 'input' events are handled locally, other events defer to EventEmitter.on()
 */
Node.prototype.on = function (event, callback) {
  const node = this;
  if (event == "close") {
    this._closeCallbacks.push(callback);
  } else if (event === "input") {
    if (this._inputCallback) {
      this._inputCallbacks = [this._inputCallback, callback];
      this._inputCallback = null;
    } else if (this._inputCallbacks) {
      this._inputCallbacks.push(callback);
    } else {
      this._inputCallback = callback;
    }
  } else {
    this._on(event, callback);
  }
};

/**
 * An internal reference to the original EventEmitter.emit() function
 */
Node.prototype._emit = Node.prototype.emit;

/**
 * Emit an event to all registered listeners.
 */
Node.prototype.emit = function (event, ...args) {
  const node = this;
  if (event === "input") {
    this._emitInput.apply(this, args);
  } else {
    this._emit.apply(this, arguments);
  }
};

/**
 * Handle the 'input' event.
 *
 * This will call all registered handlers for the 'input' event.
 */
Node.prototype._emitInput = function (arg) {
  const node = this;
  this.metric("receive", arg);
  const receiveEvent = { msg: arg, destination: { id: this.id, node: this } };
  // onReceive - a node is about to receive a message
  hooks.trigger("onReceive", receiveEvent, (err) => {
    if (err) {
      node.error(err);
    } else if (err !== false) {
      if (node._inputCallback) {
        // Just one callback registered.
        try {
          node._inputCallback(
            arg,
            function () {
              node.send.apply(node, arguments);
            },
            (err) => {
              node._complete(arg, err);
            },
          );
        } catch (err) {
          node.error(err, arg);
        }
      } else if (node._inputCallbacks) {
        // Multiple callbacks registered. Call each one, tracking eventual completion
        let c = node._inputCallbacks.length;
        for (let i = 0; i < c; i++) {
          const cb = node._inputCallbacks[i];
          if (cb.length === 2) {
            c++;
          }
          try {
            cb.call(
              node,
              arg,
              function () {
                node.send.apply(node, arguments);
              },
              (err) => {
                c--;
                if (c === 0) {
                  node._complete(arg, err);
                }
              },
            );
          } catch (err) {
            node.error(err, arg);
          }
        }
      }
      // postReceive - the message has been passed to the node's input handler
      hooks.trigger("postReceive", receiveEvent, (err) => {
        if (err) {
          node.error(err);
        }
      });
    }
  });
};

/**
 * An internal reference to the original EventEmitter.removeListener() function
 */
Node.prototype._removeListener = Node.prototype.removeListener;

/**
 * Remove a listener for an event
 */
Node.prototype.removeListener = function (name, listener) {
  let index;
  if (name === "input") {
    if (this._inputCallback && this._inputCallback === listener) {
      // Removing the only callback
      this._inputCallback = null;
    } else if (this._inputCallbacks) {
      // Removing one of many callbacks
      index = this._inputCallbacks.indexOf(listener);
      if (index > -1) {
        this._inputCallbacks.splice(index, 1);
      }
      // Check if we can optimise back to a single callback
      if (this._inputCallbacks.length === 1) {
        this._inputCallback = this._inputCallbacks[0];
        this._inputCallbacks = null;
      }
    }
  } else if (name === "close") {
    index = this._closeCallbacks.indexOf(listener);
    if (index > -1) {
      this._closeCallbacks.splice(index, 1);
    }
  } else {
    this._removeListener(name, listener);
  }
};

/**
 * An internal reference to the original EventEmitter.removeAllListeners() function
 */
Node.prototype._removeAllListeners = Node.prototype.removeAllListeners;

/**
 * Remove all listeners for an event
 */
Node.prototype.removeAllListeners = function (name) {
  if (name === "input") {
    this._inputCallback = null;
    this._inputCallbacks = null;
  } else if (name === "close") {
    this._closeCallbacks = [];
  } else {
    this._removeAllListeners(name);
  }
};

/**
 * Called when the node is being stopped
 * @param  {boolean} removed Whether the node has been removed, or just being stopped
 * @return {Promise} resolves when the node has closed
 */
Node.prototype.close = function (removed) {
  // console.log(this.type,this.id,removed);
  const promises = [];
  const node = this;
  // Call all registered close callbacks.
  for (let i = 0; i < this._closeCallbacks.length; i++) {
    var callback = this._closeCallbacks[i];
    if (callback.length > 0) {
      // The callback takes a 'done' callback and (maybe) the removed flag
      promises.push(
        new Promise((resolve) => {
          try {
            const args = [];
            if (callback.length === 2) {
              // The listener expects the removed flag
              args.push(!!removed);
            }
            args.push(() => {
              resolve();
            });
            callback.apply(node, args);
          } catch (err) {
            // TODO: error thrown in node async close callback
            // We've never logged this properly.
            resolve();
          }
        }),
      );
    } else {
      // No done callback so handle synchronously
      try {
        callback.call(node);
      } catch (err) {
        // TODO: error thrown in node sync close callback
        // We've never logged this properly.
      }
    }
  }
  if (promises.length > 0) {
    return Promise.all(promises).then(() => {
      this.removeAllListeners("input");
      if (this._context) {
        return context.delete(this._alias || this.id, this.z);
      }
    });
  }
  this.removeAllListeners("input");
  if (this._context) {
    return context.delete(this._alias || this.id, this.z);
  }
  return Promise.resolve();
};

/**
 * Send a message to the nodes wired.
 *
 *
 * @param  {object} msg A message or array of messages to send
 */
Node.prototype.send = function (msg) {
  let msgSent = false;
  let node;

  if (msg === null || typeof msg === "undefined") {
    return;
  }
  if (!util.isArray(msg)) {
    if (this._wire) {
      // A single message and a single wire on output 0
      // TODO: pre-load flows.get calls - cannot do in constructor
      //       as not all nodes are defined at that point
      if (!msg._msgid) {
        msg._msgid = redUtil.generateId();
      }
      this.metric("send", msg);
      this._flow.send([
        {
          msg,
          source: {
            id: this.id,
            node: this,
            port: 0,
          },
          destination: {
            id: this._wire,
            node: undefined,
          },
          cloneMessage: false,
        },
      ]);
      return;
    }
    msg = [msg];
  }

  const numOutputs = this.wires.length;

  // Build a list of send events so that all cloning is done before
  // any calls to node.receive
  const sendEvents = [];

  let sentMessageId = null;
  let hasMissingIds = false;
  // for each output of node eg. [msgs to output 0, msgs to output 1, ...]
  for (var i = 0; i < numOutputs; i++) {
    const wires = this.wires[i]; // wires leaving output i
    /* istanbul ignore else */
    if (i < msg.length) {
      let msgs = msg[i]; // msgs going to output i
      if (msgs !== null && typeof msgs !== "undefined") {
        if (!util.isArray(msgs)) {
          msgs = [msgs];
        }
        let k = 0;
        // for each recipent node of that output
        for (let j = 0; j < wires.length; j++) {
          // for each msg to send eg. [[m1, m2, ...], ...]
          for (k = 0; k < msgs.length; k++) {
            const m = msgs[k];
            if (m !== null && m !== undefined) {
              if (!m._msgid) {
                hasMissingIds = true;
              }
              /* istanbul ignore else */
              if (!sentMessageId) {
                sentMessageId = m._msgid;
              }
              sendEvents.push({
                msg: m,
                source: {
                  id: this.id,
                  node: this,
                  port: i,
                },
                destination: {
                  id: wires[j],
                  node: undefined,
                },
                cloneMessage: msgSent,
              });
              msgSent = true;
            }
          }
        }
      }
    }
  }
  /* istanbul ignore else */
  if (!sentMessageId) {
    sentMessageId = redUtil.generateId();
  }
  this.metric("send", { _msgid: sentMessageId });

  if (hasMissingIds) {
    for (i = 0; i < sendEvents.length; i++) {
      const ev = sendEvents[i];
      /* istanbul ignore else */
      if (!ev.msg._msgid) {
        ev.msg._msgid = sentMessageId;
      }
    }
  }
  this._flow.send(sendEvents);
};

/**
 * Receive a message.
 *
 * This will emit the `input` event with the provided message.
 */
Node.prototype.receive = function (msg) {
  if (!msg) {
    msg = {};
  }
  if (!msg._msgid) {
    msg._msgid = redUtil.generateId();
  }
  this.emit("input", msg);
};

function log_helper(self, level, msg) {
  const o = {
    level,
    id: self.id,
    type: self.type,
    msg,
  };
  if (self._alias) {
    o._alias = self._alias;
  }

  if (self.z) {
    o.z = self.z;
  }
  if (self.name) {
    o.name = self.name;
  }
  self._flow.log(o);
}
/**
 * Log an INFO level message
 */
Node.prototype.log = function (msg) {
  log_helper(this, Log.INFO, msg);
};

/**
 * Log a WARN level message
 */
Node.prototype.warn = function (msg) {
  log_helper(this, Log.WARN, msg);
};

/**
 * Log an ERROR level message
 */
Node.prototype.error = function (logMessage, msg) {
  if (typeof logMessage !== "boolean") {
    logMessage = logMessage || "";
  }
  let handled = false;
  if (msg && typeof msg === "object") {
    handled = this._flow.handleError(this, logMessage, msg);
  }
  if (!handled) {
    log_helper(this, Log.ERROR, logMessage);
  }
};

/**
 * Log an DEBUG level message
 */
Node.prototype.debug = function (msg) {
  log_helper(this, Log.DEBUG, msg);
};

/**
 * Log an TRACE level message
 */
Node.prototype.trace = function (msg) {
  log_helper(this, Log.TRACE, msg);
};

/**
 * Log a metric event.
 * If called with no args, returns whether metric collection is enabled
 */
Node.prototype.metric = function (eventname, msg, metricValue) {
  if (typeof eventname === "undefined") {
    return Log.metric();
  }
  const metrics = {};
  metrics.level = Log.METRIC;
  metrics.nodeid = this.id;
  metrics.event = `node.${this.type}.${eventname}`;
  metrics.msgid = msg._msgid;
  metrics.value = metricValue;
  Log.log(metrics);
};

/**
 * Set the node's status object
 *
 * status: { fill:"red|green", shape:"dot|ring", text:"blah" }
 * or
 * status: "simple text status"
 */
Node.prototype.status = function (status) {
  switch (typeof status) {
    case "string":
    case "number":
    case "boolean":
      status = { text: `${status}` };
  }
  this._flow.handleStatus(this, status);
};

module.exports = Node;
