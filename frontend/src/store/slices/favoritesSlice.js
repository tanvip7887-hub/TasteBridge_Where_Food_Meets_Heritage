import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { favoritesApi } from "../../api/favoritesApi.js";

export const fetchFavorites = createAsyncThunk(
  "favorites/fetch",
  async (customerId, { rejectWithValue }) => {
    try { return { customerId, items: await favoritesApi.list() }; }
    catch (error) { return rejectWithValue(error?.message || "Favorites could not be loaded."); }
  },
  { condition: (customerId, { getState }) => {
    const state = getState();
    return state.favorites.status !== "loading"
      && state.auth.isAuthenticated
      && state.auth.user?.id === customerId
      && state.auth.user?.activePortal === "CUSTOMER";
  } },
);

export const addFavorite = createAsyncThunk(
  "favorites/add",
  async ({ dishId, customerId }, { dispatch, rejectWithValue }) => {
    try {
      const favorite = await favoritesApi.add(dishId);
      dispatch(fetchFavorites(customerId));
      return { dishId, customerId, favorite };
    }
    catch (error) { return rejectWithValue({ dishId, message: error?.message || "Could not save this dish." }); }
  },
  { condition: ({ dishId, customerId }, { getState }) => {
    const state = getState();
    return !state.favorites.pendingDishIds.includes(dishId)
      && state.favorites.currentCustomerId === customerId
      && state.favorites.status !== "loading"
      && state.auth.isAuthenticated
      && state.auth.user?.id === customerId
      && state.auth.user?.activePortal === "CUSTOMER";
  } },
);

export const removeFavorite = createAsyncThunk(
  "favorites/remove",
  async ({ dishId, customerId }, { rejectWithValue }) => {
    try { await favoritesApi.remove(dishId); return { dishId, customerId }; }
    catch (error) { return rejectWithValue({ dishId, message: error?.message || "Could not remove this dish." }); }
  },
  { condition: ({ dishId, customerId }, { getState }) => {
    const state = getState();
    return !state.favorites.pendingDishIds.includes(dishId)
      && state.favorites.currentCustomerId === customerId
      && state.favorites.status !== "loading"
      && state.auth.isAuthenticated
      && state.auth.user?.id === customerId
      && state.auth.user?.activePortal === "CUSTOMER";
  } },
);

const initialState = { items: [], ids: [], status: "idle", error: null, pendingDishIds: [], pendingRequests: {}, currentCustomerId: null, fetchRequestId: null };
const removePending = (state, dishId, requestId) => {
  if (state.pendingRequests[dishId] !== requestId) return false;
  state.pendingDishIds = state.pendingDishIds.filter((id) => id !== dishId);
  delete state.pendingRequests[dishId];
  return true;
};

const favoritesSlice = createSlice({
  name: "favorites",
  initialState,
  reducers: {
    clearFavorites: () => ({ ...initialState, items: [], ids: [], pendingDishIds: [], pendingRequests: {} }),
    clearFavoriteError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchFavorites.pending, (state, action) => {
        state.status = "loading";
        state.error = null;
        state.currentCustomerId = action.meta.arg;
        state.fetchRequestId = action.meta.requestId;
      })
      .addCase(fetchFavorites.fulfilled, (state, action) => {
        if (state.fetchRequestId !== action.meta.requestId || state.currentCustomerId !== action.payload.customerId) return;
        state.items = action.payload.items;
        state.ids = action.payload.items.map((dish) => dish.id);
        state.status = "succeeded";
        state.fetchRequestId = null;
      })
      .addCase(fetchFavorites.rejected, (state, action) => {
        if (state.fetchRequestId !== action.meta.requestId) return;
        state.status = "failed";
        state.fetchRequestId = null;
        state.error = action.payload || "Favorites could not be loaded.";
      })
      .addCase(addFavorite.pending, (state, action) => {
        const { dishId, customerId } = action.meta.arg;
        if (state.currentCustomerId !== customerId) return;
        state.pendingDishIds.push(dishId);
        state.pendingRequests[dishId] = action.meta.requestId;
        state.error = null;
      })
      .addCase(addFavorite.fulfilled, (state, action) => {
        if (state.currentCustomerId !== action.payload.customerId || !removePending(state, action.payload.dishId, action.meta.requestId)) return;
        if (!state.ids.includes(action.payload.dishId)) state.ids.push(action.payload.dishId);
      })
      .addCase(addFavorite.rejected, (state, action) => {
        const dishId = action.payload?.dishId || action.meta.arg.dishId;
        if (!removePending(state, dishId, action.meta.requestId)) return;
        state.error = action.payload?.message || "Could not save this dish.";
      })
      .addCase(removeFavorite.pending, (state, action) => {
        const { dishId, customerId } = action.meta.arg;
        if (state.currentCustomerId !== customerId) return;
        state.pendingDishIds.push(dishId);
        state.pendingRequests[dishId] = action.meta.requestId;
        state.error = null;
      })
      .addCase(removeFavorite.fulfilled, (state, action) => {
        const { dishId, customerId } = action.payload;
        if (state.currentCustomerId !== customerId || !removePending(state, dishId, action.meta.requestId)) return;
        state.ids = state.ids.filter((id) => id !== dishId);
        state.items = state.items.filter((dish) => dish.id !== dishId);
      })
      .addCase(removeFavorite.rejected, (state, action) => {
        const dishId = action.payload?.dishId || action.meta.arg.dishId;
        if (!removePending(state, dishId, action.meta.requestId)) return;
        state.error = action.payload?.message || "Could not remove this dish.";
      });
  },
});

export const { clearFavorites, clearFavoriteError } = favoritesSlice.actions;
export default favoritesSlice.reducer;
