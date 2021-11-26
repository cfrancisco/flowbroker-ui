const StorageService = {
  isAuthenticated() {
    return localStorage.getItem("jwt") !== null;
  },
  getToken() {
    return localStorage.getItem("jwt");
  },
};
