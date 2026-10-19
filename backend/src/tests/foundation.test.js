import assert from "node:assert/strict";
import test from "node:test";
import { assertActiveAccount, requireApprovedCook } from "../middlewares/auth.js";
import { HTTP_STATUS } from "../constants/index.js";
import { hasValidFileSignature } from "../utils/fileUpload.js";
import {
  isCookEligibleToSell,
  publicDishStory,
  publicDishesWhere,
  getDishCustomerVisibility,
} from "../utils/marketplaceSecurity.js";
import { cookSellingReadinessWhere } from "../utils/cookReadiness.js";

const checkCookAuthorization = (user) => {
  let nextError;
  let continued = false;
  requireApprovedCook({ user }, {}, (error) => {
    nextError = error;
    continued = !error;
  });
  return { nextError, continued };
};

test("approved cook authorization requires an authenticated user", () => {
  const { nextError, continued } = checkCookAuthorization(null);
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.UNAUTHORIZED);
});

test("approved cook profile is authorized only in the active Cook portal", () => {
  const { nextError, continued } = checkCookAuthorization({
    status: "ACTIVE",
    role: "COOK",
    activePortal: "COOK",
    cookProfile: { verificationStatus: "APPROVED" },
  });
  assert.equal(continued, true);
  assert.equal(nextError, undefined);

  const customerPortal = checkCookAuthorization({
    status: "ACTIVE",
    role: "CUSTOMER",
    activePortal: "CUSTOMER",
    cookProfile: { verificationStatus: "APPROVED" },
  });
  assert.equal(customerPortal.continued, false);
  assert.equal(customerPortal.nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("COOK role with pending application is denied", () => {
  const { nextError, continued } = checkCookAuthorization({
    role: "COOK",
    cookProfile: { verificationStatus: "PENDING" },
  });
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("rejected cook application is denied", () => {
  const { nextError, continued } = checkCookAuthorization({
    role: "COOK",
    cookProfile: { verificationStatus: "REJECTED" },
  });
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("customer without cook approval is denied", () => {
  const { nextError, continued } = checkCookAuthorization({
    role: "CUSTOMER",
    cookProfile: null,
  });
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("missing cook profile is denied even when the user has the COOK role", () => {
  const { nextError, continued } = checkCookAuthorization({
    role: "COOK",
    cookProfile: null,
  });
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("only ACTIVE accounts pass the protected-account status check", () => {
  assert.doesNotThrow(() => assertActiveAccount({ status: "ACTIVE" }));
  for (const status of ["PENDING", "SUSPENDED", "DEACTIVATED"]) {
    assert.throws(
      () => assertActiveAccount({ status }),
      (error) => error.statusCode === HTTP_STATUS.FORBIDDEN
    );
  }
});

test("approved cook panel authorization also requires an ACTIVE account", () => {
  const { nextError, continued } = checkCookAuthorization({
    status: "PENDING",
    role: "COOK",
    cookProfile: { verificationStatus: "APPROVED" },
  });
  assert.equal(continued, false);
  assert.equal(nextError.statusCode, HTTP_STATUS.FORBIDDEN);
});

test("upload content signatures must match the allowed declared MIME type", () => {
  assert.equal(hasValidFileSignature("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(hasValidFileSignature("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(
    hasValidFileSignature("image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    true
  );
  assert.equal(
    hasValidFileSignature("image/webp", Buffer.from("RIFF0000WEBP")),
    true
  );
  assert.equal(hasValidFileSignature("application/pdf", Buffer.from("not a pdf")), false);
  assert.equal(hasValidFileSignature("image/png", Buffer.from("RIFF0000WEBP")), false);
});

test("public dish stories exclude private and archive-only content", () => {
  const story = {
    whoTaught: "Grandmother",
    occasion: "Festival",
    culturalSignificance: "A family tradition",
    storyText: "A public story",
    visibility: "PUBLIC",
    internalField: "not selected by the public serializer",
  };

  assert.deepEqual(publicDishStory(story), {
    whoTaught: "Grandmother",
    occasion: "Festival",
    culturalSignificance: "A family tradition",
    storyText: "A public story",
    visibility: "PUBLIC",
  });
  assert.equal(publicDishStory({ ...story, visibility: "PRIVATE" }), null);
  assert.equal(publicDishStory({ ...story, visibility: "ARCHIVE_ONLY" }), null);
  assert.equal(publicDishStory(null), null);
});

test("public dish query requires active seller approvals, open kitchen, and unexpired FSSAI", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const where = publicDishesWhere("category-1", now);
  assert.deepEqual(where, {
    categoryId: "category-1",
    status: "PUBLISHED",
    isAvailable: true,
    availableQuantity: { gt: 0 },
    cook: {
      is: {
        ...cookSellingReadinessWhere(now),
        isOpen: true,
      },
    },
  });
});

test("published dish visibility reports clear reasons and hides expired FSSAI", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const cook = {
    businessName: "Kitchen",
    bio: "A home kitchen cooking regional family recipes.",
    experienceYears: "5 years",
    specialization: "Regional food",
    cuisines: ["Regional"],
    dietaryPreferences: ["Vegetarian"],
    city: "Jaipur",
    locality: "Mansarovar",
    cookingCapacity: "10 meals",
    prepTimeNotice: "One day",
    availableDays: ["Monday"],
    availableMealSlots: ["Lunch"],
    isHomeKitchenDeclared: true,
    foodSafetyConsent: true,
    verificationStatus: "APPROVED",
    fssaiStatus: "APPROVED",
    isApprovedToSell: true,
    isOpen: true,
    fssaiExpiryDate: new Date("2025-12-31T23:59:59Z"),
    user: { role: "COOK", status: "ACTIVE" },
  };
  const dish = { status: "PUBLISHED", isAvailable: true, availableQuantity: 4 };
  assert.deepEqual(getDishCustomerVisibility(dish, cook, "ACTIVE", now), {
    isVisible: false,
    reasons: ["Upload a renewed certificate and request a new review."],
  });
  assert.match(getDishCustomerVisibility(dish, { ...cook, fssaiExpiryDate: null, fssaiStatus: "SUBMITTED" }, "ACTIVE", now).reasons[0], /waiting for admin review/);
  assert.equal(getDishCustomerVisibility(dish, { ...cook, fssaiExpiryDate: null }, "ACTIVE", now).isVisible, false);
  assert.ok(getDishCustomerVisibility({ ...dish, availableQuantity: 0 }, cook, "ACTIVE", now).reasons.includes("Sold out"));
});

test("dish publishing requires both cook verification and sale approval", () => {
  const readyCook = {
    businessName: "Kitchen",
    bio: "A home kitchen cooking regional family recipes.",
    experienceYears: "5 years",
    specialization: "Regional food",
    cuisines: ["Regional"],
    dietaryPreferences: ["Vegetarian"],
    city: "Jaipur",
    locality: "Mansarovar",
    cookingCapacity: "10 meals",
    prepTimeNotice: "One day",
    availableDays: ["Monday"],
    availableMealSlots: ["Lunch"],
    isHomeKitchenDeclared: true,
    foodSafetyConsent: true,
    verificationStatus: "APPROVED",
    fssaiStatus: "APPROVED",
    isApprovedToSell: true,
    fssaiExpiryDate: new Date("2027-01-01"),
    user: { role: "COOK", status: "ACTIVE" },
  };
  assert.equal(
    isCookEligibleToSell(readyCook),
    true
  );
  assert.equal(
    isCookEligibleToSell({ ...readyCook, verificationStatus: "PENDING" }),
    false
  );
  assert.equal(
    isCookEligibleToSell({ ...readyCook, fssaiStatus: "SUBMITTED" }),
    false
  );
  assert.equal(
    isCookEligibleToSell({ ...readyCook, isApprovedToSell: false }),
    false
  );
  assert.equal(isCookEligibleToSell(null), false);
});
