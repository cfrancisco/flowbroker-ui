/* Internal Repository for runtime  */
class RepoFlows {
  constructor() {
    this._activeConfig = null;
    this._activeFlowConfig = null;
    this._activeFlows = {};
    this._tenant = null;
    this._started = false;
    this._activeNodesToFlow = {};
    this._typeEventRegistered = false;
    return this;
  }

  get activeConfig() {
    return this._activeConfig;
  }

  get activeFlowConfig() {
    return this._activeFlowConfig;
  }

  get activeFlows() {
    return this._activeFlows;
  }

  get tenant() {
    return this._tenant;
  }

  get instanceId() {
    return this._instanceId;
  }

  get started() {
    return this._started;
  }

  get activeNodesToFlow() {
    return this._activeNodesToFlow;
  }

  set activeNodesToFlow(val) {
    this._activeNodesToFlow = val;
  }

  get typeEventRegistered() {
    return this._typeEventRegistered;
  }

  set typeEventRegistered(val) {
    this._typeEventRegistered = val;
  }

  set started(val) {
    this._started = val;
  }

  set instanceId(val) {
    this._instanceId = val;
  }

  set activeFlows(val) {
    this._activeFlows = val;
  }

  set activeConfig(val) {
    this._activeConfig = val;
  }

  set activeFlowConfig(val) {
    this._activeFlowConfig = val;
  }

  set tenant(val) {
    this._tenant = val;
  }
}

module.exports = RepoFlows;
