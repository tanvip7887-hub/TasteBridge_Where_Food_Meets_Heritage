import api from "./axios.js";

const eventsApi = {
  getExperiences: (params = {}, config = {}) => api.get("/experiences", { ...config, params }),
  getExperience: (id, config = {}) => api.get(`/experiences/${encodeURIComponent(id)}`, config),
  createBooking: (data) => api.post("/events/bookings", data),
  getMyBookings: (config = {}) => api.get("/events/my-bookings", config),
  getMyDineBookings: (config = {}) => api.get("/events/my-bookings/dine", config),
  getMyWorkshopBookings: (config = {}) => api.get("/events/my-bookings/workshops", config),
  cancelDineBooking: (bookingId, reason) => api.post(`/events/bookings/${encodeURIComponent(bookingId)}/cancel`, { reason }),
  requestDineCancellation: (bookingId, reason) => api.post(`/events/bookings/${encodeURIComponent(bookingId)}/cancel`, { reason }),
  initiateDinePayment: (bookingId, idempotencyKey) => api.post(`/events/bookings/${encodeURIComponent(bookingId)}/payment-attempts`, { idempotencyKey }),
  confirmDinePayment: (bookingId, attemptId, mockOutcome) => api.post(`/events/bookings/${encodeURIComponent(bookingId)}/payment-attempts/${encodeURIComponent(attemptId)}/confirm`, { mockOutcome }),
};

export default eventsApi;
