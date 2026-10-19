import api from "./axios.js";

export const addressApi = {
  list: () => api.get("/addresses"),
  getDefault: () => api.get("/addresses/default"),
  create: (data) => api.post("/addresses", data),
  update: (id, data) => api.patch(`/addresses/${encodeURIComponent(id)}`, data),
  setDefault: (id) => api.put(`/addresses/${encodeURIComponent(id)}/default`),
  remove: (id) => api.delete(`/addresses/${encodeURIComponent(id)}`),
};
