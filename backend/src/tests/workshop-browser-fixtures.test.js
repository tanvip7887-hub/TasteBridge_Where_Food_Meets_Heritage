import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import bcrypt from "bcrypt";
import {
  assertManifest,
  cleanupFixtures,
  createFixtures,
  EXPECTED_DATABASE,
  hashFixturePasswords,
  manifestPathFromArgument,
  parseMode,
  validateDatabaseEnvironment,
  verifyDatabaseIdentity,
} from "../../prisma/test-fixtures/workshop-browser-fixtures.mjs";

const isolatedUrl = `postgresql://127.0.0.1:5432/${EXPECTED_DATABASE}`;
const systemIdentifier = "7654321098765432109";
const identityRow = (overrides = {}) => ({
  name: EXPECTED_DATABASE,
  server_address: "127.0.0.1",
  server_port: 5432,
  server_version_num: "180000",
  system_identifier: systemIdentifier,
  ...overrides,
});
const fixtureId = (role) => ({
  CUSTOMER: "11111111-1111-4111-8111-111111111111",
  ADMIN: "22222222-2222-4222-8222-222222222222",
  COOK: "33333333-3333-4333-8333-333333333333",
}[role]);
const cookProfileId = "44444444-4444-4444-8444-444444444444";
const makeManifest = (marker = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb") => ({
  format: 1,
  database: EXPECTED_DATABASE,
  marker,
  fixtures: ["CUSTOMER", "ADMIN", "COOK"].map((role) => ({
    id: fixtureId(role),
    role,
    name: `Workshop Test ${role} ${marker}`,
    email: `workshop-${role.toLowerCase()}-${marker}@example.invalid`,
    ...(role === "COOK" ? { cookProfileId } : {}),
  })),
});
const zeroCounts = () => Object.fromEntries([
  "verificationDocuments", "addresses", "passwordResetTokens", "orders", "experienceBookings",
  "reviews", "cookNotifications", "userNotifications", "checkouts", "favorites",
  "reviewModerations", "resolvedReviewReports",
].map((key) => [key, 0]));
const userForFixture = (fixture, overrides = {}) => ({
  ...fixture,
  _count: zeroCounts(),
  cookProfile: fixture.role === "COOK"
    ? { id: fixture.cookProfileId, _count: { dishes: 0, orders: 0, experiences: 0, reviews: 0, reviewReports: 0 } }
    : null,
  deliveryAgent: null,
  cart: null,
  ...overrides,
});
const databaseFor = ({ userOverrides = {}, onDelete, failIdentity = false } = {}) => {
  const tx = {
    $queryRaw: async () => {
      if (failIdentity) throw new Error("query failure");
      return [identityRow()];
    },
    user: {
      findUnique: async ({ where }) => {
        const fixture = currentManifest.fixtures.find(({ id }) => id === where.id);
        return fixture ? userForFixture(fixture, userOverrides[fixture.role]) : null;
      },
      deleteMany: async ({ where }) => onDelete?.(where) ?? { count: 1 },
      create: async ({ data }) => data,
    },
  };
  const database = {
    $queryRaw: async () => {
      if (failIdentity) throw new Error("query failure");
      return [identityRow()];
    },
    $transaction: async (work) => work(tx),
    user: tx.user,
  };
  return database;
};
let currentManifest = makeManifest();

test("default mode only displays usage and does not select a write mode", () => {
  assert.deepEqual(parseMode([]), { mode: "help", manifest: null });
});

test("database configuration requires both URLs and rejects missing values", () => {
  assert.throws(() => validateDatabaseEnvironment({}), /DATABASE_URL is required/);
  assert.throws(() => validateDatabaseEnvironment({ DATABASE_URL: isolatedUrl }), /DINE_TEST_DATABASE_URL is required/);
});

test("connection parser effective routing options must stay on the isolated local target", () => {
  assert.equal(validateDatabaseEnvironment({ DATABASE_URL: isolatedUrl, DINE_TEST_DATABASE_URL: isolatedUrl }), EXPECTED_DATABASE);
  for (const override of ["host=", "port=5433", "hostaddr=203.0.113.9", "options=-c%20host%3Dremote"]) {
    const url = `${isolatedUrl}?${override}`;
    assert.throws(() => validateDatabaseEnvironment({ DATABASE_URL: url, DINE_TEST_DATABASE_URL: url }), /URL options/);
  }
  assert.throws(() => validateDatabaseEnvironment({
    DATABASE_URL: isolatedUrl.replace(EXPECTED_DATABASE, "tastebridge"),
    DINE_TEST_DATABASE_URL: isolatedUrl.replace(EXPECTED_DATABASE, "tastebridge"),
  }), /required isolated local test database/);
  assert.throws(() => validateDatabaseEnvironment({
    DATABASE_URL: isolatedUrl.replace("127.0.0.1", "db.example.com"),
    DINE_TEST_DATABASE_URL: isolatedUrl.replace("127.0.0.1", "db.example.com"),
  }), /required isolated local test database/);
});

test("write modes require explicit confirmation and cleanup manifest", () => {
  assert.throws(() => parseMode(["--create-fixtures"]), /requires --confirm-isolated-fixtures/);
  assert.throws(() => parseMode(["--cleanup-fixtures", "--confirm-isolated-fixtures"]), /requires the exact fixture manifest/);
  assert.throws(() => parseMode(["--identity-check", "--create-fixtures", "--confirm-isolated-fixtures"]), /Select one fixture mode/);
});

test("database identity checks database, pinned local server, port, version, and system identifier", async () => {
  const database = { $queryRaw: async () => [identityRow()] };
  assert.equal(await verifyDatabaseIdentity(database, systemIdentifier), EXPECTED_DATABASE);
  for (const overrides of [
    { name: "tastebridge" }, { server_address: "192.0.2.10" }, { server_port: 5433 },
    { server_version_num: "170000" }, { system_identifier: "1" },
  ]) {
    await assert.rejects(verifyDatabaseIdentity({ $queryRaw: async () => [identityRow(overrides)] }, systemIdentifier), /identity does not match/);
  }
  await assert.rejects(verifyDatabaseIdentity(database, undefined), /trusted PostgreSQL system identifier/);
  await assert.rejects(verifyDatabaseIdentity({ $queryRaw: async () => { throw new Error("permission denied"); } }, systemIdentifier));
});

test("identity-query failure prevents fixture writes and manifest creation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tb-fixture-test-"));
  const manifestPath = path.join(directory, "never-written.json");
  let transactionCalled = false;
  const database = { $queryRaw: async () => { throw new Error("query failed"); }, $transaction: async () => { transactionCalled = true; } };
  const hashes = await hashFixturePasswords({ CUSTOMER: "test-customer-password", ADMIN: "test-admin-password", COOK: "test-cook-password" }, bcrypt);
  try {
    await assert.rejects(createFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifestPath, passwordHashes: hashes }));
    assert.equal(transactionCalled, false);
    await assert.rejects(readFile(manifestPath));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("fixture creation accepts authentication-compatible bcrypt hashes and records no password data", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tb-fixture-test-"));
  const manifestPath = path.join(directory, "fixture.json");
  const created = [];
  const hashes = await hashFixturePasswords({ CUSTOMER: "test-customer-password", ADMIN: "test-admin-password", COOK: "test-cook-password" }, bcrypt);
  let identityCalls = 0;
  const tx = {
    $queryRaw: async () => { identityCalls += 1; return [identityRow()]; },
    user: { create: async ({ data }) => { created.push(data); return data; } },
  };
  const database = {
    $queryRaw: async () => { identityCalls += 1; return [identityRow()]; },
    $transaction: async (work) => work(tx),
  };
  try {
    const manifest = await createFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifestPath,
      marker: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", passwordHashes: hashes });
    const persistedManifest = await readFile(manifestPath, "utf8");
    assert.equal(identityCalls, 2);
    assert.equal(created.length, 3);
    assert.deepEqual(created.map(({ role }) => role).sort(), ["ADMIN", "COOK", "CUSTOMER"]);
    assert.equal(created.find(({ role }) => role === "COOK").cookProfile.create.id,
      manifest.fixtures.find(({ role }) => role === "COOK").cookProfileId);
    for (const record of created) assert.equal(await bcrypt.compare(`test-${record.role.toLowerCase()}-password`, record.passwordHash), true);
    assert.equal(persistedManifest.includes("passwordHash"), false);
    for (const password of ["test-customer-password", "test-admin-password", "test-cook-password"]) {
      assert.equal(persistedManifest.includes(password), false);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("invalid supplied bcrypt hashes fail before identity queries or writes", async () => {
  let queryCalled = false;
  const database = { $queryRaw: async () => { queryCalled = true; return [identityRow()]; } };
  await assert.rejects(createFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifestPath: "ignored", passwordHashes: {
    CUSTOMER: "not-a-hash", ADMIN: "not-a-hash", COOK: "not-a-hash",
  } }), /valid project-compatible bcrypt hash/);
  assert.equal(queryCalled, false);
});

test("manifest path and structure are validated before database access", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tb-fixture-manifest-"));
  const validPath = path.join(directory, "workshop-browser-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.json");
  let databaseTouched = false;
  try {
    assert.equal(manifestPathFromArgument(validPath, directory), validPath);
    assert.throws(() => manifestPathFromArgument(path.join(directory, "workshop-browser-not-a-uuid.json"), directory), /exact workshop-browser fixture/);
    const manifest = makeManifest();
    await writeFile(validPath, JSON.stringify(manifest));
    const persistedManifest = JSON.parse(await readFile(validPath, "utf8"));
    assert.doesNotThrow(() => assertManifest(persistedManifest));
    const invalid = { ...manifest, fixtures: [{ ...manifest.fixtures[0], role: "COOK" }] };
    assert.throws(() => assertManifest(invalid), /Fixture manifest/);
    const database = { $queryRaw: async () => { databaseTouched = true; return [identityRow()]; } };
    assert.throws(() => assertManifest(invalid));
    assert.equal(databaseTouched, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("cleanup deletes only manifest identities after database identity checks", async () => {
  currentManifest = makeManifest();
  const deleteCalls = [];
  const database = databaseFor({ onDelete: (where) => { deleteCalls.push(where); return { count: 1 }; } });
  const result = await cleanupFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifest: currentManifest });
  assert.equal(result.deletedCount, 3);
  assert.deepEqual(deleteCalls, currentManifest.fixtures.map(({ id, email, role }) => ({ id, email, role })));
});

test("cleanup refuses unexpected delivery-agent relation before any deletion", async () => {
  currentManifest = makeManifest();
  let deleteCalled = false;
  const database = databaseFor({ userOverrides: { CUSTOMER: { deliveryAgent: { id: "unexpected" } } }, onDelete: () => { deleteCalled = true; return { count: 1 }; } });
  await assert.rejects(cleanupFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifest: currentManifest }), /identity no longer matches/);
  assert.equal(deleteCalled, false);
});

test("cleanup refuses CookProfile attached to a non-Cook fixture before deletion", async () => {
  currentManifest = makeManifest();
  let deleteCalled = false;
  const database = databaseFor({ userOverrides: { ADMIN: { cookProfile: { id: "unexpected", _count: {} } } }, onDelete: () => { deleteCalled = true; return { count: 1 }; } });
  await assert.rejects(cleanupFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifest: currentManifest }), /identity no longer matches/);
  assert.equal(deleteCalled, false);
});

test("cleanup refuses a CookProfile ID that differs from the manifest", async () => {
  currentManifest = makeManifest();
  let deleteCalled = false;
  const database = databaseFor({ userOverrides: { COOK: { cookProfile: { id: "55555555-5555-4555-8555-555555555555", _count: {} } } }, onDelete: () => { deleteCalled = true; return { count: 1 }; } });
  await assert.rejects(cleanupFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifest: currentManifest }), /identity no longer matches/);
  assert.equal(deleteCalled, false);
});

test("cleanup preflights all fixtures before deleting when any has related records", async () => {
  currentManifest = makeManifest();
  let deleteCalled = false;
  const database = databaseFor({ userOverrides: { CUSTOMER: { _count: { ...zeroCounts(), experienceBookings: 1 } } }, onDelete: () => { deleteCalled = true; return { count: 1 }; } });
  await assert.rejects(cleanupFixtures({ database, expectedSystemIdentifier: systemIdentifier, manifest: currentManifest }), /related records/);
  assert.equal(deleteCalled, false);
});

test("identity query failures and unexpected server identity fail closed", async () => {
  await assert.rejects(verifyDatabaseIdentity({ $queryRaw: async () => { throw new Error("unavailable"); } }, systemIdentifier));
  await assert.rejects(verifyDatabaseIdentity({ $queryRaw: async () => [identityRow({ system_identifier: "1" })] }, systemIdentifier), /identity does not match/);
});
