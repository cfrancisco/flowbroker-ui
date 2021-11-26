/**
 * Converting NodeRed's Flows to Dojot's Flows
 * @method castFlowsToDojot
 * @param {Object} auxiliarStorage Tenant-specific storage for Flows
 * @param {Array} flows NodeRed's Flows
 */
const castFlowsToDojot = (auxiliarStorage, flows) => {
  const flowsElements = JSON.parse(JSON.stringify(auxiliarStorage));
  flows.forEach((flow) => {
    // for other nodes (always have a parent node (z))
    if (flow.z !== undefined) {
      flowsElements[flow.z].flow.push(flow);
      return;
    }

    // for tab node
    if (flowsElements[flow.id] === undefined) {
      // new flow and new tab node
      flowsElements[flow.id] = {};
      flowsElements[flow.id].flow = [];
      flowsElements[flow.id].name = flow.label;
      flowsElements[flow.id].isNew = true;
      flowsElements[flow.id].flow.push(flow);
    } else {
      // already created flow
      flowsElements[flow.id].flow.push(flow);
      flowsElements[flow.id].name = flow.label;
      flowsElements[flow.id].shouldBeDeleted = false;
    }
  });
  return Object.values(flowsElements);
};

/**
 * Converting Dojot's Flows to NodeRed's Flows
 *
 * @param {Array} flows Dojot's Flows
 */
const castDojotToFlows = (auxiliarStorage, flows) => {
  const myFlows = [];
  flows.forEach((flow) => {
    const flowName = flow.name;
    const flowList = JSON.parse(JSON.stringify(flow.flow));
    // if there's no nodes in the flow
    if (flowList.length === 0) return;

    flowList[0].label = flowName;
    // it's tab node
    auxiliarStorage[flowList[0].id] = {
      name: flowName,
      created: flow.created,
      enabled: flow.enabled,
      id: flow.id,
      flow: [],
      isNew: false,
      shouldBeDeleted: true,
    };

    myFlows.push(...flowList);
  });

  return myFlows;
};

module.exports = { castFlowsToDojot, castDojotToFlows };
