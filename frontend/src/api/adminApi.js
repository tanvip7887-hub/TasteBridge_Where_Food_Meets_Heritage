import api from "./axios.js";

export const adminApi = {
  // 1. Dashboard
  getDashboardStats: () => api.get("/admin/dashboard"),

  // 2. Cook Management
  getAllCooks: (params, config = {}) => api.get("/admin/cooks", { ...config, params }),
  getCookById: (id) => api.get(`/admin/cooks/${id}`),
  updateCookVerification: (id, data) => api.patch(`/admin/cooks/${id}/verification`, data),
  reviewCookFssai: (id, data) => api.patch(`/admin/cooks/${id}/fssai-review`, data),
  updateCookAccountStatus: (id, data) => api.patch(`/admin/cooks/${id}/status`, data),

  // 3. Delivery Agent Management
  getAllDeliveryAgents: (params, config = {}) => api.get("/admin/delivery-agents", { ...config, params }),
  getDeliveryAgentById: (id) => api.get(`/admin/delivery-agents/${id}`),
  updateDeliveryAgentVerification: (id, data) => api.patch(`/admin/delivery-agents/${id}/verification`, data),
  reviewDeliveryAgentPayoutDetails: (id, data) => api.patch(`/admin/delivery-agents/${id}/payout-details`, data),
  updateDeliveryAgentAccountStatus: (id, data) => api.patch(`/admin/delivery-agents/${id}/status`, data),

  // 4. Customer Management
  getAllCustomers: (params, config = {}) => api.get("/admin/customers", { ...config, params }),
  getCustomerById: (id) => api.get(`/admin/customers/${id}`),
  updateCustomerAccountStatus: (id, data) => api.patch(`/admin/customers/${id}/status`, data),

  // 5. Dish & Food Category Management
  getAllDishes: (params, config = {}) => api.get("/admin/dishes", { ...config, params }),
  updateDishStatus: (id, data) => api.patch(`/admin/dishes/${id}/status`, data),
  getFoodCategories: () => api.get("/admin/categories"),
  createFoodCategory: (data) => api.post("/admin/categories", data),
  updateFoodCategory: (id, data) => api.patch(`/admin/categories/${id}`, data),

  // 6. Orders Management
  getAllOrders: (params, config = {}) => api.get("/admin/orders", { ...config, params }),
  getOrderById: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, data) => api.patch(`/admin/orders/${id}/status`, data),

  // 7. Payments & Earnings
  getPaymentStats: () => api.get("/admin/payments"),

  // 8. Experiences Management
  getAllExperiences: (params, config = {}) => api.get("/admin/experiences", { ...config, params }),
  getDineBookings: (params, config = {}) => api.get("/admin/dine-bookings", { ...config, params }),
  getWorkshopBookings: (params, config = {}) => api.get("/admin/workshop-bookings", { ...config, params }),
  updateExperienceStatus: (id, data) => api.patch(`/admin/experiences/${id}/status`, data),
  reviewWorkshop: (id, data) => api.patch(`/admin/workshops/${encodeURIComponent(id)}/review`, data),

  // 9. Reviews & Reports Management
  getAllReviews: (params) => api.get("/admin/reviews", { params }),
  updateReviewStatus: (id, data) => api.patch(`/admin/reviews/${id}/status`, data),
  getReportedReviews: (params) => api.get("/admin/reviews/reported", { params }),
  getSocialReports: (params, config = {}) => api.get("/admin/social-reports", { ...config, params }),
  moderateSocialReport: (id, data) => api.patch("/admin/social-reports/" + encodeURIComponent(id), data),
  moderateReview: (id, data) => api.patch(`/admin/reviews/${id}`, data),

  // 10. Verification Center
  getPendingVerifications: () => api.get("/admin/verifications"),
  updateDocumentVerification: (docId, data) => api.patch(`/admin/verifications/documents/${docId}`, data),

  // 11. Notifications
  getNotifications: () => api.get("/admin/notifications"),
  markNotificationAsRead: (id) => api.patch(`/admin/notifications/${id}/read`),
  markAllNotificationsAsRead: () => api.patch("/admin/notifications/read-all"),

  // 12. Platform Settings
  getPlatformSettings: () => api.get("/admin/settings"),
  updatePlatformSettings: (data) => api.patch("/admin/settings", data),
};

export default adminApi;
