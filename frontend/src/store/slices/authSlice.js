import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import api from "../../api/axios.js";
import { tokenStorage } from "../../utils/tokenStorage.js";

const AUTH_REQUEST_TIMEOUT_MS = 15000;

export const authRequestErrorMessage = (error, fallback) => {
  if (["ECONNABORTED", "ETIMEDOUT"].includes(error?.code) || /timed?\s*out|timeout/i.test(error?.message || "")) {
    return "The authentication request timed out. Check that the TasteBridge server is available and try again.";
  }
  if (error?.message === "Network Error") {
    return "TasteBridge could not be reached. Check the server connection and try again.";
  }
  return error?.message || fallback;
};

// Async Thunk: Restore session on startup via GET /api/v1/auth/me
export const initializeAuth = createAsyncThunk(
  "auth/initializeAuth",
  async (_, { rejectWithValue }) => {
    const token = tokenStorage.getToken();
    if (!token) {
      return { user: null, token: null };
    }
    try {
      const response = await api.get("/auth/me", { timeout: AUTH_REQUEST_TIMEOUT_MS });
      return { user: response.data, token };
    } catch (error) {
      if (tokenStorage.getToken() === token) tokenStorage.removeToken();
      return rejectWithValue({
        message: authRequestErrorMessage(error, "Your session could not be restored. Please sign in again."),
      });
    }
  }
);

// Async Thunk: Register User (POST /api/v1/auth/register)
export const registerUser = createAsyncThunk(
  "auth/registerUser",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/register", userData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Async Thunk: Verify OTP (POST /api/v1/auth/register/verify-otp)
export const verifyRegisterOtp = createAsyncThunk(
  "auth/verifyRegisterOtp",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/register/verify-otp", payload);
      const { token, user } = response.data;
      tokenStorage.setToken(token);
      return { token, user };
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Async Thunk: Resend OTP (POST /api/v1/auth/register/resend-otp)
export const resendRegisterOtp = createAsyncThunk(
  "auth/resendRegisterOtp",
  async (payload, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/register/resend-otp", payload);
      return response.data;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Async Thunk: Login User (POST /api/v1/auth/login)
export const loginUser = createAsyncThunk(
  "auth/loginUser",
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/login", credentials, { timeout: AUTH_REQUEST_TIMEOUT_MS });
      const { token, user } = response.data;
      if (!token || !user?.id || !user?.activePortal) {
        throw new Error("The sign-in response was incomplete. Please try again.");
      }
      tokenStorage.setToken(token);
      return { token, user };
    } catch (error) {
      return rejectWithValue({
        message: authRequestErrorMessage(error, "Sign-in failed. Please try again."),
        status: error?.status,
      });
    }
  }
);

export const switchPortal = createAsyncThunk(
  "auth/switchPortal",
  async (portal, { rejectWithValue }) => {
    try {
      const response = await api.post("/auth/switch-portal", { portal }, { timeout: AUTH_REQUEST_TIMEOUT_MS });
      const result = response.data;
      if (!result?.token || !result?.user?.id || result.user.activePortal !== portal) {
        throw new Error("The portal switch response was incomplete. Please try again.");
      }
      tokenStorage.setToken(result.token);
      return result;
    } catch (error) {
      return rejectWithValue({
        message: authRequestErrorMessage(error, "Could not switch portals. Please try again."),
        status: error?.status,
      });
    }
  }
);

const initialState = {
  user: null,
  token: tokenStorage.getToken(),
  isAuthenticated: false,
  // `loading` is reserved for session restoration because route guards use it
  // to replace their entire route tree. Form requests need independent flags.
  loading: false,
  registrationLoading: false,
  otpVerificationLoading: false,
  otpResendLoading: false,
  isInitialized: false,
  initializationRequestId: null,
  sessionError: null,
  error: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    logout: (state) => {
      tokenStorage.removeToken();
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.initializationRequestId = null;
      state.sessionError = null;
      state.error = null;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
    updateUserProfile: (state, action) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      } else {
        state.user = { ...action.payload };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // initializeAuth
      .addCase(initializeAuth.pending, (state, action) => {
        state.loading = true;
        state.initializationRequestId = action.meta.requestId;
        state.sessionError = null;
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        if (state.initializationRequestId !== action.meta.requestId) return;
        state.loading = false;
        state.isInitialized = true;
        state.initializationRequestId = null;
        state.sessionError = null;
        if (action.payload.user) {
          state.user = action.payload.user;
          state.token = action.payload.token;
          state.isAuthenticated = true;
        } else {
          state.user = null;
          state.token = null;
          state.isAuthenticated = false;
        }
      })
      .addCase(initializeAuth.rejected, (state, action) => {
        if (state.initializationRequestId !== action.meta.requestId) return;
        state.loading = false;
        state.isInitialized = true;
        state.initializationRequestId = null;
        state.sessionError = action.payload?.message || "Your session could not be restored. Please sign in again.";
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
      })
      // loginUser
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.sessionError = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isInitialized = true;
        state.initializationRequestId = null;
        state.sessionError = null;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.isInitialized = true;
        state.initializationRequestId = null;
        state.error = action.payload || { message: "Login failed" };
      })
      .addCase(switchPortal.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.sessionError = null;
        state.error = null;
      })
      // registerUser
      .addCase(registerUser.pending, (state) => {
        state.registrationLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.registrationLoading = false;
        state.error = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.registrationLoading = false;
        state.error = action.payload || { message: "Registration failed" };
      })
      // verifyRegisterOtp
      .addCase(verifyRegisterOtp.pending, (state) => {
        state.otpVerificationLoading = true;
        state.error = null;
      })
      .addCase(verifyRegisterOtp.fulfilled, (state, action) => {
        state.otpVerificationLoading = false;
        state.isInitialized = true;
        state.initializationRequestId = null;
        state.sessionError = null;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(verifyRegisterOtp.rejected, (state, action) => {
        state.otpVerificationLoading = false;
        state.error = action.payload || { message: "OTP verification failed" };
      })
      // resendRegisterOtp
      .addCase(resendRegisterOtp.pending, (state) => {
        state.otpResendLoading = true;
        state.error = null;
      })
      .addCase(resendRegisterOtp.fulfilled, (state) => {
        state.otpResendLoading = false;
        state.error = null;
      })
      .addCase(resendRegisterOtp.rejected, (state, action) => {
        state.otpResendLoading = false;
        state.error = action.payload || { message: "Resend OTP failed" };
      });
  },
});

export const { logout, clearAuthError, updateUserProfile } = authSlice.actions;
export default authSlice.reducer;


