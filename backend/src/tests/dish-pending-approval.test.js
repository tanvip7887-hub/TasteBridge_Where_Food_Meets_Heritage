import assert from "node:assert/strict";
import test from "node:test";
import { createDishSchema, updateDishSchema } from "../modules/cook/cook.validation.js";
import {
  assertCookMayCreateDishWithStatus,
  assertCookMayPublishDish,
  assertPublishedDishContentUnchanged,
} from "../modules/cook/cook.service.js";
import { assertAdminDishStatusTransition, assertDishReadyForAdminApproval } from "../modules/admin/admin.service.js";
import { publicDishesWhere } from "../utils/marketplaceSecurity.js";

const validDish = {
  name: "Andhra Chicken Curry",
  cuisine: "Andhra",
  categoryId: "category-andhra",
  price: 280,
  ingredients: ["Chicken 500 g", "Onion 2 medium"],
  instructions: "Cook the onions and spices, add chicken and simmer until tender.",
  prepTimeMinutes: 45,
  availableQuantity: 10,
  lowStockThreshold: 3,
  isAvailable: true,
  status: "PENDING_APPROVAL",
};

test("Cook create validation accepts a complete pending dish without invented personal story data", () => {
  const result = createDishSchema.body.safeParse(validDish);
  assert.equal(result.success, true);
  assert.equal(result.data.status, "PENDING_APPROVAL");
  assert.equal("story" in result.data, false);
});

test("Cook create validation rejects direct publishing while preserving draft submission", () => {
  assert.equal(createDishSchema.body.safeParse({ ...validDish, status: "PUBLISHED" }).success, false);
  assert.equal(createDishSchema.body.safeParse({ ...validDish, status: "DRAFT" }).success, true);
  assert.throws(() => assertCookMayCreateDishWithStatus("PUBLISHED"), (error) => error.statusCode === 403);
  assert.equal(assertCookMayCreateDishWithStatus("DRAFT"), undefined);
});

test("Cook update validation supports submitting an existing draft for Admin review", () => {
  const result = updateDishSchema.body.safeParse({ status: "PENDING_APPROVAL" });
  assert.deepEqual(result.data, { status: "PENDING_APPROVAL" });
});

test("a Cook cannot publish a dish while it is pending Admin approval", () => {
  assert.throws(
    () => assertCookMayPublishDish({ status: "PENDING_APPROVAL" }),
    (error) => error.statusCode === 403 && /awaiting Admin approval/.test(error.message)
  );
});

test("the Cook publish service rejects every direct publish transition", () => {
  for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED", "UNPUBLISHED", "PUBLISHED"]) {
    assert.throws(() => assertCookMayPublishDish({ status }), (error) => error.statusCode === 403);
  }
  assert.equal(updateDishSchema.body.safeParse({ status: "PUBLISHED" }).success, false);
});

test("published dish recipe edits are blocked while operational stock and availability remain editable", () => {
  const dish = {
    status: "PUBLISHED", name: "Andhra Curry", description: "A dish", cuisine: "Andhra",
    categoryId: "cat-1", price: "240.00", isVegetarian: false, ingredients: ["Chicken"],
    instructions: "Cook gently", prepTimeMinutes: 45, dietaryTags: [],
    story: { whoTaught: "Aunt", storyText: "A truthful cooking story", visibility: "PUBLIC" },
  };
  assert.throws(
    () => assertPublishedDishContentUnchanged(dish, { price: 250 }),
    (error) => error.statusCode === 409 && /approved version remains available/.test(error.message)
  );
  assert.doesNotThrow(() => assertPublishedDishContentUnchanged(dish, { availableQuantity: 6, isAvailable: false }));
  assert.doesNotThrow(() => assertPublishedDishContentUnchanged(dish, { price: "240.00", name: "Andhra Curry" }));
  assert.throws(
    () => assertPublishedDishContentUnchanged(dish, {}, { type: "update", data: { storyText: "A changed story" } }),
    /approved version remains available/
  );
});

test("Admin may publish or reject only pending dishes and may unpublish only published dishes", () => {
  assert.doesNotThrow(() => assertAdminDishStatusTransition("PENDING_APPROVAL", "PUBLISHED"));
  assert.doesNotThrow(() => assertAdminDishStatusTransition("PENDING_APPROVAL", "REJECTED"));
  assert.doesNotThrow(() => assertAdminDishStatusTransition("PUBLISHED", "UNPUBLISHED"));
  for (const [from, to] of [["DRAFT", "PUBLISHED"], ["REJECTED", "PUBLISHED"], ["UNPUBLISHED", "PUBLISHED"], ["PUBLISHED", "REJECTED"]]) {
    assert.throws(() => assertAdminDishStatusTransition(from, to), (error) => error.statusCode === 409);
  }
});

test("Admin approval checks Cook eligibility and complete recipe story before publication", () => {
  const where = publicDishesWhere("category-1", new Date(), ["cook-1"]);
  assert.equal(where.status, "PUBLISHED");
  const eligibleCook = {
    businessName: "Alka's Kitchen", bio: "Home cooking from regional traditions.", experienceYears: "10 years",
    specialization: "Regional meals", city: "Pune", locality: "Central Pune", cookingCapacity: "20 meals",
    prepTimeNotice: "One day", cuisines: ["Maharashtrian"], dietaryPreferences: ["Vegetarian"],
    availableDays: ["Monday"], availableMealSlots: ["Lunch"], isHomeKitchenDeclared: true,
    foodSafetyConsent: true, verificationStatus: "APPROVED", isApprovedToSell: true,
    fssaiStatus: "APPROVED", fssaiExpiryDate: new Date("2030-01-01T00:00:00Z"),
    user: { role: "COOK", status: "ACTIVE" },
  };
  const pendingDish = {
    status: "PENDING_APPROVAL", name: "Andhra Chicken Curry", cuisine: "Andhra", categoryId: "category-1", price: 250,
    story: { whoTaught: "Aunt", storyText: "A regional recipe shared by the Cook." }, cook: eligibleCook,
  };
  assert.doesNotThrow(() => assertDishReadyForAdminApproval(pendingDish));
  assert.throws(
    () => assertDishReadyForAdminApproval({ ...pendingDish, story: null }),
    (error) => error.statusCode === 409
  );
});
