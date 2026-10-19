import api from "./axios.js";

export const omitEmptyEarningsFilters = (params = {}) => {
  const query = { ...params };
  for (const key of ["status", "paymentStatus"]) {
    if (query[key] === "" || query[key] == null) delete query[key];
  }
  return query;
};

export const cookApi = {
  /**
   * Fetch public cook profile by ID (for customer viewing)
   */
  getPublicProfile: (id) => api.get(`/cooks/${encodeURIComponent(id)}`),

  /**
   * Fetch authenticated user's cook application status and details
   */
  getMyApplication: () => api.get("/cooks/application"),

  /**
   * Submit or resubmit cook application with multipart documents
   */
  submitApplication: (formData) =>
    api.post("/cooks/application", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  getDocument: (docId) =>
    api.get(`/cooks/documents/${docId}`, { responseType: "blob" }),

  /**
   * Fetch authenticated cook's kitchen profile
   */
  getKitchenProfile: () => api.get("/cooks/kitchen"),
  submitFssaiDocument: (file) => {
    const formData = new FormData();
    formData.append("fssaiProof", file);
    return api.post("/cooks/fssai-document", formData, { headers: { "Content-Type": "multipart/form-data" } });
  },
  getNotifications: () => api.get("/cooks/notifications"),
  markNotificationRead: (id) => api.patch(`/cooks/notifications/${id}/read`),
  markAllNotificationsRead: () => api.patch("/cooks/notifications/read-all"),
  getOrders: () => api.get("/cooks/orders"),
  acceptOrder: (id) => api.patch(`/cooks/orders/${id}/accept`),
  prepareOrder: (id) => api.patch(`/cooks/orders/${id}/prepare`),
  markOrderReady: (id) => api.patch(`/cooks/orders/${id}/ready`),
  rejectOrder: (id) => api.patch(`/cooks/orders/${id}/reject`),
  getExperienceBookings: () => api.get("/cooks/experience-bookings/dine"),
  getWorkshopExperienceBookings: () => api.get("/cooks/experience-bookings/workshops"),
  acceptExperienceBooking: (id) => api.patch(`/cooks/experience-bookings/${encodeURIComponent(id)}/accept`),
  rejectExperienceBooking: (id) => api.patch(`/cooks/experience-bookings/${encodeURIComponent(id)}/reject`),
  completeExperienceBooking: (id) => api.patch(`/cooks/experience-bookings/${encodeURIComponent(id)}/complete`),
  approveExperienceCancellation: (id) => api.patch(`/cooks/experience-bookings/${encodeURIComponent(id)}/cancellation/approve`),
  rejectExperienceCancellation: (id, rejectionReason) => api.patch(`/cooks/experience-bookings/${encodeURIComponent(id)}/cancellation/reject`, { rejectionReason }),
  getExperiences: () => api.get("/cooks/experiences"),
  publishNewExperience: (data, workshopImage) => {
    if (!workshopImage) return api.post("/cooks/experiences/publish", data);
    const formData = new FormData();
    formData.append("payload", JSON.stringify(data));
    formData.append("workshopImage", workshopImage);
    return api.post("/cooks/experiences/publish", formData, { headers: { "Content-Type": "multipart/form-data" } });
  },
  createExperience: (data) => api.post("/cooks/experiences", data),
  updateExperience: (id, data) => api.patch(`/cooks/experiences/${encodeURIComponent(id)}`, data),
  publishExperience: (id) => api.patch(`/cooks/experiences/${encodeURIComponent(id)}/publish`),
  pauseExperience: (id) => api.patch(`/cooks/experiences/${encodeURIComponent(id)}/pause`),
  uploadExperiencePhoto: (id, file) => {
    const formData = new FormData();
    formData.append("photo", file);
    return api.post(`/cooks/experiences/${encodeURIComponent(id)}/photos`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  replaceWorkshopImage: (id, file) => {
    const formData = new FormData();
    formData.append("photo", file);
    return api.put(`/cooks/experiences/${encodeURIComponent(id)}/workshop-image`, formData, { headers: { "Content-Type": "multipart/form-data" } });
  },
  removeWorkshopImage: (id) => api.delete(`/cooks/experiences/${encodeURIComponent(id)}/workshop-image`),
  getExperienceSlots: (id) => api.get(`/cooks/experiences/${encodeURIComponent(id)}/slots`),
  createExperienceSlot: (id, data) => api.post(`/cooks/experiences/${encodeURIComponent(id)}/slots`, data),

  /**
   * Update authenticated cook's kitchen profile
   */
  updateKitchenProfile: (data) => api.put("/cooks/kitchen", data),

  /**
   * Upload or update kitchen photo via Cloudinary
   */
  uploadKitchenPhoto: (file) => {
    const formData = new FormData();
    formData.append("photo", file);
    return api.post("/cooks/kitchen/photo", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  /**
   * Fetch authenticated cook's dashboard metrics and recent feeds
   */
  getDashboard: () => api.get("/cooks/dashboard"),
  getEarnings: (params) => api.get("/cooks/earnings", { params: omitEmptyEarningsFilters(params) }),

  /**
   * Dish & Story Management APIs
   */
  getDishes: (params) => api.get("/cooks/dishes", { params }),

  getDishById: (id) => api.get(`/cooks/dishes/${id}`),

  createDish: (data) => api.post("/cooks/dishes", data),

  updateDish: (id, data) => api.put(`/cooks/dishes/${id}`, data),

  uploadDishPhoto: (id, file) => {
    const formData = new FormData();
    formData.append("photo", file);
    return api.post(`/cooks/dishes/${id}/photo`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  publishDish: (id, storyData) =>
    api.patch(`/cooks/dishes/${id}/publish`, storyData ? { story: storyData } : {}),

  unpublishDish: (id) => api.patch(`/cooks/dishes/${id}/unpublish`),

  updateDishAvailability: (id, isAvailable) =>
    api.patch(`/cooks/dishes/${id}/availability`, { isAvailable }),

  updateDishStock: (id, stockData) =>
    api.patch(`/cooks/dishes/${id}/stock`, stockData),

  deleteDish: (id) => api.delete(`/cooks/dishes/${id}`),

  getCategories: () => api.get("/categories"),

  getSocialStories: () => api.get("/cooks/social/stories"),
  createSocialStoryPhoto: (formData) => api.post("/cooks/social/stories/photos", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  createSocialStoryVideo: (formData) => api.post("/cooks/social/stories/videos", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  deleteSocialStory: (id) => api.delete(`/cooks/social/stories/${encodeURIComponent(id)}`),
  getSocialPosts: (status) => api.get("/cooks/social/posts", { params: status ? { status } : {} }),
  getSocialComments: ({ page = 1, limit = 20, postId, signal } = {}) => api.get("/cooks/social/comments", {
    params: { page, limit, ...(postId ? { postId } : {}) }, signal,
  }),
  createSocialPostDraft: (data) => api.post("/cooks/social/posts", data),
  createSocialPostPhotos: (formData) => api.post("/cooks/social/posts/photos", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  createSocialPostVideo: (formData) => api.post("/cooks/social/posts/videos", formData, { headers: { "Content-Type": "multipart/form-data" } }),
  updateSocialPost: (id, data) => api.patch(`/cooks/social/posts/${encodeURIComponent(id)}`, data),
  replaceSocialPostPhotos: (id, formData) => api.put(`/cooks/social/posts/${encodeURIComponent(id)}/photos`, formData, { headers: { "Content-Type": "multipart/form-data" } }),
  replaceSocialPostVideo: (id, formData) => api.put(`/cooks/social/posts/${encodeURIComponent(id)}/videos`, formData, { headers: { "Content-Type": "multipart/form-data" } }),
  deleteSocialPost: (id) => api.delete(`/cooks/social/posts/${encodeURIComponent(id)}`),
};

export default cookApi;
