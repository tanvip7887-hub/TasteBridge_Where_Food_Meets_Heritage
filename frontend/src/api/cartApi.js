import api from "./axios.js";

export const CART_UPDATED_EVENT = "tastebridge:cart-updated";

const notifyCartUpdated = (response) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, {
      detail: { itemCount: response?.data?.totals?.itemCount ?? 0 },
    }));
  }
  return response;
};

export const cartApi = {
  getCart: (config = {}) => api.get("/cart", config),
  addItem: (data) => api.post("/cart/items", data).then(notifyCartUpdated),
  updateItem: (itemId, data) => api.patch(`/cart/items/${encodeURIComponent(itemId)}`, data).then(notifyCartUpdated),
  removeItem: (itemId) => api.delete(`/cart/items/${encodeURIComponent(itemId)}`).then(notifyCartUpdated),
};
