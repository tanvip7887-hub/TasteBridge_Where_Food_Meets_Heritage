import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice.js";
import locationReducer from "./locationSlice.js";
import favoritesReducer from "./slices/favoritesSlice.js";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    location: locationReducer,
    favorites: favoritesReducer,
  },
});

export default store;
