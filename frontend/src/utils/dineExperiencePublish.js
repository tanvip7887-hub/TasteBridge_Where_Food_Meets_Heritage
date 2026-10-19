const STORAGE_KEY = "tastebridge:dine-experience-publish:v1";
const MAX_PENDING_KEYS = 8;
const validKey = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const canonicalPayload = (payload) => JSON.stringify(Object.fromEntries(
  Object.entries(payload || {}).sort(([left], [right]) => left.localeCompare(right)),
));

const readEntries = (storage) => {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.fingerprint === "string" && validKey(entry?.key)).slice(-MAX_PENDING_KEYS)
      : [];
  } catch {
    return [];
  }
};

export const getDineExperiencePublishKey = async (
  payload,
  { storage = globalThis.sessionStorage, cryptoApi = globalThis.crypto } = {},
) => {
  if (!cryptoApi?.subtle || !cryptoApi?.randomUUID || !storage) {
    throw new Error("Secure browser storage is unavailable. Reload the page and try again.");
  }
  const bytes = new TextEncoder().encode(canonicalPayload(payload));
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  const fingerprint = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const entries = readEntries(storage);
  const existing = entries.find((entry) => entry.fingerprint === fingerprint);
  if (existing) return existing.key;

  const key = cryptoApi.randomUUID();
  const next = [...entries, { fingerprint, key }].slice(-MAX_PENDING_KEYS);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("A safe retry key could not be saved in this browser. Check session storage and try again.");
  }
  return key;
};

export const retireDineExperiencePublishKey = (key, storage = globalThis.sessionStorage) => {
  if (!validKey(key) || !storage) return;
  const remaining = readEntries(storage).filter((entry) => entry.key !== key);
  try {
    if (remaining.length) storage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // The persisted key may remain; reusing it is safe because the backend
    // validates the request fingerprint and returns the original event.
  }
};
