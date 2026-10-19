import api from "./axios.js";

export const favoritesApi = {
  async list() {
    const response = await api.get("/favorites");
    return Array.isArray(response?.data?.items) ? response.data.items : [];
  },
  async add(dishId) {
    const response = await api.post(`/favorites/${encodeURIComponent(dishId)}`);
    return response?.data;
  },
  async remove(dishId) {
    const response = await api.delete(`/favorites/${encodeURIComponent(dishId)}`);
    return response?.data;
  },
};
