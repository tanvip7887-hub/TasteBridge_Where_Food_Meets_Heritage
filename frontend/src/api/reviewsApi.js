import api from "./axios.js";

const reviewsApi = {
  pending: (params = {}) => api.get("/reviews/pending", { params }),
  mine: (params = {}) => api.get("/reviews/mine", { params }),
  create: (data) => api.post("/reviews", data),
  update: (id, data) => api.patch(`/reviews/${encodeURIComponent(id)}`, data),
  forDish: (id, params = {}) => api.get(`/dishes/${encodeURIComponent(id)}/reviews`, { params }),
  forCook: (id, params = {}) => api.get(`/cooks/${encodeURIComponent(id)}/reviews`, { params }),
  forMyCook: (params = {}) => api.get("/cooks/reviews", { params }),
  reply: (id, reply) => api.post(`/cooks/reviews/${encodeURIComponent(id)}/reply`, { reply }),
  report: (id, reason) => api.post(`/cooks/reviews/${encodeURIComponent(id)}/report`, { reason }),
  reportedForAdmin: (params = {}) => api.get("/admin/reviews/reported", { params }),
  moderate: (id, data) => api.patch(`/admin/reviews/${encodeURIComponent(id)}`, data),
};

export default reviewsApi;
