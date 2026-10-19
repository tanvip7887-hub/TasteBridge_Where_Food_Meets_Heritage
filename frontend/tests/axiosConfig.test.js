import assert from "node:assert/strict";
import test from "node:test";

test("API client uses the configured Node base URL fallback when Vite env is unavailable", async () => {
  const previousValue = globalThis.process.env.VITE_API_BASE_URL;
  globalThis.process.env.VITE_API_BASE_URL = "http://127.0.0.1:5050/api/v1";

  try {
    const { default: api } = await import("../src/api/axios.js?node-env-fallback-test");
    assert.equal(api.defaults.baseURL, "http://127.0.0.1:5050/api/v1");
  } finally {
    if (previousValue === undefined) {
      delete globalThis.process.env.VITE_API_BASE_URL;
    } else {
      globalThis.process.env.VITE_API_BASE_URL = previousValue;
    }
  }
});
