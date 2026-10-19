import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import authReducer, { authRequestErrorMessage, initializeAuth, loginUser } from "../src/store/slices/authSlice.js";

test("successful login ends initialization and a late restore cannot replace its portal session", () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, initializeAuth.pending("restore-before-login"));
  assert.equal(state.isInitialized, false);
  assert.equal(state.loading, true);

  const signedInUser = { id: "agent-customer", role: "DELIVERY_AGENT", activePortal: "DELIVERY_AGENT" };
  state = authReducer(state, loginUser.fulfilled({ token: "current-token", user: signedInUser }, "login-request"));
  assert.equal(state.isInitialized, true);
  assert.equal(state.loading, false);
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.user, signedInUser);

  state = authReducer(state, initializeAuth.fulfilled({
    token: "stale-token",
    user: { id: "old-session", role: "CUSTOMER", activePortal: "CUSTOMER" },
  }, "restore-before-login"));
  assert.equal(state.token, "current-token");
  assert.equal(state.user, signedInUser);
});

test("failed session restoration clears the loading gate and preserves a useful message", () => {
  let state = authReducer(undefined, { type: "test/init" });
  state = authReducer(state, initializeAuth.pending("restore-request"));
  state = authReducer(state, initializeAuth.rejected(null, "restore-request", undefined, {
    message: "Your session expired. Please sign in again.",
  }));
  assert.equal(state.loading, false);
  assert.equal(state.isInitialized, true);
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.sessionError, "Your session expired. Please sign in again.");
});

test("login, session restoration, and portal switching requests have bounded timeouts", async () => {
  const source = await readFile(new URL("../src/store/slices/authSlice.js", import.meta.url), "utf8");
  assert.match(source, /api\.get\("\/auth\/me", \{ timeout: AUTH_REQUEST_TIMEOUT_MS \}\)/);
  assert.match(source, /api\.post\("\/auth\/login", credentials, \{ timeout: AUTH_REQUEST_TIMEOUT_MS \}\)/);
  assert.match(source, /api\.post\("\/auth\/switch-portal", \{ portal \}, \{ timeout: AUTH_REQUEST_TIMEOUT_MS \}\)/);
});

test("authentication timeout errors remain useful after the Axios interceptor normalizes them", () => {
  assert.match(
    authRequestErrorMessage({ message: "timeout of 15000ms exceeded" }, "fallback"),
    /request timed out/i,
  );
});
