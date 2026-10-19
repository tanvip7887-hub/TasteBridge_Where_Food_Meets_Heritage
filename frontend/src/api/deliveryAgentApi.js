import api from "./axios.js";

export const deliveryAgentApi = {
  getPanelAccess: () => api.get("/delivery-agents/panel"),
  updateAvailability: (isAvailable) => api.patch("/delivery-agents/availability", { isAvailable }),
  listAvailableDeliveries: () => api.get("/delivery-agents/deliveries/available"),
  claimDelivery: (orderId) => api.post(`/delivery-agents/deliveries/${encodeURIComponent(orderId)}/claim`),
  listCurrentDeliveries: () => api.get("/delivery-agents/deliveries/current"),
  markDeliveryPickedUp: (orderId) => api.post(`/delivery-agents/deliveries/${encodeURIComponent(orderId)}/pickup`),
  markDeliveryCompleted: (orderId) => api.post(`/delivery-agents/deliveries/${encodeURIComponent(orderId)}/complete`),
  confirmCodCollection: (orderId) => api.post(`/delivery-agents/deliveries/${encodeURIComponent(orderId)}/collect-cod`),
  listDeliveryHistory: () => api.get("/delivery-agents/deliveries/history"),
  getDeliveryEarnings: () => api.get("/delivery-agents/earnings"),
  /**
   * Fetch authenticated user's delivery agent application status and details
   */
  getMyApplication: () => api.get("/delivery-agents/application"),

  submitPayoutDetails: ({ upiId, accountHolderName }) => api.post("/delivery-agents/payout-details", { upiId, accountHolderName }),

  /**
   * Submit or resubmit delivery agent application with multipart documents
   */
  submitApplication: (formData) =>
    api.post("/delivery-agents/application", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }),

  /**
   * Fetch a private verification document blob for preview
   */
  getDocument: (docId) => api.get(`/delivery-agents/documents/${docId}`, { responseType: "blob" }),
};

export default deliveryAgentApi;
