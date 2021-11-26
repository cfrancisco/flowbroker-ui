module.exports = function (RED) {
  function GenericNode(n) {
    RED.nodes.createNode(this, n);
    this.name = n.name;
  }

  RED.nodes.registerType("event device in", GenericNode);
};
