const STORAGE_KEY = "tastebridge:dine-booking-idempotency:v1";
const DEFINITIVE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

const getStorage = (storage) => {
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (!target || typeof target.getItem !== "function" || typeof target.setItem !== "function") {
      throw new Error("Session storage is unavailable.");
    }
    return target;
  } catch {
    throw new Error("This browser cannot safely save the booking retry key for this tab. Enable session storage and try again.");
  }
};

const readRecords = (storage) => {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const records = JSON.parse(raw);
    return Array.isArray(records) ? records.filter((record) => (
      record && typeof record.customerId === "string"
      && typeof record.experienceId === "string"
      && typeof record.slotId === "string"
      && Number.isInteger(record.numberOfGuests)
      && typeof record.idempotencyKey === "string"
    )) : [];
  } catch {
    // An unreadable record cannot safely be used as an idempotency key.
    storage.removeItem(STORAGE_KEY);
    return [];
  }
};

const matchesRequest = (record, request) => record.customerId === request.customerId
  && record.experienceId === request.experienceId
  && record.slotId === request.slotId
  && record.numberOfGuests === Number(request.numberOfGuests);

const writeRecords = (storage, records) => {
  try {
    if (records.length) storage.setItem(STORAGE_KEY, JSON.stringify(records));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    throw new Error("The booking retry key could not be saved. No booking request was sent; please try again.");
  }
};

export const createDineBookingRequestKey = () => {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("A secure booking request key could not be generated in this browser.");
  }
  return globalThis.crypto.randomUUID();
};

/**
 * Persist only the authenticated customer scope, backend fingerprint fields,
 * and key. sessionStorage survives reloads in this tab and clears when it closes.
 */
export const getOrCreateDineBookingIdempotencyKey = (request, { storage, createKey = createDineBookingRequestKey } = {}) => {
  if (!request?.customerId || !request?.experienceId || !request?.slotId
    || !Number.isInteger(Number(request.numberOfGuests)) || Number(request.numberOfGuests) < 1) {
    throw new Error("A complete customer booking request is required to create a retry key.");
  }
  const target = getStorage(storage);
  const records = readRecords(target);
  const existing = records.find((record) => matchesRequest(record, request));
  if (existing) return existing.idempotencyKey;

  const idempotencyKey = createKey();
  if (typeof idempotencyKey !== "string" || !idempotencyKey) {
    throw new Error("A secure booking request key could not be generated in this browser.");
  }
  records.push({
    customerId: String(request.customerId),
    experienceId: String(request.experienceId),
    slotId: String(request.slotId),
    numberOfGuests: Number(request.numberOfGuests),
    idempotencyKey,
  });
  writeRecords(target, records);
  return idempotencyKey;
};

export const retireDineBookingIdempotencyKey = (request, { storage } = {}) => {
  const target = getStorage(storage);
  const records = readRecords(target);
  writeRecords(target, records.filter((record) => !matchesRequest(record, request)));
};

export const isDefinitiveDineBookingRejection = (error) => DEFINITIVE_REJECTION_STATUSES.has(Number(error?.status));

export const isDefinitiveDineBookingSuccess = (booking) => Boolean(booking?.id && booking?.status);

