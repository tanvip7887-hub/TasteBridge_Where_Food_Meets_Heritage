import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import "dotenv/config";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

let server;
let baseUrl;
let app;
let env;
let prisma;
let fixtureUserId;
let fixtureCategoryId;
let fixtureDishId;

const isolatedDatabaseUrl = process.env.DINE_TEST_DATABASE_URL;
const migrationsDirectory = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

const getSafeIsolatedDatabaseName = (rawUrl) => {
  assert.ok(rawUrl, "Set DINE_TEST_DATABASE_URL to the retained isolated PostgreSQL test database.");
  const parsed = new URL(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(parsed.hostname), "HTTP integration tests require loopback PostgreSQL.");
  assert.match(databaseName, /^tastebridge_dine_test_[a-z0-9_]+$/i, "HTTP integration tests require a dedicated tastebridge_dine_test_<unique suffix> database.");
  assert.notEqual(databaseName.toLowerCase(), "tastebridge", "The configured development database is forbidden for this test.");
  return databaseName;
};

before(async () => {
  const expectedDatabase = getSafeIsolatedDatabaseName(isolatedDatabaseUrl);
  const configuredDatabase = process.env.DATABASE_URL ? decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) : null;
  assert.ok(
    configuredDatabase && ["tastebridge", expectedDatabase.toLowerCase()].includes(configuredDatabase.toLowerCase()),
    "The test must start from the expected development configuration or the explicitly selected isolated target."
  );
  process.env.DATABASE_URL = isolatedDatabaseUrl;

  ({ default: app } = await import("../app.js"));
  ({ default: env } = await import("../config/env.js"));
  ({ default: prisma } = await import("../config/prisma.js"));

  const [identity] = await prisma.$queryRaw`SELECT current_database() AS name, current_schema() AS schema`;
  assert.equal(identity.name, expectedDatabase);
  assert.equal(identity.schema, "public");

  const migrationDirectories = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrationRows = await prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM public."_prisma_migrations"`;
  const applied = migrationRows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name).sort();
  const incomplete = migrationRows.filter((row) => !row.finished_at && !row.rolled_back_at);
  assert.deepEqual(applied, migrationDirectories, "HTTP integration target must match the complete repository migration history.");
  assert.equal(incomplete.length, 0, "HTTP integration target must have no incomplete migrations.");

  const marker = `http-cook-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "HTTP integration Cook",
      email: `${marker}@example.invalid`,
      passwordHash: "integration-test-only-not-a-credential",
      role: "COOK",
      cookProfile: { create: {
        businessName: "HTTP integration kitchen",
        bio: "A synthetic profile for isolated HTTP integration tests.",
        experienceYears: "5 years",
        specialization: "Home cooking",
        city: "Pune",
        locality: "Test locality",
        cookingCapacity: "10 guests",
        prepTimeNotice: "24 hours",
        cuisines: ["Test cuisine"],
        dietaryPreferences: ["Vegetarian"],
        availableDays: ["Saturday"],
        availableMealSlots: ["Dinner"],
        isHomeKitchenDeclared: true,
        foodSafetyConsent: true,
        fssaiStatus: "APPROVED",
        fssaiExpiryDate: new Date("2035-01-01T00:00:00.000Z"),
        verificationStatus: "APPROVED",
        isApprovedToSell: true,
      } },
    },
    include: { cookProfile: { select: { id: true } } },
  });
  fixtureUserId = user.id;
  const category = await prisma.foodCategory.create({
    data: {
      name: `HTTP Integration ${marker}`,
      slug: marker,
      description: "Synthetic category for isolated HTTP tests.",
    },
    select: { id: true },
  });
  fixtureCategoryId = category.id;
  const dish = await prisma.dish.create({
    data: {
      cookId: user.cookProfile.id,
      categoryId: category.id,
      name: "Synthetic private-story dish",
      cuisine: "Test cuisine",
      price: "125.00",
      status: "PUBLISHED",
      availableQuantity: 10,
      isAvailable: true,
      story: { create: {
        whoTaught: "Synthetic family member",
        storyText: "Private synthetic story that must not be exposed publicly.",
        visibility: "PRIVATE",
      } },
    },
    select: { id: true },
  });
  fixtureDishId = dish.id;

  process.env.NODE_ENV = "production";
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
  if (fixtureDishId) await prisma.dish.deleteMany({ where: { id: fixtureDishId } });
  if (fixtureCategoryId) await prisma.foodCategory.deleteMany({ where: { id: fixtureCategoryId } });
  if (fixtureUserId) await prisma.user.deleteMany({ where: { id: fixtureUserId } });
  await prisma?.$disconnect();
});

test("protected cook APIs reject unauthenticated and query-string token requests", async () => {
  const response = await fetch(`${baseUrl}/api/v1/cooks/documents/private-doc?token=not-a-token`);
  assert.equal(response.status, 401);
  const dashboardResponse = await fetch(`${baseUrl}/api/v1/cooks/dashboard`);
  assert.equal(dashboardResponse.status, 401);
});

test("protected admin APIs reject requests without bearer authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/admin/dashboard`);
  assert.equal(response.status, 401);
});

test("malformed bearer tokens are rejected", async () => {
  const response = await fetch(`${baseUrl}/api/v1/cooks/application`, {
    headers: { Authorization: "Bearer malformed.token.value" },
  });
  assert.equal(response.status, 401);
});

test("invalid authentication request bodies return a safe validation error", async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "not-an-email", password: "" }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal("stack" in body, false);
});

test("CORS allows configured local frontend origin and omits other origins", async () => {
  const allowed = await fetch(`${baseUrl}/api/v1/_cors_probe`, {
    headers: { Origin: "http://localhost:5173" },
  });
  const rejected = await fetch(`${baseUrl}/api/v1/_cors_probe`, {
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("health endpoint reports the connected database accurately", async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.status, "UP");
  assert.equal(body.data.services.database, "connected");
});

test("public category dishes API executes the approved-seller query", async () => {
  const response = await fetch(`${baseUrl}/api/v1/categories/no-such-category-for-test/dishes`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data, []);
});

test("public category endpoint never returns non-public story content", async () => {
  const response = await fetch(`${baseUrl}/api/v1/categories/${fixtureCategoryId}/dishes`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.data));
  const fixtureDish = body.data.find((dish) => dish.id === fixtureDishId);
  assert.ok(fixtureDish, "The eligible synthetic dish should exercise story serialization.");
  assert.equal(fixtureDish.story, null, "Private story content must be omitted from public category results.");
  for (const dish of body.data) {
    assert.ok(dish.story === null || dish.story.visibility === "PUBLIC");
  }
});

test("approved cook profile and dashboard APIs remain connected", async () => {
  assert.ok(env.JWT_SECRET, "JWT_SECRET must be configured for the isolated API integration check.");
  const token = jwt.sign({ userId: fixtureUserId, role: "COOK" }, env.JWT_SECRET, { expiresIn: "1m" });
  for (const path of ["/api/v1/cooks/kitchen", "/api/v1/cooks/dashboard"]) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200, `${path} should return live cook data`);
  }
});
