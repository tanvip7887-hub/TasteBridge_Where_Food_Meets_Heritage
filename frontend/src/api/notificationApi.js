import api from "./axios.js";

// The authenticated session supplies both recipient and active portal.
export const notificationApi = {
  list: (params = {}) => api.get("/notifications", { params }),
  markRead: (id) => api.patch(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.patch("/notifications/read-all"),
};

export default notificationApi;
