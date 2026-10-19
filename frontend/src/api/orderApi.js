import api from "./axios.js";

export const orderApi = {
  getCheckoutSummary: (params = {}) => api.get("/orders/checkout/summary", { params }),
  placeOrder: (data) => api.post("/orders", data),
  list: () => api.get("/orders"),
  get: (id) => api.get(`/orders/${encodeURIComponent(id)}`),
  cancel: (id) => api.post(`/orders/${encodeURIComponent(id)}/cancel`),
  confirmReceipt: (id) => api.post(`/orders/${encodeURIComponent(id)}/receipt-confirmation`),
  hideFromHistory: (id) => api.post(`/orders/${encodeURIComponent(id)}/hide`),
  initiateOnlineCheckout: (data) => api.post("/payments/online-checkouts", data),
  getPaymentAttempt: (id) => api.get(`/payments/attempts/${encodeURIComponent(id)}`),
  confirmPaymentAttempt: (id, mockOutcome) => api.post(`/payments/attempts/${encodeURIComponent(id)}/confirm`, mockOutcome ? { mockOutcome } : {}),
  cancelPaymentAttempt: (id) => api.post(`/payments/attempts/${encodeURIComponent(id)}/cancel`),
};
