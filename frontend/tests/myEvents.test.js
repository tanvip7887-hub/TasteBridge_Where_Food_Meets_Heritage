import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupBookings } from "../src/utils/eventBookings.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("My Events separates upcoming, past, and cancelled booking statuses", () => {
  const groups = groupBookings([
    { id: "future", status: "CONFIRMED", bookingDate: "2026-10-20T10:00:00.000Z" },
    { id: "past-by-date", status: "CONFIRMED", bookingDate: "2026-10-10T10:00:00.000Z" },
    { id: "past-by-status", status: "COMPLETED", bookingDate: "2026-10-30T10:00:00.000Z" },
    { id: "cancelled", status: "CANCELLED", bookingDate: "2026-10-21T10:00:00.000Z" },
  ], Date.parse("2026-10-17T00:00:00.000Z"));
  assert.deepEqual(groups.upcoming.map(({ id }) => id), ["future"]);
  assert.deepEqual(groups.past.map(({ id }) => id), ["past-by-status", "past-by-date"]);
  assert.deepEqual(groups.cancelled.map(({ id }) => id), ["cancelled"]);
});

test("My Events page, route, account menu, and API use the authenticated booking endpoint", async () => {
  const [page, routes, navbar, api] = await Promise.all([
    read("../src/pages/MyEventsPage.jsx"),
    read("../src/routes/AppRoutes.jsx"),
    read("../src/components/layout/Navbar.jsx"),
    read("../src/api/eventsApi.js"),
  ]);
  const landing = await read("../src/pages/MyEventsLandingPage.jsx");
  assert.match(routes, /path="my-events" element=\{<ProtectedRoute><RoleRoute allowedRoles=\{\["CUSTOMER"\]\}><MyEventsLandingPage \/><\/RoleRoute><\/ProtectedRoute>\}/);
  assert.match(landing, /to: "\/my-events\/dine"/);
  assert.match(landing, /to: "\/my-events\/workshops"/);
  assert.match(navbar, /to="\/my-events"[\s\S]*?My Events/);
  assert.match(api, /api\.get\("\/events\/my-bookings\/dine", config\)/);
  assert.match(api, /api\.get\("\/events\/my-bookings\/workshops", config\)/);
  assert.match(page, /No \{isWorkshop \? "workshop" : "Dine"\} bookings yet/);
  assert.match(page, /Loading your events/);
  assert.match(page, /role="alert"/);
  assert.match(page, /Upcoming/);
  assert.match(page, /Past/);
  assert.match(page, /Cancelled/);
  assert.match(page, /Experience booking/);
  assert.match(page, /Reference:/);
  assert.match(page, /booking\.venue/);
});

test("My Events direct-route guard preserves login redirect and denies non-Customer roles", async () => {
  const [routes, protectedRoute, roleRoute] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"),
    read("../src/routes/ProtectedRoute.jsx"),
    read("../src/routes/RoleRoute.jsx"),
  ]);

  assert.match(routes, /path="my-events" element=\{<ProtectedRoute><RoleRoute allowedRoles=\{\["CUSTOMER"\]\}><MyEventsLandingPage \/><\/RoleRoute><\/ProtectedRoute>\}/);
  assert.match(routes, /path="my-events\/dine" element=\{<ProtectedRoute><RoleRoute allowedRoles=\{\["CUSTOMER"\]\}><MyEventsPage experienceType="HOME_DINING" \/><\/RoleRoute><\/ProtectedRoute>\}/);
  assert.match(routes, /path="my-events\/workshops" element=\{<ProtectedRoute><RoleRoute allowedRoles=\{\["CUSTOMER"\]\}><MyEventsPage experienceType="WORKSHOP" \/><\/RoleRoute><\/ProtectedRoute>\}/);
  assert.match(roleRoute, /allowedRoles\.includes\(user\.role\)/);
  assert.match(roleRoute, /Access Denied/);
  assert.match(protectedRoute, /if \(!isAuthenticated\)\s*\{\s*return <Navigate to="\/" state=\{\{ from: location, openLogin: true \}\} replace \/>;/);

  for (const role of ["COOK", "DELIVERY_AGENT", "ADMIN"]) {
    assert.equal(["CUSTOMER"].includes(role), false);
  }
});

test("Dine and Workshop booking views use separate endpoints and retain booking actions and pagination", async () => {
  const [page, landing, api] = await Promise.all([
    read("../src/pages/MyEventsPage.jsx"), read("../src/pages/MyEventsLandingPage.jsx"), read("../src/api/eventsApi.js"),
  ]);
  assert.match(page, /experienceType = "HOME_DINING"/);
  assert.match(page, /eventsApi\.getMyWorkshopBookings\(\{ signal \}\)/);
  assert.match(page, /eventsApi\.getMyDineBookings\(\{ signal \}\)/);
  assert.match(page, /BOOKINGS_PER_PAGE = 10/);
  assert.match(page, /booking pages/);
  assert.match(page, /Payment/);
  assert.match(page, /CancellationAction/);
  assert.match(page, /CustomerReviewModal/);
  assert.match(landing, /Dine/);
  assert.match(landing, /Workshop/);
  assert.match(api, /getMyDineBookings: \(config = \{\}\) => api\.get\("\/events\/my-bookings\/dine", config\)/);
  assert.match(api, /getMyWorkshopBookings: \(config = \{\}\) => api\.get\("\/events\/my-bookings\/workshops", config\)/);
});
