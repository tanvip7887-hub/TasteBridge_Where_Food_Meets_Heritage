import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getScheduledCompletionAt, isCompletionAllowed } from "../src/utils/cookExperienceBooking.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cook event-booking page loads real bookings and exposes retry and completion states", async () => {
  const page = await read("../src/pages/cook/panel/CookBookingsPage.jsx");
  assert.match(page, /cookApi\.getExperienceBookings\(\)/);
  assert.match(page, /role="status"/);
  assert.match(page, /role="alert"/);
  assert.match(page, />Retry</);
  assert.match(page, /booking\.status === "CONFIRMED"/);
  assert.match(page, /completeExperienceBooking\(booking\.id\)/);
  assert.match(page, /void loadBookings\(\)/);
  assert.match(page, /\{ id: "PENDING", label: "Requests" \}/);
  assert.match(page, /\{ id: "ACCEPTED", label: "Awaiting payment" \}/);
  assert.match(page, /booking\.status === "ACCEPTED"/);
  assert.match(page, /booking\.status === "PENDING"/);
  assert.match(page, /onDecide=\{decideBooking\}/);
  assert.match(page, /onDecide\(booking, "accept"\)/);
  assert.match(page, /onDecide\(booking, "reject"\)/);
  assert.match(page, /actingIdRef\.current/);
  assert.match(page, /disabled=\{Boolean\(actingId\)\}/);
  assert.match(page, /await loadBookings\(\{ silent: true \}\)/);
  assert.match(page, /requestError\?\.status === 409/);
  assert.match(page, /setActionSuccess\(/);
  assert.match(page, /setActionError\(/);
});

test("an open Cook bookings page refreshes on return to visibility without polling", async () => {
  const page = await read("../src/pages/cook/panel/CookBookingsPage.jsx");
  assert.match(page, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(page, /loadBookings\(\{ silent: true \}\)/);
  assert.match(page, /window\.removeEventListener\("focus", refreshWhenVisible\)/);
  assert.doesNotMatch(page, /setInterval\(/);
});

test("Cook event-booking API calls stay authenticated and send no user or status from the client", async () => {
  const api = await read("../src/api/cookApi.js");
  assert.match(api, /getExperienceBookings: \(\) => api\.get\("\/cooks\/experience-bookings\/dine"\)/);
  assert.match(api, /getWorkshopExperienceBookings: \(\) => api\.get\("\/cooks\/experience-bookings\/workshops"\)/);
  assert.match(api, /acceptExperienceBooking: \(id\) => api\.patch\(`\/cooks\/experience-bookings\/\$\{encodeURIComponent\(id\)\}\/accept`\)/);
  assert.match(api, /rejectExperienceBooking: \(id\) => api\.patch\(`\/cooks\/experience-bookings\/\$\{encodeURIComponent\(id\)\}\/reject`\)/);
  assert.match(api, /completeExperienceBooking: \(id\) => api\.patch\(`\/cooks\/experience-bookings\/\$\{encodeURIComponent\(id\)\}\/complete`\)/);
  assert.doesNotMatch(api, /completeExperienceBooking:[^\n]*\{[^}]*status|completeExperienceBooking:[^\n]*userId/);
});

test("new experience booking notification points to the mounted Cook bookings page", async () => {
  const service = await read("../../backend/src/modules/events/dine-bookings.service.js");
  assert.match(service, /experience\.type === "WORKSHOP" \? "\/cook\/workshop-bookings" : "\/cook\/dine-bookings"/);
});

test("Cook sidebar and direct routes separate Dine and Workshop bookings", async () => {
  const [layout, routes] = await Promise.all([
    read("../src/layouts/CookLayout.jsx"),
    read("../src/routes/AppRoutes.jsx"),
  ]);
  assert.match(layout, /label: "Dine Bookings", path: "\/cook\/dine-bookings"/);
  assert.match(layout, /label: "Workshop Bookings", path: "\/cook\/workshop-bookings"/);
  assert.match(routes, /path="dine-bookings" element={<CookBookingsPage experienceType="HOME_DINING" \/>}/);
  assert.match(routes, /path="workshop-bookings" element={<CookBookingsPage experienceType="WORKSHOP" \/>}/);
  assert.match(routes, /path="bookings" element={<Navigate to="\/cook\/dine-bookings" replace \/>}/);
});

test("Cook bookings page selects the type-specific list and displays Workshop booking fields", async () => {
  const page = await read("../src/pages/cook/panel/CookBookingsPage.jsx");
  assert.match(page, /isWorkshop\s*\? await cookApi\.getWorkshopExperienceBookings\(\)\s*: await cookApi\.getExperienceBookings\(\)/);
  assert.match(page, /booking\.experience\?\.title/);
  assert.match(page, /booking\.customer\?\.name/);
  assert.match(page, /booking\.slot\?\.startsAt/);
  assert.match(page, /booking\.numberOfGuests/);
  assert.match(page, /booking\.totalAmountSnapshot/);
  assert.match(page, /booking\.paymentAttempts\?\.\[0\]\?\.status/);
  assert.match(page, /booking\.cancellationStatus/);
  assert.match(page, /const matchingBookings = useMemo/);
  assert.match(page, /const totalPages =/);
});

test("Cook booking cards use the customer experience image source, safe amounts, and redesigned details", async () => {
  const [page, bookingService] = await Promise.all([
    read("../src/pages/cook/panel/CookBookingsPage.jsx"),
    read("../../backend/src/modules/events/experience-bookings.service.js"),
  ]);
  assert.match(page, /getExperienceImage\(experience, 800, categories\)/);
  assert.match(bookingService, /menuItems: \{ orderBy: \{ sortOrder: "asc" \}, select: \{\s*dish: \{\s*select: \{ name: true, image: true, cuisine: true \}\s*\}\s*\}\s*\}/);
  assert.match(page, /Number\(value\)/);
  assert.match(page, /toAmount\(booking\.numberOfGuests\)/);
  assert.match(page, /Number\.isFinite\(amount\)/);
  assert.match(page, /return "—"/);
  assert.match(page, /aria-label="Copy reference"/);
  assert.match(page, /Booking ref:/);
  assert.match(page, /function PaymentBadge/);
  assert.match(page, /function BookingTabs/);
  assert.match(page, /bookings\.filter\(\(booking\) => booking\.status === tab\.id\)\.length/);
  assert.match(page, /No booking requests yet/);
  assert.match(bookingService, /image: true,[\s\S]*photos: true,[\s\S]*menuItems:/);
});

test("Workshop bookings use poster-safe images, separate tabs and search, and dismissible success feedback", async () => {
  const page = await read("../src/pages/cook/panel/CookBookingsPage.jsx");
  assert.match(page, /isWorkshop\s*\?\s*\{ src: experience\.image \|\| experience\.photos\?\.\[0\]/);
  assert.match(page, /isWorkshop \? "bg-\[#F2ECE4\] object-contain" : "object-cover"/);
  assert.match(page, /<h1 className="sr-only">Workshop Bookings<\/h1>/);
  assert.match(page, /<BookingTabs activeTab=\{activeTab\} bookings=\{bookings\} onSelect=\{\(tab\) => \{ setPage\(1\); setActionSuccess\(""\); setActiveTab\(tab\); \}\} \/>/);
  assert.match(page, /setTimeout\(\(\) => setActionSuccess\(""\), 5000\)/);
  assert.match(page, /aria-label="Dismiss"/);
  assert.match(page, /booking\.amountPaid, booking\.paidAmount, succeededPayment\?\.amount/);
  assert.match(page, /minimumFractionDigits: 2, maximumFractionDigits: 2/);
});

test("Cook bookings page enforces scheduled completion window and displays in-progress state", async () => {
  const page = await read("../src/pages/cook/panel/CookBookingsPage.jsx");
  const helpers = await read("../src/utils/cookExperienceBooking.js");

  // Scheduled end time evaluation helper
  assert.match(page, /getScheduledCompletionAt/);
  assert.match(helpers, /raw = booking\.slot\?\.endsAt \|\| booking\.bookingDate/);
  assert.match(page, /isCompletionAllowed/);
  assert.equal(getScheduledCompletionAt({ slot: { endsAt: "2026-10-18T14:00:00.000Z" } }).toISOString(), "2026-10-18T14:00:00.000Z");

  // Guard in completeBooking prevents premature calls
  assert.match(page, /if \(!isCompletionAllowed\(booking, now\)\)/);
  assert.match(page, /A confirmed booking cannot be completed before its scheduled experience has ended\./);

  // Dynamic scheduled / in-progress indicator when not yet allowed
  assert.match(page, /isCompletionAllowed\(booking, now\) \?/);
  assert.match(page, /Experience in progress/);
  assert.match(page, /Experience scheduled/);

  // Meaningful server error message extraction with fallback
  assert.match(page, /serverMessage = requestError\?\.response\?\.data\?\.message \|\| requestError\?\.message/);
  assert.match(page, /setActionError\(serverMessage \|\|/);

  const refNow = new Date("2026-10-18T14:00:00.000Z");

  // 1. Slot end in future -> disallowed
  assert.equal(isCompletionAllowed({ slot: { endsAt: "2026-10-18T15:00:00.000Z" } }, refNow), false);

  // 2. Slot end in past -> allowed
  assert.equal(isCompletionAllowed({ slot: { endsAt: "2026-10-18T13:00:00.000Z" } }, refNow), true);

  // 3. Slot end exactly now -> allowed
  assert.equal(isCompletionAllowed({ slot: { endsAt: "2026-10-18T14:00:00.000Z" } }, refNow), true);

  // 4. Missing slot, bookingDate in future -> disallowed
  assert.equal(isCompletionAllowed({ bookingDate: "2026-10-18T16:00:00.000Z" }, refNow), false);

  // 5. Missing slot, bookingDate in past -> allowed
  assert.equal(isCompletionAllowed({ bookingDate: "2026-10-18T12:00:00.000Z" }, refNow), true);

  // 6. Missing timestamps -> safely disallowed (does not accidentally enable)
  assert.equal(isCompletionAllowed({}, refNow), false);
  assert.equal(isCompletionAllowed({ slot: {} }, refNow), false);
  assert.equal(isCompletionAllowed(null, refNow), false);

  // 7. Invalid timestamp -> safely disallowed
  assert.equal(isCompletionAllowed({ slot: { endsAt: "invalid-date" } }, refNow), false);
});

test("Cook bookings page renders cancellation requests with customer reason and wires approve and decline actions", async () => {
  const [page, api, helpers] = await Promise.all([
    read("../src/pages/cook/panel/CookBookingsPage.jsx"),
    read("../src/api/cookApi.js"),
    read("../src/utils/cookExperienceBooking.js"),
  ]);

  // API endpoints
  assert.match(api, /approveExperienceCancellation: \(id\) => api\.patch\(`\/cooks\/experience-bookings\/\$\{encodeURIComponent\(id\)\}\/cancellation\/approve`\)/);
  assert.match(api, /rejectExperienceCancellation: \(id, rejectionReason\) => api\.patch\(`\/cooks\/experience-bookings\/\$\{encodeURIComponent\(id\)\}\/cancellation\/reject`, \{ rejectionReason \}\)/);

  // Cook UI components
  assert.match(page, /Guest cancellation request/);
  assert.match(page, /booking\.cancellationReason/);
  assert.match(page, /Approve Cancellation/);
  assert.match(page, /Reject Cancellation/);
  assert.match(page, /cookApi\.approveExperienceCancellation\(booking\.id\)/);
  assert.match(page, /cookApi\.rejectExperienceCancellation\(rejectModalBooking\.id, rejectionReason\.trim\(\)\)/);
  assert.match(page, /Decline cancellation request/);

  // Completion guard prevents completing booking with pending cancellation
  assert.match(helpers, /if \(booking\?\.cancellationStatus === "PENDING"\) return false;/);
  assert.match(page, /This booking has a pending cancellation request and cannot be completed/);
});

