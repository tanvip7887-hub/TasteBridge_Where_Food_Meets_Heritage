import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServerClock, formatIstDateTime, istLocalDateTimeToInstant, readServerClock } from "../src/utils/istDateTime.js";

test("Dine instants display in IST regardless of the browser timezone and invalid values are safe", () => {
  assert.match(formatIstDateTime("2026-10-18T12:15:00.000Z"), /5:45/);
  assert.equal(formatIstDateTime("not-a-date"), "Date unavailable");
  assert.equal(formatIstDateTime(null), "Date unavailable");
});

test("Dine discovery, customer history, and Cook screens share the explicit IST formatter", async () => {
  const paths = [
    "../src/components/events/DineExperienceDiscovery.jsx",
    "../src/pages/MyEventsPage.jsx",
    "../src/pages/cook/panel/CookBookingsPage.jsx",
    "../src/pages/cook/panel/CookExperiencesPage.jsx",
  ];
  const pages = await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const page of pages) assert.match(page, /formatIstDateTime/);
});

test("Cook slot datetime-local input is interpreted as IST and serialized as an explicit UTC instant", () => {
  assert.equal(istLocalDateTimeToInstant("2026-10-18T17:45"), "2026-10-18T12:15:00.000Z");
  assert.throws(() => istLocalDateTimeToInstant("2026-02-30T17:45"), /valid IST/);
  assert.throws(() => istLocalDateTimeToInstant("2026-10-18T25:00"), /valid IST/);
  assert.throws(() => istLocalDateTimeToInstant("2026-10-18 17:45"), /valid IST/);
});

test("server clock anchors deadlines to server time and advances on a monotonic clock despite wall-clock skew", () => {
  const serverTime = "2026-10-18T12:00:00.000Z";
  const clock = createServerClock(serverTime, 1_000, 1_400);
  assert.equal(readServerClock(clock, 1_400), Date.parse(serverTime) + 200);
  assert.equal(readServerClock(clock, 2_400), Date.parse(serverTime) + 1_200);
  assert.equal(createServerClock("bad-time", 1_000, 1_400), null);
  assert.equal(createServerClock(null, 1_000, 1_400), null);
  assert.equal(createServerClock(serverTime, 2_000, 1_000), null);
  assert.equal(readServerClock(clock, 1_300), null);
});
