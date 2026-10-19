const TOKEN_KEY = "tastebridge_token";
export { TOKEN_KEY };

let inMemoryToken = null;

export const tokenStorage = {
  getToken: () => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return localStorage.getItem(TOKEN_KEY);
      }
      return inMemoryToken;
    } catch (e) {
      console.error("Failed to retrieve auth token", e);
      return inMemoryToken;
    }
  },

  setToken: (token) => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        if (token) {
          localStorage.setItem(TOKEN_KEY, token);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      inMemoryToken = token || null;
    } catch (e) {
      console.error("Failed to save auth token", e);
      inMemoryToken = token || null;
    }
  },

  removeToken: () => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(TOKEN_KEY);
      }
      inMemoryToken = null;
    } catch (e) {
      console.error("Failed to remove auth token", e);
      inMemoryToken = null;
    }
  },
};

export default tokenStorage;
