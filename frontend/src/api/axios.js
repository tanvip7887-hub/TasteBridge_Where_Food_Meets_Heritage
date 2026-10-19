import axios from "axios";
import { tokenStorage } from "../utils/tokenStorage.js";

const getBaseURL = () => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (globalThis.process?.env?.VITE_API_BASE_URL) {
    return globalThis.process.env.VITE_API_BASE_URL;
  }
  return "http://localhost:5000/api/v1";
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
});

// Request Interceptor: Automatically attach JWT access token
api.interceptors.request.use(
  (config) => {
    const token = tokenStorage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Format error responses consistently
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const customError = {
      status: error.response?.status || 500,
      message: error.response?.data?.message || error.message || "An unexpected error occurred",
      errors: error.response?.data?.errors || null,
    };
    return Promise.reject(customError);
  }
);

export default api;
