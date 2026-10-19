const INDIA_OFFSET_MINUTES = 330;

export const formatIstDateTime = (value, fallback = "Date unavailable") => {
  if (value === null || value === undefined || value === "") return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

/** Convert a datetime-local wall time explicitly entered as IST into a UTC instant. */
export const istLocalDateTimeToInstant = (value) => {
  const match = typeof value === "string"
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
    : null;
  if (!match) throw new Error("Enter a valid IST slot date and time.");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const wallTime = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (wallTime.getUTCFullYear() !== year || wallTime.getUTCMonth() !== month - 1
    || wallTime.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Enter a valid IST slot date and time.");
  }
  return new Date(wallTime.getTime() - INDIA_OFFSET_MINUTES * 60_000).toISOString();
};

/** Anchor server epoch time to performance.now(), so device wall-clock skew does not affect deadlines. */
export const createServerClock = (serverTime, requestStartedAt, responseReceivedAt) => {
  if (serverTime === null || serverTime === undefined || serverTime === "") return null;
  const serverEpoch = new Date(serverTime).getTime();
  const roundTrip = responseReceivedAt - requestStartedAt;
  if (!Number.isFinite(serverEpoch) || !Number.isFinite(roundTrip) || roundTrip < 0
    || !Number.isFinite(responseReceivedAt)) return null;
  return {
    epochAtAnchor: serverEpoch + roundTrip / 2,
    monotonicAtAnchor: responseReceivedAt,
  };
};

export const readServerClock = (clock, monotonicNow) => {
  if (!clock || !Number.isFinite(monotonicNow) || monotonicNow < clock.monotonicAtAnchor) return null;
  const epoch = clock.epochAtAnchor + (monotonicNow - clock.monotonicAtAnchor);
  return Number.isFinite(epoch) ? epoch : null;
};
