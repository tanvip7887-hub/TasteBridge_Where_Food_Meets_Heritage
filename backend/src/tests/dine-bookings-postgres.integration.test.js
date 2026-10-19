import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";
import app from "../app.js";
import env from "../config/env.js";
import appPrisma from "../config/prisma.js";
import { createCookExperiencesService } from "../modules/cook/cook-experiences.service.js";
import { createAdminWorkshopReviewService } from "../modules/admin/admin.service.js";
import { createPublicExperiencesService } from "../modules/events/public-experiences.service.js";
import { createExperienceBookingsService } from "../modules/events/experience-bookings.service.js";
import { createDineBookingsService } from "../modules/events/dine-bookings.service.js";
import { createDinePaymentsService } from "../modules/events/dine-payments.service.js";
import { createDineCancellationsService } from "../modules/events/dine-cancellations.service.js";
import { createDineCookDecisionsService } from "../modules/events/dine-cook-decisions.service.js";
import { createDineBookingExpiryService, expireDueBookingsForSlot } from "../modules/events/dine-booking-expiry.service.js";
import { createDineBookingExpiryScheduler } from "../modules/events/dine-booking-expiry.scheduler.js";

const testUrl = process.env.DINE_TEST_DATABASE_URL;
const hasIsolatedUrl = Boolean(testUrl);

const assertSafeTestTarget = (rawUrl) => {
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname), "Dine integration tests require a local PostgreSQL host.");
  assert.match(databaseName, /^tastebridge_dine_test_[a-z0-9_]+$/i, "Use a dedicated database named tastebridge_dine_test_<unique suffix>; the configured tastebridge database is forbidden.");
  assert.notEqual(databaseName.toLowerCase(), "tastebridge");
  return databaseName;
};

// These race fixtures account for PENDING and ACCEPTED reservations (including
// overdue requests until expiry commits) and CONFIRMED bookings as seat-occupying
// states. REJECTED, EXPIRED, and CANCELLED release seats.
const ACTIVE_CAPACITY_BOOKING_STATUSES = ["PENDING", "ACCEPTED", "CONFIRMED"];

test("PostgreSQL Dine seat holds are atomic, idempotent, coordinated with capacity edits, and rollback-safe", { skip: !hasIsolatedUrl }, async (t) => {
  const expectedDatabase = assertSafeTestTarget(testUrl);
  const pool = new pg.Pool({ connectionString: testUrl, max: 8 });
  const database = new PrismaClient({ adapter: new PrismaPg(pool) });
  const ownedUserIds = new Set();
  const ownedCustomerIds = new Set();
  const ownedExperienceIds = new Set();
  const ownedSlotIds = new Set();

  const createFixture = async (capacity, customerCount = 1) => {
    const marker = randomUUID();
    const customers = [];
    for (let index = 0; index < customerCount; index += 1) {
      const customer = await database.user.create({ data: {
        name: `Dine integration customer ${marker}`,
        email: `dine-${marker}-${index}@example.invalid`,
        passwordHash: "integration-test-only-not-a-credential",
        role: "CUSTOMER",
      } });
      ownedUserIds.add(customer.id);
      ownedCustomerIds.add(customer.id);
      customers.push(customer);
    }
    const cookUser = await database.user.create({
      data: {
        name: `Dine integration cook ${marker}`,
        email: `dine-cook-${marker}@example.invalid`,
        passwordHash: "integration-test-only-not-a-credential",
        role: "COOK",
        cookProfile: { create: {
          businessName: `Dine test kitchen ${marker}`,
          profileImage: "https://example.invalid/dine-test-cook.jpg",
          bio: "A sufficiently long test kitchen introduction.",
          experienceYears: "5 years",
          specialization: "Test dining",
          city: "Pune",
          locality: "Test locality",
          cookingCapacity: "20 guests",
          prepTimeNotice: "24 hours",
          cuisines: ["Test cuisine"],
          dietaryPreferences: ["Vegetarian"],
          availableDays: ["Saturday"],
          availableMealSlots: ["Dinner"],
          isHomeKitchenDeclared: true,
          foodSafetyConsent: true,
          verificationStatus: "APPROVED",
          isApprovedToSell: true,
          fssaiStatus: "APPROVED",
          fssaiExpiryDate: new Date("2035-01-01T00:00:00.000Z"),
        } },
      },
      include: { cookProfile: true },
    });
    ownedUserIds.add(cookUser.id);
    const experience = await database.experience.create({ data: {
      cookId: cookUser.cookProfile.id,
      type: "HOME_DINING",
      title: `Dine test experience ${marker}`,
      theme: "Test theme",
      description: "A sufficiently detailed description for isolated integration tests.",
      cuisine: "Test cuisine",
      pricePerPerson: 125.5,
      maxGuests: 6,
      durationMinutes: 120,
      publicArea: "Test locality, Pune",
      privateAddress: "Private synthetic address",
      addressSource: "CUSTOM",
      photos: ["https://example.invalid/dine-test.jpg"],
      menuNotes: "Synthetic test menu",
      status: "PUBLISHED",
    } });
    ownedExperienceIds.add(experience.id);
    const slot = await database.experienceSlot.create({ data: {
      experienceId: experience.id,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
      capacity,
      availableSeats: capacity,
      status: "OPEN",
    } });
    ownedSlotIds.add(slot.id);
    return { marker, customers, cookUser, experience, slot };
  };

  const submitWorkshop = async (fixture, { capacity = 4, startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } = {}) => {
    const imageUrl = `https://example.invalid/workshop-${fixture.marker}.jpg`;
    const input = {
      idempotencyKey: randomUUID(),
      type: "WORKSHOP",
      title: `Workshop ${fixture.marker}`,
      theme: "Regional cooking techniques",
      description: "An isolated PostgreSQL integration workshop with persisted teaching details.",
      teachingContent: "Participants practise tempering and ingredient preparation.",
      learningOutcomes: "Participants learn a repeatable regional cooking technique.",
      materialsToBring: "Apron and notebook",
      pricePerPerson: 250,
      maxGuests: 3,
      capacity,
      durationMinutes: 90,
      location: "Synthetic workshop venue, Pune",
      startsAt: startsAt.toISOString(),
    };
    // The storage adapter is deliberately local to this test. No Cloudinary
    // request or external image record is created; database behavior receives
    // a deterministic synthetic image reference.
    const storage = {
      uploadPublicMarketplaceImage: async () => ({ secureUrl: imageUrl, publicId: `test-${fixture.marker}` }),
      deleteCloudinaryAsset: async () => {},
    };
    const workshop = await createCookExperiencesService(database, { storage })
      .publishNew(fixture.cookUser.cookProfile.id, input, {
        buffer: Buffer.from(`workshop image fixture ${fixture.marker}`),
        originalname: "workshop.jpg",
      });
    ownedExperienceIds.add(workshop.id);
    for (const slot of workshop.slots) ownedSlotIds.add(slot.id);
    return { workshop, input, imageUrl };
  };

  const assertExactSlotAccounting = async (slotId) => {
    const persistedSlot = await database.experienceSlot.findUnique({ where: { id: slotId } });
    const held = await database.experienceBooking.aggregate({
      where: { slotId, status: { in: ACTIVE_CAPACITY_BOOKING_STATUSES } },
      _sum: { numberOfGuests: true },
    });
    const heldGuests = held._sum.numberOfGuests || 0;
    assert.ok(persistedSlot.availableSeats >= 0 && persistedSlot.availableSeats <= persistedSlot.capacity);
    assert.equal(heldGuests + persistedSlot.availableSeats, persistedSlot.capacity,
      `held guests (${heldGuests}) + available seats (${persistedSlot.availableSeats}) must equal capacity (${persistedSlot.capacity}); counted statuses: ${ACTIVE_CAPACITY_BOOKING_STATUSES.join(", ")}`);
    return { persistedSlot, heldGuests };
  };

  const createAcceptedBookingWithPayment = async (fixture, keyPrefix) => {
    const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
      experienceId: fixture.experience.id,
      slotId: fixture.slot.id,
      numberOfGuests: 2,
      idempotencyKey: `${keyPrefix}-${fixture.marker}`,
    });
    const accepted = await createDineCookDecisionsService(database).acceptBooking({
      bookingId: booking.id,
      cookId: fixture.cookUser.cookProfile.id,
    });
    const payments = createDinePaymentsService(database);
    const attempt = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
    return { booking, accepted, attempt, payments };
  };

  const createConfirmedBooking = async (fixture, keyPrefix) => {
    const result = await createAcceptedBookingWithPayment(fixture, keyPrefix);
    const confirmation = await result.payments.confirmPayment(
      fixture.customers[0].id,
      result.booking.id,
      result.attempt.id,
      "success",
    );
    assert.equal(confirmation.booking.status, "CONFIRMED");
    assert.equal(confirmation.paymentAttempt.status, "SUCCEEDED");
    return result;
  };

  try {
    const identity = await database.$queryRaw`SELECT current_database() AS name`;
    assert.equal(identity[0]?.name, expectedDatabase, "Connected database must match the isolated database encoded in DINE_TEST_DATABASE_URL.");
    const enumRows = await database.$queryRaw`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='BookingStatus'`;
    assert.ok(enumRows.some(({ enumlabel }) => enumlabel === "EXPIRED"), "The isolated database must have the seat-hold migration applied.");
    assert.ok(enumRows.some(({ enumlabel }) => enumlabel === "ACCEPTED"), "The isolated database must have the Option A payment-persistence migration applied.");
    assert.ok(enumRows.some(({ enumlabel }) => enumlabel === "REJECTED"), "The isolated database must have the Option A payment-persistence migration applied.");

    await t.test("real API routes publish idempotently, expose only public fields, and complete a customer-to-review lifecycle", async () => {
      assert.ok(env.JWT_SECRET, "JWT_SECRET must be configured for the isolated API lifecycle check.");
      const fixture = await createFixture(3, 2);
      const server = createServer(app);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const cookToken = jwt.sign({ userId: fixture.cookUser.id, role: "COOK", activePortal: "COOK" }, env.JWT_SECRET, { expiresIn: "5m" });
      const customerToken = jwt.sign({ userId: fixture.customers[0].id, role: "CUSTOMER", activePortal: "CUSTOMER" }, env.JWT_SECRET, { expiresIn: "5m" });
      const secondCustomerToken = jwt.sign({ userId: fixture.customers[1].id, role: "CUSTOMER", activePortal: "CUSTOMER" }, env.JWT_SECRET, { expiresIn: "5m" });
      const request = async (path, { token, method = "GET", body } = {}) => fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const expectSuccess = async (response, status) => {
        const payload = await response.json();
        assert.equal(response.status, status, payload.message || "API request failed");
        assert.equal(payload.success, true, payload.message || "API request failed");
        return payload.data;
      };
      const expectError = async (response, status) => {
        const payload = await response.json();
        assert.equal(response.status, status, payload.message || "Unexpected API response");
        assert.equal(payload.success, false);
        return payload;
      };

      try {
        const invalidPublish = await request("/api/v1/cooks/experiences/publish", { token: cookToken, method: "POST", body: { title: "Missing required fields" } });
        await expectError(invalidPublish, 400);

        const startsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        const publishBody = {
          idempotencyKey: randomUUID(),
          type: "HOME_DINING",
          title: `HTTP lifecycle dinner ${fixture.marker}`,
          theme: "Family recipes",
          cuisine: "Maharashtrian",
          isVegetarian: true,
          description: "A sufficiently detailed description for the HTTP lifecycle event.",
          dietaryNotes: "No peanuts",
          menuNotes: "Seasonal menu",
          pricePerPerson: 125.5,
          maxGuests: 3,
          capacity: 3,
          durationMinutes: 120,
          location: "12 Synthetic Road, Pune",
          startsAt: startsAt.toISOString(),
        };
        const [firstPublishResponse, retryPublishResponse] = await Promise.all([
          request("/api/v1/cooks/experiences/publish", { token: cookToken, method: "POST", body: publishBody }),
          request("/api/v1/cooks/experiences/publish", { token: cookToken, method: "POST", body: publishBody }),
        ]);
        const [published, publishRetry] = await Promise.all([
          expectSuccess(firstPublishResponse, 201),
          expectSuccess(retryPublishResponse, 201),
        ]);
        assert.equal(published.id, publishRetry.id);
        ownedExperienceIds.add(published.id);
        assert.equal(published.status, "PUBLISHED");
        assert.equal(published.title, publishBody.title);
        assert.equal(published.theme, publishBody.theme);
        assert.equal(published.cuisine, publishBody.cuisine);
        assert.equal(published.isVegetarian, publishBody.isVegetarian);
        assert.equal(published.description, publishBody.description);
        assert.equal(published.dietaryNotes, publishBody.dietaryNotes);
        assert.equal(published.menuNotes, publishBody.menuNotes);
        assert.equal(published.pricePerPerson, publishBody.pricePerPerson);
        assert.equal(published.maxGuests, publishBody.maxGuests);
        assert.equal(published.durationMinutes, publishBody.durationMinutes);
        assert.equal(published.publicArea, "Test locality, Pune");
        assert.equal(published.image, "https://example.invalid/dine-test-cook.jpg");
        assert.equal(published.privateAddress, publishBody.location, "The Cook's own publish response should preserve their entered private venue address.");
        assert.equal(published.slots.length, 1);
        const [publishedSlot] = published.slots;
        ownedSlotIds.add(publishedSlot.id);
        assert.equal(new Date(publishedSlot.startsAt).getTime(), startsAt.getTime());
        assert.equal(new Date(publishedSlot.endsAt).getTime(), startsAt.getTime() + publishBody.durationMinutes * 60_000);
        assert.equal(publishedSlot.capacity, publishBody.maxGuests);
        assert.equal(publishedSlot.availableSeats, publishBody.maxGuests);
        assert.equal(publishedSlot.status, "OPEN");
        assert.equal(await database.experience.count({ where: { cookId: fixture.cookUser.cookProfile.id, publishIdempotencyKey: publishBody.idempotencyKey } }), 1);
        assert.equal(await database.experienceSlot.count({ where: { experienceId: published.id } }), 1);

        const discoveryResponse = await request(`/api/v1/experiences?cuisine=${encodeURIComponent(publishBody.cuisine)}`);
        const discovery = await expectSuccess(discoveryResponse, 200);
        const listed = discovery.items.find((item) => item.id === published.id);
        assert.ok(listed, "A published ready experience with an open future slot must be customer-visible.");
        assert.equal(listed.slots[0].availableSeats, 3);
        assert.equal(JSON.stringify(listed).includes(publishBody.location), false, "Public discovery must not expose the private venue address.");

        const bookingBody = { experienceId: published.id, slotId: publishedSlot.id, numberOfGuests: 2, idempotencyKey: `http-booking-${fixture.marker}` };
        const [firstBookingResponse, retryBookingResponse] = await Promise.all([
          request("/api/v1/events/bookings", { token: customerToken, method: "POST", body: bookingBody }),
          request("/api/v1/events/bookings", { token: customerToken, method: "POST", body: bookingBody }),
        ]);
        const [booking, bookingRetry] = await Promise.all([
          expectSuccess(firstBookingResponse, 201),
          expectSuccess(retryBookingResponse, 201),
        ]);
        assert.equal(booking.id, bookingRetry.id);
        assert.equal(booking.status, "PENDING");
        assert.equal(booking.numberOfGuests, 2);
        assert.equal(await database.experienceBooking.count({ where: { customerId: fixture.customers[0].id, experienceId: published.id } }), 1);
        let accounting = await assertExactSlotAccounting(publishedSlot.id);
        assert.equal(accounting.heldGuests, 2);
        assert.equal(accounting.persistedSlot.availableSeats, 1);
        const updatedDiscovery = await (await request(`/api/v1/experiences/${published.id}`)).json();
        assert.equal(updatedDiscovery.data.slots[0].availableSeats, 1);

        const ownershipAttempt = await request(`/api/v1/events/bookings/${booking.id}/payment-attempts`, {
          token: secondCustomerToken, method: "POST", body: { idempotencyKey: randomUUID() },
        });
        await expectError(ownershipAttempt, 404);
        assert.equal(await database.experiencePaymentAttempt.count({ where: { experienceBookingId: booking.id } }), 0);

        const cookBookings = await expectSuccess(await request("/api/v1/cooks/experience-bookings", { token: cookToken }), 200);
        assert.ok(cookBookings.items.some((item) => item.id === booking.id && item.status === "PENDING"));
        await expectError(await request(`/api/v1/cooks/experience-bookings/${booking.id}/accept`, { token: customerToken, method: "PATCH" }), 403);
        const accepted = await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${booking.id}/accept`, { token: cookToken, method: "PATCH" }), 200);
        assert.equal(accepted.status, "ACCEPTED");
        assert.equal(new Date(accepted.paymentExpiresAt).getTime() - new Date(accepted.acceptedAt).getTime(), 15 * 60 * 1000);

        const failedAttempt = await expectSuccess(await request(`/api/v1/events/bookings/${booking.id}/payment-attempts`, {
          token: customerToken, method: "POST", body: { idempotencyKey: randomUUID() },
        }), 201);
        assert.equal(failedAttempt.provider, "SIMULATED");
        assert.equal(failedAttempt.amount, 251);
        const failed = await expectSuccess(await request(`/api/v1/events/bookings/${booking.id}/payment-attempts/${failedAttempt.id}/confirm`, {
          token: customerToken, method: "POST", body: { mockOutcome: "failure" },
        }), 200);
        assert.equal(failed.booking.status, "ACCEPTED");
        assert.equal(failed.paymentAttempt.status, "FAILED");
        const successfulAttempt = await expectSuccess(await request(`/api/v1/events/bookings/${booking.id}/payment-attempts`, {
          token: customerToken, method: "POST", body: { idempotencyKey: randomUUID() },
        }), 201);
        assert.equal(new Date(successfulAttempt.expiresAt).getTime(), new Date(accepted.paymentExpiresAt).getTime());
        const paid = await expectSuccess(await request(`/api/v1/events/bookings/${booking.id}/payment-attempts/${successfulAttempt.id}/confirm`, {
          token: customerToken, method: "POST", body: { mockOutcome: "success" },
        }), 200);
        assert.equal(paid.booking.status, "CONFIRMED");
        assert.equal(paid.paymentAttempt.status, "SUCCEEDED");
        assert.equal(paid.paymentAttempt.verificationMode, "SIMULATED");
        assert.equal(paid.simulated, true);
        assert.equal(await database.userNotification.count({
          where: { userId: fixture.cookUser.id, eventKey: `experience-booking:${booking.id}:payment-confirmed:cook:${fixture.cookUser.id}` },
        }), 1);

        const cancelRequest = await expectSuccess(await request(`/api/v1/events/bookings/${booking.id}/cancel`, {
          token: customerToken, method: "POST", body: { reason: "Schedule conflict for our family." },
        }), 200);
        assert.equal(cancelRequest.booking.cancellationStatus, "PENDING");
        const cookReviewing = await expectSuccess(await request("/api/v1/cooks/experience-bookings", { token: cookToken }), 200);
        assert.equal(cookReviewing.items.find((item) => item.id === booking.id).cancellationReason, "Schedule conflict for our family.");
        const approvedCancellation = await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${booking.id}/cancellation/approve`, {
          token: cookToken, method: "PATCH",
        }), 200);
        assert.equal(approvedCancellation.booking.status, "CANCELLED");
        assert.equal(approvedCancellation.refund.provider, "SIMULATED");
        assert.equal(approvedCancellation.refund.verificationMode, "SIMULATED");
        assert.equal(approvedCancellation.refund.amount, 251);
        assert.equal(approvedCancellation.refund.realMoneyReturned, false);
        assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: successfulAttempt.id } }), 1);
        assert.equal(await database.userNotification.count({
          where: { userId: fixture.customers[0].id, eventKey: `experience-booking:${booking.id}:cancellation-approved:customer:${fixture.customers[0].id}` },
        }), 1);
        accounting = await assertExactSlotAccounting(publishedSlot.id);
        assert.equal(accounting.heldGuests, 0);
        assert.equal(accounting.persistedSlot.availableSeats, 3);

        const rejectedBooking = await expectSuccess(await request("/api/v1/events/bookings", {
          token: secondCustomerToken, method: "POST", body: { ...bookingBody, numberOfGuests: 1, idempotencyKey: `http-reject-${fixture.marker}` },
        }), 201);
        await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${rejectedBooking.id}/reject`, { token: cookToken, method: "PATCH" }), 200);
        assert.equal((await database.experienceBooking.findUnique({ where: { id: rejectedBooking.id } })).status, "REJECTED");
        accounting = await assertExactSlotAccounting(publishedSlot.id);
        assert.equal(accounting.heldGuests, 0);
        assert.equal(accounting.persistedSlot.availableSeats, 3);

        const cancellationRejectionBooking = await expectSuccess(await request("/api/v1/events/bookings", {
          token: secondCustomerToken, method: "POST", body: { ...bookingBody, numberOfGuests: 1, idempotencyKey: `http-cancel-reject-${fixture.marker}` },
        }), 201);
        await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${cancellationRejectionBooking.id}/accept`, { token: cookToken, method: "PATCH" }), 200);
        const cancellationRejectionAttempt = await expectSuccess(await request(`/api/v1/events/bookings/${cancellationRejectionBooking.id}/payment-attempts`, {
          token: secondCustomerToken, method: "POST", body: { idempotencyKey: randomUUID() },
        }), 201);
        await expectSuccess(await request(`/api/v1/events/bookings/${cancellationRejectionBooking.id}/payment-attempts/${cancellationRejectionAttempt.id}/confirm`, {
          token: secondCustomerToken, method: "POST", body: { mockOutcome: "success" },
        }), 200);
        await expectSuccess(await request(`/api/v1/events/bookings/${cancellationRejectionBooking.id}/cancel`, {
          token: secondCustomerToken, method: "POST", body: { reason: "A schedule change needs review." },
        }), 200);
        const rejectedCancellation = await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${cancellationRejectionBooking.id}/cancellation/reject`, {
          token: cookToken, method: "PATCH", body: { rejectionReason: "The event is already prepared for this guest." },
        }), 200);
        assert.equal(rejectedCancellation.booking.status, "CONFIRMED");
        assert.equal(rejectedCancellation.booking.cancellationStatus, "REJECTED");
        assert.equal(rejectedCancellation.refund, null);
        assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: cancellationRejectionAttempt.id } }), 0);
        accounting = await assertExactSlotAccounting(publishedSlot.id);
        assert.equal(accounting.heldGuests, 1);
        assert.equal(accounting.persistedSlot.availableSeats, 2);

        const completionBooking = await expectSuccess(await request("/api/v1/events/bookings", {
          token: secondCustomerToken, method: "POST", body: { ...bookingBody, numberOfGuests: 1, idempotencyKey: `http-complete-${fixture.marker}` },
        }), 201);
        await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${completionBooking.id}/accept`, { token: cookToken, method: "PATCH" }), 200);
        const completionAttempt = await expectSuccess(await request(`/api/v1/events/bookings/${completionBooking.id}/payment-attempts`, {
          token: secondCustomerToken, method: "POST", body: { idempotencyKey: randomUUID() },
        }), 201);
        await expectSuccess(await request(`/api/v1/events/bookings/${completionBooking.id}/payment-attempts/${completionAttempt.id}/confirm`, {
          token: secondCustomerToken, method: "POST", body: { mockOutcome: "success" },
        }), 200);
        await database.experienceSlot.update({
          where: { id: publishedSlot.id },
          data: { startsAt: new Date(Date.now() - 3 * 60 * 60 * 1000), endsAt: new Date(Date.now() - 60 * 60 * 1000) },
        });
        const completed = await expectSuccess(await request(`/api/v1/cooks/experience-bookings/${completionBooking.id}/complete`, { token: cookToken, method: "PATCH" }), 200);
        assert.equal(completed.status, "COMPLETED");
        assert.ok(completed.completedAt);
        assert.equal(await database.userNotification.count({
          where: { userId: fixture.customers[1].id, eventKey: `experience-booking:${completionBooking.id}:review-request:customer:${fixture.customers[1].id}` },
        }), 1);
        const pendingReviews = await expectSuccess(await request("/api/v1/reviews/pending", { token: secondCustomerToken }), 200);
        assert.ok(pendingReviews.items.some((item) => item.bookingId === completionBooking.id && item.reviewType === "EXPERIENCE"));
        const review = await expectSuccess(await request("/api/v1/reviews", {
          token: secondCustomerToken, method: "POST", body: { reviewType: "EXPERIENCE", bookingId: completionBooking.id, rating: 5, comment: "A lovely event." },
        }), 201);
        assert.equal(review.reviewType, "EXPERIENCE");
        await expectError(await request("/api/v1/reviews", {
          token: secondCustomerToken, method: "POST", body: { reviewType: "EXPERIENCE", bookingId: completionBooking.id, rating: 4 },
        }), 409);
        assert.equal(await database.review.count({ where: { experienceBookingId: completionBooking.id } }), 1);
        const history = await expectSuccess(await request("/api/v1/events/my-bookings", { token: secondCustomerToken }), 200);
        assert.equal(history.items.find((item) => item.id === completionBooking.id).status, "COMPLETED");
      } finally {
        const closed = new Promise((resolve) => server.close(resolve));
        server.closeAllConnections?.();
        await closed;
      }
    });

    await t.test("concurrent requests cannot reserve the final seat twice", async () => {
      const fixture = await createFixture(1, 2);
      const service = createDineBookingsService(database);
      const results = await Promise.allSettled(fixture.customers.map((customer, index) => service.createBooking(customer.id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 1, idempotencyKey: `last-seat-${fixture.marker}-${index}`,
      })));
      assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
      const persistedSlot = await database.experienceSlot.findUnique({ where: { id: fixture.slot.id } });
      assert.equal(persistedSlot.availableSeats, 0);
      const bookings = await database.experienceBooking.findMany({ where: { slotId: fixture.slot.id, status: "PENDING" } });
      assert.equal(bookings.reduce((total, booking) => total + booking.numberOfGuests, 0), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 1);
      assert.equal(accounting.persistedSlot.availableSeats, 0);
    });

    await t.test("same-key concurrent retry returns one booking and decrements once", async () => {
      const fixture = await createFixture(4);
      const service = createDineBookingsService(database);
      const payload = { experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `duplicate-${fixture.marker}` };
      const [left, right] = await Promise.all([
        service.createBooking(fixture.customers[0].id, payload),
        service.createBooking(fixture.customers[0].id, payload),
      ]);
      assert.equal(left.id, right.id);
      assert.equal(await database.experienceBooking.count({ where: { customerId: fixture.customers[0].id } }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2);
    });

    await t.test("concurrent Cook acceptance requests keep one fixed payment deadline and one customer notification", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `accept-${fixture.marker}`,
      });
      const decisions = createDineCookDecisionsService(database);
      const [left, right] = await Promise.all([
        decisions.acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
        decisions.acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
      ]);
      assert.equal(left.status, "ACCEPTED");
      assert.equal(right.status, "ACCEPTED");
      assert.equal(left.paymentExpiresAt.getTime(), right.paymentExpiresAt.getTime());
      assert.equal(left.paymentExpiresAt.getTime() - left.acceptedAt.getTime(), 15 * 60 * 1000);
      assert.equal(await database.userNotification.count({
        where: { userId: fixture.customers[0].id, eventKey: `experience-booking:${booking.id}:cook-accepted:customer:${fixture.customers[0].id}` },
      }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2);
    });

    await t.test("concurrent Dine payment initiation shares one pending attempt and preserves the booking deadline", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `payment-booking-${fixture.marker}`,
      });
      const accepted = await createDineCookDecisionsService(database).acceptBooking({
        bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id,
      });
      const payments = createDinePaymentsService(database);
      const paymentKey = randomUUID();
      const [left, right] = await Promise.all([
        payments.initiatePayment(fixture.customers[0].id, booking.id, paymentKey),
        payments.initiatePayment(fixture.customers[0].id, booking.id, paymentKey),
      ]);
      const differentKeyRetry = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      assert.equal(left.id, right.id);
      assert.equal(differentKeyRetry.id, left.id);
      assert.equal(left.status, "PENDING");
      assert.equal(left.provider, "SIMULATED");
      assert.equal(left.verificationMode, null);
      assert.equal(left.amount, 251);
      assert.equal(left.currency, "INR");
      assert.equal(left.expiresAt.getTime(), accepted.paymentExpiresAt.getTime());
      assert.equal(await database.experiencePaymentAttempt.count({ where: { experienceBookingId: booking.id } }), 1);
      assert.equal((await database.experienceBooking.findUnique({ where: { id: booking.id } })).status, "ACCEPTED");
    });

    await t.test("simulated payment success confirms the booking once and preserves its existing seat hold", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `mock-success-${fixture.marker}`,
      });
      const accepted = await createDineCookDecisionsService(database).acceptBooking({
        bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id,
      });
      const payments = createDinePaymentsService(database);
      const attempt = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      const result = await payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success");
      assert.equal(result.simulated, true);
      assert.equal(result.booking.status, "CONFIRMED");
      assert.equal(result.paymentAttempt.status, "SUCCEEDED");
      assert.equal(result.paymentAttempt.verificationMode, "SIMULATED");
      const replay = await payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success");
      assert.equal(replay.booking.status, "CONFIRMED");
      assert.equal(replay.paymentAttempt.succeededAt.getTime(), result.paymentAttempt.succeededAt.getTime());
      assert.equal(await database.experiencePaymentEvent.count({ where: { paymentAttemptId: attempt.id } }), 2,
        "One initiation event and one deterministic success event are persisted.");
      assert.equal((await database.experienceBooking.findUnique({ where: { id: booking.id } })).paymentExpiresAt.getTime(), accepted.paymentExpiresAt.getTime());
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2, "Success changes hold status but does not decrement held seats again.");
    });

    await t.test("simulated failure leaves the booking accepted and permits a new attempt before the same deadline", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `mock-failure-${fixture.marker}`,
      });
      const accepted = await createDineCookDecisionsService(database).acceptBooking({
        bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id,
      });
      const payments = createDinePaymentsService(database);
      const first = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      const failure = await payments.confirmPayment(fixture.customers[0].id, booking.id, first.id, "failure");
      assert.equal(failure.paymentAttempt.status, "FAILED");
      assert.equal(failure.booking.status, "ACCEPTED");
      const second = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      assert.equal(second.attemptNumber, 2);
      assert.equal(second.expiresAt.getTime(), accepted.paymentExpiresAt.getTime());
      const success = await payments.confirmPayment(fixture.customers[0].id, booking.id, second.id, "success");
      assert.equal(success.booking.status, "CONFIRMED");
      assert.equal(await database.experiencePaymentAttempt.count({ where: { experienceBookingId: booking.id } }), 2);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2);
    });

    await t.test("concurrent success and failure confirmations have one terminal winner", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `mock-race-${fixture.marker}`,
      });
      await createDineCookDecisionsService(database).acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id });
      const payments = createDinePaymentsService(database);
      const attempt = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      const outcomes = await Promise.all([
        payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success"),
        payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "failure"),
      ]);
      const persistedBooking = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      const persistedAttempt = await database.experiencePaymentAttempt.findUnique({ where: { id: attempt.id } });
      assert.ok(["CONFIRMED", "ACCEPTED"].includes(persistedBooking.status));
      assert.ok(["SUCCEEDED", "FAILED"].includes(persistedAttempt.status));
      assert.equal(persistedBooking.status === "CONFIRMED", persistedAttempt.status === "SUCCEEDED");
      assert.ok(outcomes.every((outcome) => ["SUCCEEDED", "FAILED"].includes(outcome.paymentAttempt.status)));
      assert.equal(await database.experiencePaymentEvent.count({ where: { paymentAttemptId: attempt.id, toStatus: { in: ["SUCCEEDED", "FAILED"] } } }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2);
    });

    await t.test("payment deadline expiry marks attempts expired and releases held capacity exactly once", async () => {
      const fixture = await createFixture(3);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `mock-expired-${fixture.marker}`,
      });
      const accepted = await createDineCookDecisionsService(database).acceptBooking({
        bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id,
      });
      const payments = createDinePaymentsService(database);
      const attempt = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      const past = new Date(Date.now() - 1000);
      await database.experienceBooking.update({ where: { id: booking.id }, data: { paymentExpiresAt: past } });
      await database.experiencePaymentAttempt.update({ where: { id: attempt.id }, data: { expiresAt: past } });

      const expired = await createDineBookingExpiryService(database).runBatch();
      assert.deepEqual(expired, { expiredCount: 1, releasedSeats: 2 });
      const persisted = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      const persistedAttempt = await database.experiencePaymentAttempt.findUnique({ where: { id: attempt.id } });
      assert.equal(persisted.status, "EXPIRED");
      assert.equal(persistedAttempt.status, "EXPIRED");
      assert.ok(persisted.expiredAt);
      await assert.rejects(payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success"), { statusCode: 409 });
      assert.deepEqual(await createDineBookingExpiryService(database).runBatch(), { expiredCount: 0, releasedSeats: 0 });
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, fixture.slot.capacity);
      assert.equal(persisted.paymentExpiresAt.getTime(), past.getTime());
      assert.ok(accepted.paymentExpiresAt > past);
    });

    await t.test("payment confirmation transaction rollback preserves attempt, booking, and seats", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `mock-rollback-${fixture.marker}`,
      });
      await createDineCookDecisionsService(database).acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id });
      const attempt = await createDinePaymentsService(database).initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
      const failingDatabase = {
        $transaction: (operation, options) => database.$transaction((tx) => operation(new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "experiencePaymentEvent") {
              return { ...target.experiencePaymentEvent, create: async () => { throw new Error("synthetic Dine payment event failure"); } };
            }
            return Reflect.get(target, property, receiver);
          },
        })), options),
      };
      await assert.rejects(createDinePaymentsService(failingDatabase).confirmPayment(
        fixture.customers[0].id, booking.id, attempt.id, "success",
      ), /synthetic Dine payment event failure/);
      assert.equal((await database.experienceBooking.findUnique({ where: { id: booking.id } })).status, "ACCEPTED");
      assert.equal((await database.experiencePaymentAttempt.findUnique({ where: { id: attempt.id } })).status, "PENDING");
      assert.equal(await database.experiencePaymentEvent.count({ where: { paymentAttemptId: attempt.id, toStatus: "SUCCEEDED" } }), 0);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 2);
    });

    await t.test("three persisted failed attempts prevent a fourth Dine initiation", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `payment-limit-${fixture.marker}`,
      });
      const accepted = await createDineCookDecisionsService(database).acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id });
      await database.experiencePaymentAttempt.createMany({ data: [1, 2, 3].map((attemptNumber) => ({
        experienceBookingId: booking.id,
        attemptNumber,
        idempotencyKey: `already-failed-${fixture.marker}-${attemptNumber}`,
        reference: `TB-FAILED-${fixture.marker}-${attemptNumber}`,
        provider: "SIMULATED",
        amount: "251.00",
        currency: "INR",
        status: "FAILED",
        expiresAt: accepted.paymentExpiresAt,
      })) });
      const results = await Promise.allSettled(Array.from({ length: 4 }, () =>
        createDinePaymentsService(database).initiatePayment(fixture.customers[0].id, booking.id, randomUUID())));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 0);
      assert.ok(results.every((result) => result.status === "rejected" && result.reason?.statusCode === 409));
      assert.equal(await database.experiencePaymentAttempt.count({ where: { experienceBookingId: booking.id } }), 3);
    });

    await t.test("customer cancellation racing simulated payment confirmation preserves one serialized payment/refund outcome", async () => {
      const fixture = await createFixture(4);
      const { booking, attempt, payments } = await createAcceptedBookingWithPayment(fixture, "cancel-payment-race");
      const cancellations = createDineCancellationsService(database);

      // Both operations start together. The booking row lock and guarded state
      // transitions decide whether cancellation precedes payment, or payment
      // confirms first and is then cancelled with one simulated refund.
      const [paymentResult, cancellationResult] = await Promise.allSettled([
        payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success"),
        cancellations.cancelBooking(fixture.customers[0].id, booking.id),
      ]);
      const persistedBooking = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      const persistedAttempt = await database.experiencePaymentAttempt.findUnique({ where: { id: attempt.id } });
      const refunds = await database.experienceRefund.findMany({ where: { paymentAttemptId: attempt.id } });
      const paymentEvents = await database.experiencePaymentEvent.findMany({
        where: { paymentAttemptId: attempt.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const cancellationNotifications = await database.userNotification.count({
        where: { userId: fixture.cookUser.id, eventKey: `experience-booking:${booking.id}:customer-cancelled:cook:${fixture.cookUser.id}` },
      });

      assert.ok(["CONFIRMED", "CANCELLED"].includes(persistedBooking.status));
      assert.equal(paymentEvents.length, 2, "The attempt has one initiation event and one terminal event.");
      assert.equal(paymentEvents.filter(({ toStatus }) => toStatus === persistedAttempt.status).length, 1);
      if (persistedBooking.status === "CONFIRMED") {
        assert.equal(paymentResult.status, "fulfilled");
        assert.equal(persistedAttempt.status, "SUCCEEDED");
        assert.equal(cancellationResult.status, "rejected");
        assert.equal(refunds.length, 0);
        assert.equal(cancellationNotifications, 0);
      } else if (persistedAttempt.status === "SUCCEEDED") {
        // Payment committed first; the later eligible customer cancellation
        // records a demo refund. This is a record only, not a real money return.
        assert.equal(paymentResult.status, "fulfilled");
        assert.equal(cancellationResult.status, "fulfilled");
        assert.equal(refunds.length, 1);
        assert.equal(refunds[0].provider, "SIMULATED");
        assert.equal(refunds[0].verificationMode, "SIMULATED");
        assert.equal(refunds[0].currency, "INR");
        assert.equal(Number(refunds[0].amount), Number(attempt.amount));
        assert.equal(cancellationNotifications, 1);
      } else {
        // Cancellation committed before confirmation and expired the pending
        // attempt, so no successful payment or refund may exist.
        assert.equal(persistedAttempt.status, "EXPIRED");
        assert.equal(cancellationResult.status, "fulfilled");
        assert.equal(paymentResult.status, "rejected");
        assert.equal(refunds.length, 0);
        assert.equal(cancellationNotifications, 1);
      }

      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, persistedBooking.status === "CONFIRMED" ? 2 : 0);
      assert.equal(accounting.persistedSlot.availableSeats, fixture.slot.capacity - accounting.heldGuests);
    });

    await t.test("customer cancellation racing payment-window expiry releases seats and expires the attempt once", async () => {
      const fixture = await createFixture(4);
      const { booking, accepted, attempt } = await createAcceptedBookingWithPayment(fixture, "cancel-expiry-race");
      const expiryAt = new Date(accepted.paymentExpiresAt.getTime() + 1);
      const cancellations = createDineCancellationsService(database, { now: () => expiryAt });
      const expiry = createDineBookingExpiryService(database, { now: () => expiryAt });

      const [cancellationResult, expiryResult] = await Promise.allSettled([
        cancellations.cancelBooking(fixture.customers[0].id, booking.id),
        expiry.runBatch(),
      ]);
      const persistedBooking = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      const persistedAttempt = await database.experiencePaymentAttempt.findUnique({ where: { id: attempt.id } });
      const paymentEvents = await database.experiencePaymentEvent.findMany({ where: { paymentAttemptId: attempt.id } });

      assert.equal(persistedBooking.status, "EXPIRED");
      assert.equal(persistedAttempt.status, "EXPIRED");
      assert.equal(paymentEvents.filter(({ toStatus }) => toStatus === "EXPIRED").length, 1);
      assert.equal(cancellationResult.status, "rejected", "An already-expired hold is not reported as customer-cancelled.");
      assert.equal(cancellationResult.reason?.statusCode, 409);
      assert.equal(expiryResult.status, "fulfilled");
      assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: attempt.id } }), 0);
      assert.equal(await database.userNotification.count({
        where: { userId: fixture.customers[0].id, eventKey: `experience-booking:${booking.id}:payment-timeout:customer:${fixture.customers[0].id}` },
      }), 1);

      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, accounting.persistedSlot.capacity);
    });

    await t.test("concurrent duplicate cancellation persists one linked simulated refund and releases seats once", async () => {
      const fixture = await createFixture(4);
      const { booking, attempt } = await createConfirmedBooking(fixture, "duplicate-cancellation");
      const cancellations = createDineCancellationsService(database);
      const [left, right] = await Promise.all([
        cancellations.cancelBooking(fixture.customers[0].id, booking.id),
        cancellations.cancelBooking(fixture.customers[0].id, booking.id),
      ]);

      assert.equal(left.booking.status, "CANCELLED");
      assert.equal(right.booking.status, "CANCELLED");
      assert.equal(left.refund.id, right.refund.id);
      assert.equal(left.refund.provider, "SIMULATED");
      assert.equal(left.refund.verificationMode, "SIMULATED");
      assert.equal(left.refund.simulated, true);
      assert.equal(left.refund.realMoneyReturned, false);
      assert.equal(left.refund.status, "SUCCEEDED", "Succeeded describes the simulated record only; no provider returned money.");

      const refunds = await database.experienceRefund.findMany({ where: { paymentAttemptId: attempt.id } });
      assert.equal(refunds.length, 1);
      assert.equal(refunds[0].paymentAttemptId, attempt.id);
      assert.equal(refunds[0].idempotencyKey, `experience-booking:${booking.id}:customer-cancellation:refund`);
      assert.equal(refunds[0].currency, "INR");
      assert.equal(Number(refunds[0].amount), Number(attempt.amount));

      const replay = await cancellations.cancelBooking(fixture.customers[0].id, booking.id);
      assert.equal(replay.refund.id, refunds[0].id);
      assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: attempt.id } }), 1);
      assert.equal(await database.userNotification.count({
        where: { userId: fixture.cookUser.id, eventKey: `experience-booking:${booking.id}:customer-cancelled:cook:${fixture.cookUser.id}` },
      }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, accounting.persistedSlot.capacity);
    });

    await t.test("concurrent Cook rejection requests release held seats and notify exactly once", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `reject-${fixture.marker}`,
      });
      const decisions = createDineCookDecisionsService(database);
      const results = await Promise.all([
        decisions.rejectBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
        decisions.rejectBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
      ]);
      assert.deepEqual(results.map(({ status }) => status), ["REJECTED", "REJECTED"]);
      assert.equal(await database.userNotification.count({
        where: { userId: fixture.customers[0].id, eventKey: `experience-booking:${booking.id}:cook-rejected:customer:${fixture.customers[0].id}` },
      }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, accounting.persistedSlot.capacity);
    });

    await t.test("concurrent Cook accept/reject decisions have one winner and preserve exact capacity accounting", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `decision-race-${fixture.marker}`,
      });
      const decisions = createDineCookDecisionsService(database);
      const results = await Promise.allSettled([
        decisions.acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
        decisions.rejectBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
      ]);
      const persisted = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      assert.ok(["ACCEPTED", "REJECTED"].includes(persisted.status));
      const acceptedKey = `experience-booking:${booking.id}:cook-accepted:customer:${fixture.customers[0].id}`;
      const rejectedKey = `experience-booking:${booking.id}:cook-rejected:customer:${fixture.customers[0].id}`;
      const acceptedNotifications = await database.userNotification.count({ where: { eventKey: acceptedKey } });
      const rejectedNotifications = await database.userNotification.count({ where: { eventKey: rejectedKey } });
      assert.equal(acceptedNotifications + rejectedNotifications, 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      if (persisted.status === "ACCEPTED") {
        assert.equal(results[0].status, "fulfilled");
        assert.equal(accounting.heldGuests, 2);
        assert.equal(accounting.persistedSlot.availableSeats, 2);
        assert.equal(persisted.paymentExpiresAt.getTime() - persisted.acceptedAt.getTime(), 15 * 60 * 1000);
      } else {
        assert.equal(results[1].status, "fulfilled");
        assert.equal(accounting.heldGuests, 0);
        assert.equal(accounting.persistedSlot.availableSeats, 4);
      }
    });

    await t.test("Cook rejection and response-timeout worker race cannot release the same seats twice", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `timeout-race-${fixture.marker}`,
      });
      await database.experienceBooking.update({ where: { id: booking.id }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
      const [decisionResult, expiryResult] = await Promise.allSettled([
        createDineCookDecisionsService(database).rejectBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
        createDineBookingExpiryService(database).runBatch(),
      ]);
      assert.equal(decisionResult.status, "rejected", "an already-expired request must not be rejected or accepted by the Cook");
      assert.equal(expiryResult.status, "fulfilled");
      const persisted = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      assert.equal(persisted.status, "EXPIRED");
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, accounting.persistedSlot.capacity);
      const timeoutKey = `experience-booking:${booking.id}:response-timeout:customer:${fixture.customers[0].id}`;
      const rejectKey = `experience-booking:${booking.id}:cook-rejected:customer:${fixture.customers[0].id}`;
      assert.equal(await database.userNotification.count({ where: { eventKey: timeoutKey } }), 1);
      assert.equal(await database.userNotification.count({ where: { eventKey: rejectKey } }), 0);
    });

    await t.test("failed Cook decision notification rolls back booking state and seat release", async () => {
      const fixture = await createFixture(3);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `decision-rollback-${fixture.marker}`,
      });
      const service = createDineCookDecisionsService(database, {
        notificationServiceFactory: () => ({ create: async () => { throw new Error("synthetic Cook decision notification failure"); } }),
      });
      await assert.rejects(service.rejectBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }), /synthetic Cook decision notification failure/);
      assert.equal((await database.experienceBooking.findUnique({ where: { id: booking.id } })).status, "PENDING");
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, 1);
    });

    await t.test("capacity reduction racing with a reservation cannot oversell", async () => {
      const fixture = await createFixture(3);
      const service = createDineBookingsService(database);
      const cookService = createCookExperiencesService(database);
      const results = await Promise.allSettled([
        service.createBooking(fixture.customers[0].id, {
          experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 3, idempotencyKey: `capacity-race-${fixture.marker}`,
        }),
        cookService.updateSlot(fixture.cookUser.cookProfile.id, fixture.experience.id, fixture.slot.id, { capacity: 2 }),
      ]);
      assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1, "Either the booking holds all seats or the capacity reduction wins.");
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      if (results[0].status === "fulfilled") {
        assert.equal(accounting.persistedSlot.capacity, 3);
        assert.equal(accounting.heldGuests, 3);
        assert.equal(accounting.persistedSlot.availableSeats, 0);
      } else {
        assert.equal(accounting.persistedSlot.capacity, 2);
        assert.equal(accounting.heldGuests, 0);
        assert.equal(accounting.persistedSlot.availableSeats, 2);
      }
    });

    const createExpiredHold = async (capacity = 5, guests = 2, customerCount = 1) => {
      const fixture = await createFixture(capacity, customerCount);
      const service = createDineBookingsService(database);
      const rows = [];
      for (let index = 0; index < customerCount; index += 1) {
        rows.push(await service.createBooking(fixture.customers[index].id, {
          experienceId: fixture.experience.id,
          slotId: fixture.slot.id,
          numberOfGuests: guests,
          idempotencyKey: `expiry-${fixture.marker}-${index}`,
        }));
      }
      await database.experienceBooking.updateMany({
        where: { id: { in: rows.map(({ id }) => id) }, status: "PENDING" },
        data: { holdExpiresAt: new Date(Date.now() - 1000) },
      });
      return { ...fixture, bookings: rows };
    };
    await t.test("scheduler startup after restart expires persisted overdue holds without a booking request", async () => {
      const fixture = await createExpiredHold();
      const restartedWorker = createDineBookingExpiryService(database);
      const scheduler = createDineBookingExpiryScheduler({
        service: restartedWorker,
        intervalMs: 60_000,
        log: { info() {}, warn() {}, error() {} },
      });
      const schedulerHandle = scheduler.start();
      const firstRun = await scheduler.runTick();
      assert.deepEqual(firstRun, { expiredCount: 1, releasedSeats: 2 });
      await schedulerHandle.stop();
      assert.equal((await database.experienceBooking.findUnique({ where: { id: fixture.bookings[0].id } })).status, "EXPIRED");
      assert.equal((await assertExactSlotAccounting(fixture.slot.id)).persistedSlot.availableSeats, fixture.slot.capacity);

      assert.deepEqual(await createDineBookingExpiryService(database).runBatch(), { expiredCount: 0, releasedSeats: 0 });
    });

    await t.test("concurrent workers on one slot expire each hold once with exact capacity accounting", async () => {
      const fixture = await createExpiredHold(4, 2, 2);
      const workers = [createDineBookingExpiryService(database), createDineBookingExpiryService(database)];
      const runs = await Promise.all(workers.map((worker) => worker.runBatch()));
      assert.equal(runs.reduce((sum, result) => sum + result.expiredCount, 0), 2);
      assert.equal(await database.experienceBooking.count({ where: { slotId: fixture.slot.id, status: "EXPIRED" } }), 2);
      const { persistedSlot, heldGuests } = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(heldGuests, 0);
      assert.equal(persistedSlot.availableSeats, persistedSlot.capacity);
    });

    await t.test("response timeout and Cook acceptance racing at the deadline leave one consistent hold", async () => {
      const fixture = await createFixture(4);
      const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `accept-timeout-race-${fixture.marker}`,
      });
      const persistedBefore = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      const acceptanceAt = new Date(persistedBefore.holdExpiresAt.getTime() - 1);
      const expiryAt = new Date(persistedBefore.holdExpiresAt.getTime() + 1);
      const [acceptResult, expiryResult] = await Promise.allSettled([
        createDineCookDecisionsService(database, { now: () => acceptanceAt })
          .acceptBooking({ bookingId: booking.id, cookId: fixture.cookUser.cookProfile.id }),
        createDineBookingExpiryService(database, { now: () => expiryAt }).runBatch(),
      ]);
      assert.equal(expiryResult.status, "fulfilled");
      const bookingRow = await database.experienceBooking.findUnique({ where: { id: booking.id } });
      assert.ok(["EXPIRED", "ACCEPTED"].includes(bookingRow.status));
      const acceptedKey = `experience-booking:${booking.id}:cook-accepted:customer:${fixture.customers[0].id}`;
      const timeoutKey = `experience-booking:${booking.id}:response-timeout:customer:${fixture.customers[0].id}`;
      assert.equal(await database.userNotification.count({ where: { eventKey: acceptedKey } })
        + await database.userNotification.count({ where: { eventKey: timeoutKey } }), 1);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      if (bookingRow.status === "EXPIRED") {
        assert.equal(accounting.heldGuests, 0);
        assert.equal(accounting.persistedSlot.availableSeats, fixture.slot.capacity);
        assert.equal(acceptResult.status, "rejected");
      } else {
        assert.equal(acceptResult.status, "fulfilled");
        assert.equal(accounting.heldGuests, 2);
        assert.equal(accounting.persistedSlot.availableSeats, accounting.persistedSlot.capacity - 2);
        assert.equal(bookingRow.paymentExpiresAt.getTime() - bookingRow.acceptedAt.getTime(), 15 * 60 * 1000);
      }
    });

    await t.test("expiry racing Cook capacity reduction keeps expired seats out of active booking totals", async () => {
      const fixture = await createExpiredHold(5, 2);
      const worker = createDineBookingExpiryService(database);
      const cook = createCookExperiencesService(database);
      const outcomes = await Promise.allSettled([
        worker.runBatch(),
        cook.updateSlot(fixture.cookUser.cookProfile.id, fixture.experience.id, fixture.slot.id, { capacity: 1 }),
      ]);
      assert.equal(outcomes[1].status, "fulfilled", `Cook capacity edit should retry after expiry coordination: ${outcomes[1].status === "rejected" ? JSON.stringify({ code: outcomes[1].reason?.code, meta: outcomes[1].reason?.meta }) : ""}`);
      const final = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(final.heldGuests, 0);
      assert.equal(final.persistedSlot.capacity, 1);
      assert.equal(final.persistedSlot.availableSeats, 1);
      assert.equal((await database.experienceBooking.findUnique({ where: { id: fixture.bookings[0].id } })).status, "EXPIRED");
    });

    await t.test("expiry transaction failure rolls back both booking state and seat restoration", async () => {
      const fixture = await createExpiredHold();
      await assert.rejects(database.$transaction(async (tx) => {
        await expireDueBookingsForSlot(tx, fixture.slot.id, new Date());
        throw new Error("synthetic transaction failure after release");
      }, { isolationLevel: "Serializable" }), /synthetic transaction failure/);
      assert.equal((await database.experienceBooking.findUnique({ where: { id: fixture.bookings[0].id } })).status, "PENDING");
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 2);
      assert.equal(accounting.persistedSlot.availableSeats, fixture.slot.capacity - 2);
    });

    await t.test("a notification insertion failure rolls back booking and seat changes", async () => {
      const fixture = await createFixture(3);
      const service = createDineBookingsService(database, {
        notificationServiceFactory: () => ({ create: async () => { throw new Error("synthetic notification failure"); } }),
      });
      await assert.rejects(service.createBooking(fixture.customers[0].id, {
        experienceId: fixture.experience.id, slotId: fixture.slot.id, numberOfGuests: 2, idempotencyKey: `rollback-${fixture.marker}`,
      }), /synthetic notification failure/);
      assert.equal(await database.experienceBooking.count({ where: { customerId: fixture.customers[0].id } }), 0);
      const accounting = await assertExactSlotAccounting(fixture.slot.id);
      assert.equal(accounting.heldGuests, 0);
      assert.equal(accounting.persistedSlot.availableSeats, 3);
    });

    await t.test("PostgreSQL Workshop submission, Admin review, discovery, booking, cancellation, payment, and completion lifecycle", async (workshopTest) => {
      assert.ok(env.JWT_SECRET, "JWT_SECRET must be configured for isolated Workshop API checks.");
      const server = createServer(app);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const admin = await database.user.create({ data: {
        name: "Workshop integration admin",
        email: `workshop-admin-${randomUUID()}@example.invalid`,
        passwordHash: "integration-test-only-not-a-credential",
        role: "ADMIN",
      } });
      ownedUserIds.add(admin.id);
      const tokenFor = (user, role) => jwt.sign({ userId: user.id, role, activePortal: role }, env.JWT_SECRET, { expiresIn: "5m" });
      const request = async (path, { token, method = "GET", body } = {}) => fetch(`${baseUrl}${path}`, {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const adminToken = tokenFor(admin, "ADMIN");
      const discoverWorkshops = async () => request("/api/v1/experiences?type=WORKSHOP&page=1&limit=50&sort=newest");
      const adminReview = (workshopId, body, token = adminToken) => request(`/api/v1/admin/workshops/${workshopId}/review`, {
        token, method: "PATCH", body,
      });

      const createPaidWorkshopBooking = async ({ startAt, guestCount = 1 } = {}) => {
        const fixture = await createFixture(3, 1);
        const { workshop } = await submitWorkshop(fixture);
        const approval = await createAdminWorkshopReviewService(database).review(workshop.id, { action: "APPROVE" });
        assert.equal(approval.status, "PUBLISHED");
        const booking = await createDineBookingsService(database).createBooking(fixture.customers[0].id, {
          experienceId: workshop.id,
          slotId: workshop.slots[0].id,
          numberOfGuests: guestCount,
          idempotencyKey: randomUUID(),
        });
        await createDineCookDecisionsService(database).acceptBooking({
          bookingId: booking.id,
          cookId: fixture.cookUser.cookProfile.id,
        });
        const payments = createDinePaymentsService(database, { allowMockPayments: true });
        const attempt = await payments.initiatePayment(fixture.customers[0].id, booking.id, randomUUID());
        const result = await payments.confirmPayment(fixture.customers[0].id, booking.id, attempt.id, "success");
        assert.equal(result.booking.status, "CONFIRMED");
        if (startAt) {
          const start = new Date(startAt);
          await database.experienceSlot.update({
            where: { id: workshop.slots[0].id },
            data: { startsAt: start, endsAt: new Date(start.getTime() + 90 * 60_000) },
          });
        }
        return { fixture, workshop, booking, payments };
      };

      try {
        const ownerFixture = await createFixture(4, 2);
        const { workshop, input, imageUrl } = await submitWorkshop(ownerFixture, { capacity: 1 });
        await workshopTest.test("Cook submission persists pending Workshop fields and an open initial slot; pending stays hidden", async () => {
          assert.equal(workshop.type, "WORKSHOP");
          assert.equal(workshop.status, "PENDING");
          assert.equal(workshop.teachingContent, input.teachingContent);
          assert.equal(workshop.learningOutcomes, input.learningOutcomes);
          assert.equal(workshop.materialsToBring, input.materialsToBring);
          assert.equal(workshop.image, imageUrl);
          assert.equal(workshop.pricePerPerson, input.pricePerPerson);
          assert.equal(workshop.slots.length, 1);
          assert.equal(workshop.slots[0].status, "OPEN");
          assert.equal(workshop.slots[0].capacity, 1);
          assert.equal(workshop.slots[0].availableSeats, 1);
          assert.equal(workshop.slots[0].startsAt.toISOString(), input.startsAt);
          assert.equal(workshop.slots[0].endsAt.getTime() - workshop.slots[0].startsAt.getTime(), 90 * 60_000);
          const result = await discoverWorkshops();
          assert.equal(result.status, 200);
          const payload = await result.json();
          assert.equal(payload.data.items.some((item) => item.id === workshop.id), false);
        });

        await workshopTest.test("Cook ownership and Admin authorization prevent cross-owner review or changes", async () => {
          const otherFixture = await createFixture(2);
          const wrongCook = createCookExperiencesService(database);
          await assert.rejects(
            wrongCook.publish(otherFixture.cookUser.cookProfile.id, workshop.id),
            { statusCode: 404 },
          );
          await assert.rejects(
            wrongCook.updateDraft(otherFixture.cookUser.cookProfile.id, workshop.id, { description: "An unauthorized replacement description." }),
            { statusCode: 404 },
          );
          const forbiddenReview = await adminReview(workshop.id, { action: "REJECT", rejectionReason: "Not an Admin" }, tokenFor(ownerFixture.cookUser, "COOK"));
          assert.equal(forbiddenReview.status, 403);
          assert.equal((await database.experience.findUnique({ where: { id: workshop.id } })).status, "PENDING");
        });

        const rejectedFixture = await createFixture(2);
        const rejected = await submitWorkshop(rejectedFixture);
        await workshopTest.test("Admin rejection persists its reason and rejected Workshop remains hidden", async () => {
          const response = await adminReview(rejected.workshop.id, { action: "REJECT", rejectionReason: "Please add clearer learning details." });
          assert.equal(response.status, 200);
          const row = await database.experience.findUnique({ where: { id: rejected.workshop.id } });
          assert.equal(row.status, "REJECTED");
          assert.equal(row.reviewRejectionReason, "Please add clearer learning details.");
          const result = await discoverWorkshops();
          const payload = await result.json();
          assert.equal(payload.data.items.some((item) => item.id === rejected.workshop.id), false);
        });

        await workshopTest.test("Admin approval exposes Workshop; concurrent API booking requests cannot overbook and appear in both portals", async () => {
          const response = await adminReview(workshop.id, { action: "APPROVE" });
          assert.equal(response.status, 200);
          const row = await database.experience.findUnique({ where: { id: workshop.id } });
          assert.equal(row.status, "PUBLISHED");
          const publicResponse = await discoverWorkshops();
          assert.equal(publicResponse.status, 200);
          const publicPayload = await publicResponse.json();
          const publicWorkshop = publicPayload.data.items.find((item) => item.id === workshop.id);
          assert.ok(publicWorkshop);
          assert.equal(publicWorkshop.image, imageUrl);
          assert.equal(publicWorkshop.teachingContent, input.teachingContent);
          assert.equal(publicWorkshop.slots[0].availableSeats, 1);

          const customers = ownerFixture.customers;
          const createRequest = (customer) => request("/api/v1/events/bookings", {
            token: tokenFor(customer, "CUSTOMER"), method: "POST",
            body: { experienceId: workshop.id, slotId: workshop.slots[0].id, numberOfGuests: 1, idempotencyKey: randomUUID() },
          });
          const outcomes = await Promise.all(customers.map(createRequest));
          assert.deepEqual(outcomes.map(({ status }) => status).sort(), [201, 409]);
          const persisted = await database.experienceBooking.findMany({ where: { experienceId: workshop.id } });
          assert.equal(persisted.length, 1);
          assert.equal(persisted[0].status, "PENDING");
          const accounting = await assertExactSlotAccounting(workshop.slots[0].id);
          assert.equal(accounting.heldGuests, 1);
          assert.equal(accounting.persistedSlot.availableSeats, 0);
          const bookingCustomer = customers.find(({ id }) => id === persisted[0].customerId);
          const customerHistory = await request("/api/v1/events/my-bookings", { token: tokenFor(bookingCustomer, "CUSTOMER") });
          assert.equal(customerHistory.status, 200);
          assert.ok((await customerHistory.json()).data.items.some(({ id }) => id === persisted[0].id));
          const cookHistory = await request("/api/v1/cooks/experience-bookings", { token: tokenFor(ownerFixture.cookUser, "COOK") });
          assert.equal(cookHistory.status, 200);
          assert.ok((await cookHistory.json()).data.items.some(({ id }) => id === persisted[0].id));
        });

        await workshopTest.test("Workshop payment failure/retry and exact cancellation cutoff persist a simulated refund and release seats once", async () => {
          const persisted = await database.experienceBooking.findFirst({ where: { experienceId: workshop.id } });
          const customer = ownerFixture.customers.find(({ id }) => id === persisted.customerId);
          await createDineCookDecisionsService(database).acceptBooking({ bookingId: persisted.id, cookId: ownerFixture.cookUser.cookProfile.id });
          const payments = createDinePaymentsService(database, { allowMockPayments: true });
          const first = await payments.initiatePayment(customer.id, persisted.id, randomUUID());
          const failed = await payments.confirmPayment(customer.id, persisted.id, first.id, "failure");
          assert.equal(failed.paymentAttempt.status, "FAILED");
          assert.equal(failed.booking.status, "ACCEPTED");
          const second = await payments.initiatePayment(customer.id, persisted.id, randomUUID());
          const succeeded = await payments.confirmPayment(customer.id, persisted.id, second.id, "success");
          assert.equal(succeeded.paymentAttempt.status, "SUCCEEDED");
          assert.equal(succeeded.booking.status, "CONFIRMED");

          const settings = await database.platformSettings.findUnique({ where: { id: "default" } });
          const windowHours = settings?.experienceCancellationWindowHours ?? 48;
          const boundary = new Date();
          await database.experienceSlot.update({
            where: { id: workshop.slots[0].id },
            data: {
              startsAt: new Date(boundary.getTime() + windowHours * 60 * 60_000),
              endsAt: new Date(boundary.getTime() + windowHours * 60 * 60_000 + 90 * 60_000),
            },
          });
          const cancellations = createDineCancellationsService(database, { now: () => boundary });
          const requested = await cancellations.requestCancellation(customer.id, persisted.id, "Workshop schedule changed for this test.");
          assert.equal(requested.booking.cancellationStatus, "PENDING");
          assert.equal((await assertExactSlotAccounting(workshop.slots[0].id)).persistedSlot.availableSeats, 0);
          const cancelled = await cancellations.approveCancellation(ownerFixture.cookUser.cookProfile.id, persisted.id);
          assert.equal(cancelled.booking.status, "CANCELLED");
          assert.equal(cancelled.refund.amount, 250);
          assert.equal(cancelled.refund.provider, "SIMULATED");
          assert.equal(cancelled.refund.realMoneyReturned, false);
          assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: second.id } }), 1);
          assert.equal((await assertExactSlotAccounting(workshop.slots[0].id)).persistedSlot.availableSeats, 1);
          const retry = await cancellations.approveCancellation(ownerFixture.cookUser.cookProfile.id, persisted.id);
          assert.equal(retry.booking.status, "CANCELLED");
          assert.equal(await database.experienceRefund.count({ where: { paymentAttemptId: second.id } }), 1);
          assert.equal((await assertExactSlotAccounting(workshop.slots[0].id)).persistedSlot.availableSeats, 1);
        });

        await workshopTest.test("persisted Workshop cutoff is checked before, at, and after the deadline; completion emits one review request", async () => {
          const afterWindowHours = (await database.platformSettings.findUnique({ where: { id: "default" } }))?.experienceCancellationWindowHours ?? 48;
          const afterBoundary = new Date();
          const before = await createPaidWorkshopBooking({ startAt: new Date(afterBoundary.getTime() + afterWindowHours * 60 * 60_000 + 1) });
          const beforeRequest = await createDineCancellationsService(database, { now: () => afterBoundary })
            .requestCancellation(before.fixture.customers[0].id, before.booking.id, "Workshop schedule changed before the cutoff.");
          assert.equal(beforeRequest.booking.cancellationStatus, "PENDING");

          const after = await createPaidWorkshopBooking({ startAt: new Date(afterBoundary.getTime() + afterWindowHours * 60 * 60_000 - 1) });
          await assert.rejects(
            createDineCancellationsService(database, { now: () => afterBoundary })
              .requestCancellation(after.fixture.customers[0].id, after.booking.id, "Too close to the Workshop date."),
            { statusCode: 409 },
          );
          assert.equal((await database.experienceBooking.findUnique({ where: { id: after.booking.id } })).cancellationStatus, null);

          const eligible = await createPaidWorkshopBooking({});
          const completedAt = new Date();
          await database.experienceSlot.update({
            where: { id: eligible.workshop.slots[0].id },
            data: { startsAt: new Date(completedAt.getTime() - 90 * 60_000), endsAt: new Date(completedAt.getTime() - 1) },
          });
          const completed = await createExperienceBookingsService(database, { now: () => completedAt })
            .completeBooking({ bookingId: eligible.booking.id, cookId: eligible.fixture.cookUser.cookProfile.id });
          assert.equal(completed.status, "COMPLETED");
          const reviewEventKey = `experience-booking:${eligible.booking.id}:review-request:customer:${eligible.fixture.customers[0].id}`;
          assert.equal(await database.userNotification.count({ where: { eventKey: reviewEventKey } }), 1);
          await createExperienceBookingsService(database, { now: () => completedAt })
            .completeBooking({ bookingId: eligible.booking.id, cookId: eligible.fixture.cookUser.cookProfile.id });
          assert.equal(await database.userNotification.count({ where: { eventKey: reviewEventKey } }), 1);
        });
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  } finally {
    if (ownedUserIds.size) {
      await database.$transaction(async (tx) => {
        const customerIds = [...ownedCustomerIds];
        const experienceIds = [...ownedExperienceIds];
        const slotIds = [...ownedSlotIds];
        const userIds = [...ownedUserIds];
        const ownedBookings = customerIds.length
          ? await tx.experienceBooking.findMany({
            where: { customerId: { in: customerIds } },
            select: { id: true },
          })
          : [];
        const bookingIds = ownedBookings.map(({ id }) => id);

        // Never let Experience/Slot cascades remove a booking from outside
        // this run. Check before deleting anything so a mismatch rolls back
        // the whole cleanup transaction without partially removing fixtures.
        if (experienceIds.length || slotIds.length) {
          const externalBookings = await tx.experienceBooking.findMany({
            where: {
              id: { notIn: bookingIds },
              OR: [
                ...(experienceIds.length ? [{ experienceId: { in: experienceIds } }] : []),
                ...(slotIds.length ? [{ slotId: { in: slotIds } }] : []),
              ],
            },
            select: { id: true },
            take: 1,
          });
          assert.equal(externalBookings.length, 0,
            "Refusing fixture teardown because an unowned booking references a fixture experience or slot.");
        }

        const ownedAttempts = bookingIds.length
          ? await tx.experiencePaymentAttempt.findMany({
            where: { experienceBookingId: { in: bookingIds } },
            select: { id: true },
          })
          : [];
        const attemptIds = ownedAttempts.map(({ id }) => id);

        // Respect the restrictive payment/refund and review foreign keys.
        if (attemptIds.length) {
          await tx.experienceRefund.deleteMany({ where: { paymentAttemptId: { in: attemptIds } } });
          await tx.experiencePaymentEvent.deleteMany({ where: { paymentAttemptId: { in: attemptIds } } });
          await tx.experiencePaymentAttempt.deleteMany({ where: { id: { in: attemptIds } } });
        }
        if (bookingIds.length) {
          await tx.review.deleteMany({ where: { experienceBookingId: { in: bookingIds } } });
        }
        if (userIds.length) {
          await tx.userNotification.deleteMany({ where: { userId: { in: userIds } } });
        }
        if (bookingIds.length) {
          await tx.experienceBooking.deleteMany({ where: { id: { in: bookingIds } } });
        }
        if (slotIds.length) {
          await tx.experienceSlot.deleteMany({ where: { id: { in: slotIds } } });
        }
        if (experienceIds.length) {
          await tx.experience.deleteMany({ where: { id: { in: experienceIds } } });
        }
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
      }, { isolationLevel: "Serializable" });
    }
    await database.$disconnect();
    await pool.end();
    await appPrisma.$disconnect();
  }
});
