/**
 * Internal repository for editor-api service.
 * @class
 */
class RepoEditorApi {
  constructor() {
    this._adminApp = null;
    this._server = null;
    this._editor = null;
    this._tenant = null;
    return this;
  }

  get adminApp() {
    return this._adminApp;
  }

  get server() {
    return this._server;
  }

  get editor() {
    return this._editor;
  }

  get tenant() {
    return this._tenant;
  }

  set editor(val) {
    this._editor = val;
  }

  set adminApp(val) {
    this._adminApp = val;
  }

  set server(val) {
    this._server = val;
  }

  set tenant(val) {
    this._tenant = val;
  }
}

module.exports = RepoEditorApi;
