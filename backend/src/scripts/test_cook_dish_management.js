import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import env from "../config/env.js";

async function runDishTests() {
  console.log("=== Testing Real Cook Dish & Story Management Endpoints ===");

  const backendBase = "http://localhost:5000/api/v1";

  // 1. Get an approved COOK user from DB
  const cookUser = await prisma.user.findFirst({
    where: {
      role: "COOK",
      cookProfile: {
        verificationStatus: "APPROVED",
      },
    },
    include: { cookProfile: true },
  });

  if (!cookUser) {
    throw new Error("No approved COOK user found in database for testing.");
  }

  // 2. Get another COOK user (or customer) to test permission checks
  const customerUser = await prisma.user.findFirst({
    where: { role: "CUSTOMER" },
  });

  // 3. Get an active category
  const category = await prisma.foodCategory.findFirst({
    where: { isActive: true },
  });

  if (!category) {
    throw new Error("No active category found in database.");
  }

  const cookToken = jwt.sign(
    { userId: cookUser.id, role: cookUser.role },
    env.JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const customerToken = customerUser
    ? jwt.sign(
        { userId: customerUser.id, role: customerUser.role },
        env.JWT_SECRET || process.env.JWT_SECRET,
        { expiresIn: "1h" }
      )
    : null;

  console.log(`Testing with approved cook: ${cookUser.name} (${cookUser.email})`);

  // Pre-cleanup any lingering test dishes
  await prisma.dish.deleteMany({
    where: {
      name: "Heritage Puran Poli",
      cookId: cookUser.cookProfile.id,
    },
  });

  // Test 9: Unauthenticated request returns 401
  const unauthRes = await fetch(`${backendBase}/cooks/dishes`);
  console.log(`9. Unauthenticated GET /cooks/dishes: status ${unauthRes.status} (Expected 401)`);
  if (unauthRes.status !== 401) throw new Error("Expected 401 for unauthenticated request");

  // Test 10: Wrong-role or unapproved cook returns 403
  if (customerToken) {
    const custRes = await fetch(`${backendBase}/cooks/dishes`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    console.log(`10. Customer GET /cooks/dishes: status ${custRes.status} (Expected 403)`);
    if (custRes.status !== 403) throw new Error("Expected 403 for non-cook user");
  }

  // Test 11: Invalid input returns 400
  const invalidRes = await fetch(`${backendBase}/cooks/dishes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({
      name: "", // Invalid: too short
      price: -50, // Invalid: negative
    }),
  });
  console.log(`11. Invalid input POST /cooks/dishes: status ${invalidRes.status} (Expected 400)`);
  if (invalidRes.status !== 400) throw new Error("Expected 400 for invalid inputs");

  // Test 1: Approved cook creates a draft dish
  const createDraftRes = await fetch(`${backendBase}/cooks/dishes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({
      name: "Heritage Puran Poli",
      description: "Traditional sweet flatbread stuffed with spiced chana dal and jaggery.",
      cuisine: "Maharashtrian",
      categoryId: category.id,
      price: 180,
      isVegetarian: true,
      ingredients: ["Chana dal", "Jaggery", "Wheat flour", "Cardamom", "Nutmeg", "Ghee"],
      instructions: "Boil dal, mix with jaggery, roll into dough and cook with ghee on hot griddle.",
      prepTimeMinutes: 45,
      dietaryTags: ["Vegetarian", "Traditional"],
      availableQuantity: 15,
      lowStockThreshold: 3,
      status: "DRAFT",
    }),
  });
  const draftJson = await createDraftRes.json();
  console.log(`1. Approved cook creates draft: status ${createDraftRes.status}, id: ${draftJson.data?.id}, status: ${draftJson.data?.status}`);
  if (createDraftRes.status !== 201 || draftJson.data?.status !== "DRAFT") {
    throw new Error(`Failed to create draft dish: ${JSON.stringify(draftJson)}`);
  }
  const dishId = draftJson.data.id;

  // Test 2: Dish persists after refresh (GET /cooks/dishes/:id)
  const getDishRes = await fetch(`${backendBase}/cooks/dishes/${dishId}`, {
    headers: { Authorization: `Bearer ${cookToken}` },
  });
  const getDishJson = await getDishRes.json();
  console.log(`2. Dish persists in DB: name=${getDishJson.data?.name}, availableQuantity=${getDishJson.data?.availableQuantity}`);
  if (getDishJson.data?.name !== "Heritage Puran Poli") {
    throw new Error("Persisted dish name did not match.");
  }

  // Test 3: Cook edits their own dish
  const editRes = await fetch(`${backendBase}/cooks/dishes/${dishId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({
      price: 210,
      description: "Traditional sweet flatbread made using heirloom Khandesh recipe.",
    }),
  });
  const editJson = await editRes.json();
  console.log(`3. Cook edits dish: status ${editRes.status}, updated price: ${editJson.data?.price}`);
  if (editJson.data?.price !== 210) throw new Error("Price update did not persist");

  // Test 4: Cook uploads or replaces a dish photo
  const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const imageBuffer = Buffer.from(tinyPngBase64, "base64");
  const formData = new FormData();
  formData.append("photo", new Blob([imageBuffer], { type: "image/png" }), "test_dish.png");

  const photoRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/photo`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cookToken}` },
    body: formData,
  });
  const photoJson = await photoRes.json();
  console.log(`4. Cook uploads dish photo: status ${photoRes.status}, image=${Boolean(photoJson.data?.image)}`);
  if (photoRes.status !== 200 || !photoJson.data?.image) {
    throw new Error("Failed to upload dish photo");
  }

  // Test 5: Publishing without a valid story is rejected (400)
  const publishNoStoryRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/publish`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({}),
  });
  const publishNoStoryJson = await publishNoStoryRes.json();
  console.log(`5. Publishing without story rejected: status ${publishNoStoryRes.status} (Expected 400), msg: "${publishNoStoryJson.message}"`);
  if (publishNoStoryRes.status !== 400) {
    throw new Error("Expected publishing without story to be rejected with 400");
  }

  // Test 6: Publishing with valid story succeeds
  const publishWithStoryRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/publish`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({
      story: {
        whoTaught: "Grandmother Aaji Shantabai",
        occasion: "Gudi Padwa festival celebration",
        culturalSignificance: "Symbolizes prosperity and new beginnings in Maharashtra since centuries.",
        storyText: "Every festival morning, Aaji would wake at 5 AM to slow-cook the puran in brass handis over wood fire.",
        visibility: "PUBLIC",
      },
    }),
  });
  const publishWithStoryJson = await publishWithStoryRes.json();
  console.log(`6. Publishing with story: status ${publishWithStoryRes.status}, status: ${publishWithStoryJson.data?.status}`);
  if (publishWithStoryJson.data?.status !== "PUBLISHED") {
    throw new Error(`Expected dish to be PUBLISHED: ${JSON.stringify(publishWithStoryJson)}`);
  }

  // Test 7: Cook unpublishes and republishes
  const unpubRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/unpublish`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cookToken}` },
  });
  const unpubJson = await unpubRes.json();
  console.log(`7a. Unpublish dish: status ${unpubRes.status}, new status: ${unpubJson.data?.status}`);
  if (unpubJson.data?.status !== "UNPUBLISHED") throw new Error("Failed to unpublish");

  const repubRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/publish`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${cookToken}` },
  });
  const repubJson = await repubRes.json();
  console.log(`7b. Republish dish: status ${repubRes.status}, new status: ${repubJson.data?.status}`);
  if (repubJson.data?.status !== "PUBLISHED") throw new Error("Failed to republish");

  // Test 8: Quantity and availability changes persist
  const availRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/availability`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({ isAvailable: false }),
  });
  const availJson = await availRes.json();
  console.log(`8a. Availability update: isAvailable=${availJson.data?.isAvailable}`);
  if (availJson.data?.isAvailable !== false) throw new Error("Availability update failed");

  const stockRes = await fetch(`${backendBase}/cooks/dishes/${dishId}/stock`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cookToken}`,
    },
    body: JSON.stringify({ availableQuantity: 25, lowStockThreshold: 5 }),
  });
  const stockJson = await stockRes.json();
  console.log(`8b. Stock update: availableQuantity=${stockJson.data?.availableQuantity}, lowStockThreshold=${stockJson.data?.lowStockThreshold}`);
  if (stockJson.data?.availableQuantity !== 25) throw new Error("Stock update failed");

  // Test 12: A cook attempting to access another cook's dish is rejected with 403
  const secondCookUser = await prisma.user.create({
    data: {
      email: `test_cook_iso_${Date.now()}@example.com`,
      name: "Other Cook",
      passwordHash: "dummyhash",
      role: "COOK",
      status: "ACTIVE",
      cookProfile: {
        create: {
          businessName: "Other Kitchen",
          verificationStatus: "APPROVED",
        },
      },
    },
    include: { cookProfile: true },
  });

  const secondCookToken = jwt.sign(
    { userId: secondCookUser.id, role: secondCookUser.role },
    env.JWT_SECRET || process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  const crossCookRes = await fetch(`${backendBase}/cooks/dishes/${dishId}`, {
    headers: { Authorization: `Bearer ${secondCookToken}` },
  });
  console.log(`12. Other cook GET /cooks/dishes/${dishId}: status ${crossCookRes.status} (Expected 403)`);
  if (crossCookRes.status !== 403) {
    throw new Error(`Expected 403 when cook accesses another cook's dish, got ${crossCookRes.status}`);
  }

  // Clean up second cook
  await prisma.user.delete({ where: { id: secondCookUser.id } });

  // Test 13: Unpublished, unavailable, and out-of-stock dishes cannot be treated as orderable
  // Verify with category dishes public endpoint: dish is currently isAvailable = false
  const catDishesUnavailableRes = await fetch(`${backendBase}/categories/${category.id}/dishes`);
  const catDishesUnavailableJson = await catDishesUnavailableRes.json();
  const foundUnavailable = (catDishesUnavailableJson.data || []).some((d) => d.id === dishId);
  console.log(`13a. Unavailable dish in customer category view: found=${foundUnavailable} (Expected false)`);
  if (foundUnavailable) throw new Error("Unavailable dish should NOT appear in customer orderable list");

  // Set isAvailable = true and availableQuantity = 0 (out of stock)
  await prisma.dish.update({
    where: { id: dishId },
    data: { isAvailable: true, availableQuantity: 0, status: "PUBLISHED" },
  });
  const catDishesOutOfStockRes = await fetch(`${backendBase}/categories/${category.id}/dishes`);
  const catDishesOutOfStockJson = await catDishesOutOfStockRes.json();
  const foundOutOfStock = (catDishesOutOfStockJson.data || []).some((d) => d.id === dishId);
  console.log(`13b. Out-of-stock dish in customer category view: found=${foundOutOfStock} (Expected false)`);
  if (foundOutOfStock) throw new Error("Out-of-stock dish should NOT appear in customer orderable list");

  // Set status = UNPUBLISHED and availableQuantity = 10
  await prisma.dish.update({
    where: { id: dishId },
    data: { isAvailable: true, availableQuantity: 10, status: "UNPUBLISHED" },
  });
  const catDishesUnpubRes = await fetch(`${backendBase}/categories/${category.id}/dishes`);
  const catDishesUnpubJson = await catDishesUnpubRes.json();
  const foundUnpub = (catDishesUnpubJson.data || []).some((d) => d.id === dishId);
  console.log(`13c. Unpublished dish in customer category view: found=${foundUnpub} (Expected false)`);
  if (foundUnpub) throw new Error("Unpublished dish should NOT appear in customer orderable list");

  // Now set to PUBLISHED, isAvailable = true, availableQuantity = 10 -> MUST appear
  await prisma.dish.update({
    where: { id: dishId },
    data: { isAvailable: true, availableQuantity: 10, status: "PUBLISHED" },
  });
  const catDishesOrderableRes = await fetch(`${backendBase}/categories/${category.id}/dishes`);
  const catDishesOrderableJson = await catDishesOrderableRes.json();
  const foundOrderable = (catDishesOrderableJson.data || []).some((d) => d.id === dishId);
  console.log(`13d. Published in-stock dish in customer category view: found=${foundOrderable} (Expected true)`);
  if (!foundOrderable) throw new Error("Published, available, in-stock dish MUST appear in customer orderable list");

  // Test 14: Existing My Kitchen, Dashboard, customer Marketplace, and admin functionality remain intact
  // 14a. My Kitchen
  const kitchenRes = await fetch(`${backendBase}/cooks/kitchen`, {
    headers: { Authorization: `Bearer ${cookToken}` },
  });
  const kitchenJson = await kitchenRes.json();
  console.log(`14a. GET /cooks/kitchen: status ${kitchenRes.status}, businessName: "${kitchenJson.data?.businessName}"`);
  if (kitchenRes.status !== 200 || !kitchenJson.data?.businessName) throw new Error("My Kitchen endpoint failed");

  // 14b. Dashboard
  const dashRes = await fetch(`${backendBase}/cooks/dashboard`, {
    headers: { Authorization: `Bearer ${cookToken}` },
  });
  const dashJson = await dashRes.json();
  console.log(`14b. GET /cooks/dashboard: status ${dashRes.status}, todayOrders: ${dashJson.data?.summary?.todayOrders}`);
  if (dashRes.status !== 200 || dashJson.data?.summary === undefined) throw new Error("Cook Dashboard endpoint failed");

  // 14c. Categories (Customer discovery)
  const catRes = await fetch(`${backendBase}/categories`);
  const catJson = await catRes.json();
  console.log(`14c. GET /categories: status ${catRes.status}, categories count: ${catJson.data?.length}`);
  if (catRes.status !== 200 || !Array.isArray(catJson.data)) throw new Error("Categories endpoint failed");

  // 14d. Admin dishes
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (adminUser) {
    const adminToken = jwt.sign(
      { userId: adminUser.id, role: adminUser.role },
      env.JWT_SECRET || process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const adminDishesRes = await fetch(`${backendBase}/admin/dishes`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminDishesJson = await adminDishesRes.json();
    console.log(`14d. GET /admin/dishes: status ${adminDishesRes.status}, total admin dishes: ${adminDishesJson.data?.pagination?.total}`);
    if (adminDishesRes.status !== 200) throw new Error("Admin dishes endpoint failed");
  }

  // Clean up test dish
  await prisma.dish.delete({ where: { id: dishId } });
  console.log("=== All 14 Backend Dish Management Tests Passed Successfully! ===");
  process.exit(0);
}

runDishTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
