import assert from "node:assert/strict";
import test from "node:test";
import {
  COOK_PROFILE_TEXT_MINIMUMS,
  cookSellingReadinessWhere,
  findCookProfilesWithValidRequiredText,
  getCookSellingReadiness,
} from "../utils/cookReadiness.js";
import { cookApplicationSchema, kitchenUpdateSchema } from "../modules/cook/cook.validation.js";
import { isCookEligibleToSell } from "../utils/marketplaceSecurity.js";

const now = new Date("2026-10-15T12:00:00.000Z");

const readyCook = (overrides = {}) => ({
  businessName: "Radha's Kitchen",
  bio: "Traditional food cooked with care and shared with our community.",
  experienceYears: "10 years",
  specialization: "Rajasthani cuisine",
  cuisines: ["Rajasthani"],
  dietaryPreferences: ["Vegetarian"],
  city: "Jaipur",
  locality: "Mansarovar",
  cookingCapacity: "20 meals per day",
  availableDays: ["Monday"],
  availableMealSlots: ["Lunch"],
  prepTimeNotice: "One day",
  isHomeKitchenDeclared: true,
  foodSafetyConsent: true,
  verificationStatus: "APPROVED",
  fssaiStatus: "APPROVED",
  fssaiExpiryDate: new Date("2027-06-30T23:59:59.999Z"),
  isApprovedToSell: true,
  user: { role: "COOK", status: "ACTIVE" },
  ...overrides,
});

test("a cook with completed profile, active account, approvals, and valid FSSAI is ready to sell", () => {
  const result = getCookSellingReadiness(readyCook(), now);
  assert.equal(result.readyToSell, true);
  assert.deepEqual(result.pendingRequirements, []);
  assert.ok(result.checklist.every((item) => item.complete));
  assert.equal(result.checklist.find((item) => item.id === "active-cook-account").message, "Your active cook account is ready.");
});

test("required profile fields and food-safety commitments are checked", () => {
  const result = getCookSellingReadiness(readyCook({
    bio: null,
    cuisines: [],
    isHomeKitchenDeclared: false,
    foodSafetyConsent: false,
  }), now);
  const profile = result.checklist.find((item) => item.id === "kitchen-profile");
  assert.equal(profile.complete, false);
  assert.match(profile.message, /Cooking introduction/);
  assert.match(profile.message, /regional cuisine/);
  assert.match(profile.message, /home-kitchen declaration/);
  assert.match(profile.message, /Food Safety & Hygiene Agreement/);
  assert.ok(result.pendingRequirements.some((item) => item.id === "kitchen-profile"));
});

test("required profile text rejects empty, whitespace-only, and shorter-than-validator values", () => {
  for (const [field, minimumLength] of Object.entries(COOK_PROFILE_TEXT_MINIMUMS)) {
    for (const invalidValue of ["", " ".repeat(minimumLength + 1), "😀".repeat(minimumLength - 1)]) {
      const cook = readyCook({ [field]: invalidValue });
      const readiness = getCookSellingReadiness(cook, now);
      const profileCheck = readiness.checklist.find((item) => item.id === "kitchen-profile");

      assert.equal(profileCheck.complete, false, `${field} should reject ${JSON.stringify(invalidValue)}`);
      assert.equal(isCookEligibleToSell(cook, now), false, `${field} must also block dish publishing`);
      assert.equal(
        cookApplicationSchema.body.safeParse(cook).success,
        false,
        `${field} application value ${JSON.stringify(invalidValue)} should fail validation`,
      );
      if (field in kitchenUpdateSchema.body.shape) {
        assert.equal(
          kitchenUpdateSchema.body.safeParse({ [field]: invalidValue }).success,
          false,
          `${field} profile update ${JSON.stringify(invalidValue)} should fail validation`,
        );
      }
    }

    const validValue = "😀".repeat(minimumLength);
    assert.equal(
      getCookSellingReadiness(readyCook({ [field]: validValue }), now).readyToSell,
      true,
      `${field} with the required minimum length should pass readiness`,
    );
    assert.equal(isCookEligibleToSell(readyCook({ [field]: validValue }), now), true);
    assert.equal(
      cookApplicationSchema.body.safeParse(readyCook({ [field]: validValue })).success,
      true,
      `${field} with the required minimum length should pass validation`,
    );
    if (field in kitchenUpdateSchema.body.shape) {
      const update = kitchenUpdateSchema.body.safeParse({ [field]: `\u00a0${validValue}\ufeff` });
      assert.equal(update.success, true);
      assert.equal(update.data[field], validValue, `${field} should trim ECMAScript edge whitespace`);
    }

    const application = cookApplicationSchema.body.safeParse(readyCook({
      [field]: `\u00a0${validValue}\ufeff`,
    }));
    assert.equal(application.success, true, `${field} should accept exact code-point minimum`);
    assert.equal(application.data[field], validValue, `${field} should trim ECMAScript edge whitespace`);

    const unicodeWhitespaceOnly = "\u00a0\ufeff";
    assert.equal(getCookSellingReadiness(readyCook({ [field]: unicodeWhitespaceOnly }), now).readyToSell, false);
    assert.equal(
      cookApplicationSchema.body.safeParse(readyCook({ [field]: unicodeWhitespaceOnly })).success,
      false,
      `${field} must reject Unicode whitespace-only input`,
    );
  }
});

test("supplementary Unicode characters count as one code point for minimums", () => {
  for (const [field, minimumLength] of Object.entries(COOK_PROFILE_TEXT_MINIMUMS)) {
    const oneEmoji = readyCook({ [field]: "😀" });
    const expected = minimumLength <= 1;
    assert.equal(
      getCookSellingReadiness(oneEmoji, now).checklist.find((item) => item.id === "kitchen-profile").complete,
      expected,
      `${field} must count the emoji as one code point`,
    );
    assert.equal(cookApplicationSchema.body.safeParse(oneEmoji).success, expected, `${field} application parity`);
    if (field in kitchenUpdateSchema.body.shape) {
      assert.equal(kitchenUpdateSchema.body.safeParse({ [field]: "😀" }).success, expected, `${field} update parity`);
    }
  }
});

test("database-side profile text eligibility uses the same fields and minimums as dashboard readiness", async () => {
  const profiles = [
    { id: "valid", profile: readyCook() },
    ...Object.entries(COOK_PROFILE_TEXT_MINIMUMS).map(([field, minimumLength]) => ({
      id: `short-${field}`,
      profile: readyCook({ [field]: "x".repeat(minimumLength - 1) }),
    })),
    { id: "whitespace-bio", profile: readyCook({ bio: "                 " }) },
  ];
  let query;
  const database = {
    async $queryRaw(strings, ...values) {
      query = { sql: strings.join("?"), values };
      return profiles
        .filter(({ profile }) => getCookSellingReadiness(profile, now).checklist
          .find((item) => item.id === "kitchen-profile").complete)
        .map(({ id }) => ({ id }));
    },
  };

  const eligibleIds = await findCookProfilesWithValidRequiredText(database);
  assert.deepEqual(query.values, Object.values(COOK_PROFILE_TEXT_MINIMUMS));
  for (const field of Object.keys(COOK_PROFILE_TEXT_MINIMUMS)) {
    assert.match(query.sql, new RegExp(`"${field}"`));
  }
  assert.match(query.sql, /char_length\(btrim\(profile\."bio", trim_chars\.chars\)\)/);
  assert.match(query.sql, /chr\(65279\)/);

  for (const { id, profile } of profiles) {
    const dashboardProfileComplete = getCookSellingReadiness(profile, now).checklist
      .find((item) => item.id === "kitchen-profile").complete;
    assert.equal(eligibleIds.includes(id), dashboardProfileComplete, id);
  }
});

test("account status, cook approval, FSSAI review, expiry, and selling approval are independent gates", () => {
  const cases = [
    ["inactive account", { user: { role: "COOK", status: "SUSPENDED" } }, "active-cook-account"],
    ["wrong role", { user: { role: "CUSTOMER", status: "ACTIVE" } }, "active-cook-account"],
    ["pending cook profile", { verificationStatus: "PENDING" }, "cook-profile-approval"],
    ["uploaded but submitted FSSAI", { fssaiStatus: "SUBMITTED" }, "fssai-certificate"],
    ["rejected FSSAI", { fssaiStatus: "REJECTED", fssaiRejectionReason: "Unreadable" }, "fssai-certificate"],
    ["expired FSSAI", { fssaiExpiryDate: new Date("2026-10-14T23:59:59.999Z") }, "fssai-certificate"],
    ["missing FSSAI expiry", { fssaiExpiryDate: null }, "fssai-certificate"],
    ["missing selling approval", { isApprovedToSell: false }, "selling-approval"],
  ];

  for (const [label, override, requirementId] of cases) {
    const result = getCookSellingReadiness(readyCook(override), now);
    assert.equal(result.readyToSell, false, label);
    assert.ok(result.pendingRequirements.some((item) => item.id === requirementId), label);
  }
  assert.equal(getCookSellingReadiness(null, now).readyToSell, false);
});

test("Prisma seller predicate uses the same approval and required profile gates", () => {
  const where = cookSellingReadinessWhere(now);
  assert.equal(where.verificationStatus, "APPROVED");
  assert.equal(where.fssaiStatus, "APPROVED");
  assert.deepEqual(where.fssaiExpiryDate, { gt: now });
  assert.equal(where.isApprovedToSell, true);
  assert.equal(where.isHomeKitchenDeclared, true);
  assert.equal(where.foodSafetyConsent, true);
  assert.deepEqual(where.user, { is: { role: "COOK", status: "ACTIVE" } });
  assert.deepEqual(where.id, { in: [] });
  assert.equal(where.AND.some((condition) => condition.businessName?.not === null), false);
  for (const field of ["bio", "experienceYears", "specialization", "city", "locality", "cookingCapacity", "prepTimeNotice"]) {
    assert.ok(where.AND.some((condition) => condition[field]?.not === null), `${field} is nullable`);
  }
  assert.ok(where.AND.some((condition) => condition.cuisines?.isEmpty === false));
});
