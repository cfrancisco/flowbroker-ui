/* eslint-disable no-undef */
const DojotService = {
  requestToken() {
    if (!StorageService.isAuthenticated()) {
      // TODO should we redirect the user?
      return null;
    }
    return StorageService.getToken();
  },
  async getDevices(params = "") {
    try {
      const token = DojotService.requestToken();
      if (!token) return [];
      const config = {
        accept: "application/json",
        headers: { Authorization: `Bearer ${token}` },
      };
      return axios.get(`${dojotConfig.host}/device${params}`, config);
    } catch (err) {
      console.error(`Call Http.service - Requesting error: ${err.toString()}`);
      return [];
    }
  },
  async getTemplates(params = "") {
    try {
      const token = DojotService.requestToken();
      if (!token) return [];
      const config = {
        accept: "application/json",
        headers: { Authorization: `Bearer ${token}` },
      };
      return axios.get(`${dojotConfig.host}/template${params}`, config);
    } catch (err) {
      console.error(`Call Http.service - Requesting error: ${err.toString()}`);
      return [];
    }
  },
};
