/**
 * Internal repository for lib-red service.
 * @class
 */
class RepoLibRed {
  constructor() {
    this._apiEnabled = null;
    this._server = null;
    this._runtime = {};
    this._tenant = null;
    return this;
  }

  get apiEnabled() {
    return this._apiEnabled;
  }

  get server() {
    return this._server;
  }

  get runtime() {
    return this._runtime;
  }

  get tenant() {
    return this._tenant;
  }

  get instanceId() {
    return this._instanceId;
  }

  set instanceId(val) {
    this._instanceId = val;
  }

  set runtime(val) {
    this._runtime = val;
  }

  set apiEnabled(val) {
    this._apiEnabled = val;
  }

  set server(val) {
    this._server = val;
  }

  set tenant(val) {
    this._tenant = val;
  }
}

module.exports = RepoLibRed;
