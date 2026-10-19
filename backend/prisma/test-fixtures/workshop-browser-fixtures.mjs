import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parsePgConnectionString } from "pg-connection-string";

export const EXPECTED_DATABASE = "tastebridge_dine_test_527440f2474747a590d4e26ee83074a6";
export const CONFIRMATION_FLAG = "--confirm-isolated-fixtures";
const roles = ["CUSTOMER", "ADMIN", "COOK"];
const EXPECTED_PORT = 5432;
const MIN_BCRYPT_COST = 10;
const MAX_BCRYPT_COST = 14;
const requiredFixtureDirectory = path.resolve(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "TasteBridge",
  "test-fixtures",
);

export const parseMode = (args = []) => {
  const modes = ["--identity-check", "--create-fixtures", "--cleanup-fixtures"];
  const allowedFlags = new Set([...modes, CONFIRMATION_FLAG, "--manifest"]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--manifest") { index += 1; continue; }
    if (!allowedFlags.has(argument) && !argument.startsWith("--manifest=")) {
      throw new Error("Unknown option. Run without options to see supported modes.");
    }
  }
  const selected = modes.filter((mode) => args.includes(mode));
  if (selected.length > 1) throw new Error("Select one fixture mode at a time.");
  if (args.includes("--manifest") && (!args[args.indexOf("--manifest") + 1]
    || args[args.indexOf("--manifest") + 1].startsWith("--"))) {
    throw new Error("--manifest requires a fixture manifest path.");
  }
  const manifestArg = args.find((arg) => arg.startsWith("--manifest="));
  const manifest = manifestArg?.slice("--manifest=".length)
    || (args.includes("--manifest") ? args[args.indexOf("--manifest") + 1] : null);
  const mode = selected[0] || "help";
  if (["--create-fixtures", "--cleanup-fixtures"].includes(mode)
    && !args.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Write mode requires ${CONFIRMATION_FLAG}.`);
  }
  if (mode === "--cleanup-fixtures" && !manifest) {
    throw new Error("Cleanup requires the exact fixture manifest path.");
  }
  if (mode !== "--cleanup-fixtures" && manifest) {
    throw new Error("--manifest is supported only with cleanup mode.");
  }
  return { mode, manifest };
};

const parseDatabaseUrl = (value, variableName) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${variableName} is required; no database fallback is allowed.`);
  }
  let url;
  try { url = new URL(value); } catch {
    throw new Error(`${variableName} is not a valid PostgreSQL URL; its value is not shown.`);
  }
  let effective;
  let databaseName;
  try {
    if (url.search || url.hash) throw new Error("unsupported URL components");
    effective = parsePgConnectionString(value);
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(`${variableName} contains unsupported or invalid PostgreSQL URL options.`);
  }
  if (!(["postgres:", "postgresql:"].includes(url.protocol)
    && ["localhost", "127.0.0.1", "::1"].includes(String(effective.host || "").replace(/^\[|\]$/g, ""))
    && Number(effective.port || EXPECTED_PORT) === EXPECTED_PORT
    && databaseName === EXPECTED_DATABASE)) {
    throw new Error(`${variableName} must target the required isolated local test database.`);
  }
  return url;
};

export const validateDatabaseEnvironment = (environment = {}) => {
  const configured = parseDatabaseUrl(environment.DATABASE_URL, "DATABASE_URL");
  const isolated = parseDatabaseUrl(environment.DINE_TEST_DATABASE_URL, "DINE_TEST_DATABASE_URL");
  if (configured.href !== isolated.href) {
    throw new Error("DATABASE_URL and DINE_TEST_DATABASE_URL must be the same isolated database URL.");
  }
  return EXPECTED_DATABASE;
};

const validateSystemIdentifier = (value) => {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)
    || BigInt(value) < 1n || BigInt(value) > 18446744073709551615n) {
    throw new Error("DINE_TEST_POSTGRES_SYSTEM_IDENTIFIER must be a trusted PostgreSQL system identifier.");
  }
  return value;
};

export const verifyDatabaseIdentity = async (database, expectedSystemIdentifier) => {
  const expected = validateSystemIdentifier(expectedSystemIdentifier);
  const rows = await database.$queryRaw`
    SELECT current_database() AS name,
      COALESCE(host(inet_server_addr()), '') AS server_address,
      inet_server_port() AS server_port,
      current_setting('server_version_num') AS server_version_num,
      (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier
  `;
  const identity = rows?.[0];
  const localAddress = identity?.server_address === "::1"
    || (isIP(identity?.server_address) === 4 && identity.server_address.startsWith("127."));
  const version = Number(identity?.server_version_num);
  if (identity?.name !== EXPECTED_DATABASE || !localAddress
    || Number(identity?.server_port) !== EXPECTED_PORT
    || !Number.isInteger(version) || version < 180000 || version >= 190000
    || identity?.system_identifier !== expected) {
    throw new Error("Connected database identity does not match the required isolated test database; no writes were performed.");
  }
  return identity.name;
};

export const isProjectBcryptHash = (value) => {
  const match = typeof value === "string" && value.match(/^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/);
  return Boolean(match && Number(match[1]) >= MIN_BCRYPT_COST && Number(match[1]) <= MAX_BCRYPT_COST);
};

export const hashFixturePasswords = async (passwords, bcrypt) => {
  if (!bcrypt || typeof bcrypt.hash !== "function") throw new Error("Project bcrypt implementation is unavailable.");
  const hashes = {};
  for (const role of roles) {
    if (typeof passwords?.[role] !== "string" || passwords[role].length < 6) {
      throw new Error("A password of at least 6 characters is required for each fixture role.");
    }
    hashes[role] = await bcrypt.hash(passwords[role], 12);
  }
  return hashes;
};

const makeManifest = (marker) => ({
  format: 1,
  database: EXPECTED_DATABASE,
  marker,
  createdAt: new Date().toISOString(),
  fixtures: roles.map((role) => ({
    id: randomUUID(),
    role,
    name: `Workshop Test ${role} ${marker}`,
    email: `workshop-${role.toLowerCase()}-${marker}@example.invalid`,
    ...(role === "COOK" ? { cookProfileId: randomUUID() } : {}),
  })),
});

const cookProfile = (marker, id) => ({
  id,
  businessName: `Workshop Test Kitchen ${marker}`,
  bio: "Dedicated test kitchen for isolated Workshop image verification.",
  experienceYears: "5 years",
  specialization: "Regional cooking workshops",
  cuisines: ["Maharashtrian"],
  dietaryPreferences: ["Vegetarian"],
  city: "Pune",
  locality: "Test locality",
  cookingCapacity: "20 guests",
  availableDays: ["Saturday"],
  availableMealSlots: ["Dinner"],
  prepTimeNotice: "24 hours",
  isHomeKitchenDeclared: true,
  foodSafetyConsent: true,
  verificationStatus: "APPROVED",
  isApprovedToSell: true,
  fssaiStatus: "APPROVED",
  fssaiExpiryDate: new Date("2099-12-31T23:59:59.999Z"),
});

export const createFixtures = async ({ database, expectedSystemIdentifier, passwordHashes, manifestPath, marker = randomUUID() }) => {
  if (!/^[0-9a-f-]{36}$/i.test(marker)) throw new Error("Fixture marker must be a UUID.");
  if (!passwordHashes || roles.some((role) => !isProjectBcryptHash(passwordHashes[role]))) {
    throw new Error("A valid project-compatible bcrypt hash is required for each fixture role.");
  }
  if (!manifestPath) throw new Error("A fixture manifest path is required.");
  await verifyDatabaseIdentity(database, expectedSystemIdentifier);
  const manifest = makeManifest(marker);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  // Write-ahead manifest ensures exact IDs remain available if the process exits
  // immediately after the database transaction commits. It contains no passwords.
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
  try {
    await database.$transaction(async (tx) => {
      await verifyDatabaseIdentity(tx, expectedSystemIdentifier);
      for (const fixture of manifest.fixtures) {
        const data = {
          id: fixture.id,
          name: fixture.name,
          email: fixture.email,
          passwordHash: passwordHashes[fixture.role],
          role: fixture.role,
          status: "ACTIVE",
          ...(fixture.role === "COOK" ? { cookProfile: { create: cookProfile(marker, fixture.cookProfileId) } } : {}),
        };
        await tx.user.create({ data });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    // Keep the manifest for safe inspection; cleanup is ID-scoped and tolerates
    // fixtures that were never committed.
    throw error;
  }
  return manifest;
};

export const assertManifest = (manifest) => {
  if (manifest?.format !== 1 || manifest.database !== EXPECTED_DATABASE
    || !/^[0-9a-f-]{36}$/i.test(manifest.marker || "") || !Array.isArray(manifest.fixtures)
    || manifest.fixtures.length !== roles.length) {
    throw new Error("Fixture manifest is invalid or does not belong to this utility.");
  }
  const expectedRoles = new Set(roles);
  const seenIds = new Set();
  for (const fixture of manifest.fixtures) {
    if (!expectedRoles.delete(fixture.role) || typeof fixture.id !== "string"
      || !/^[0-9a-f-]{36}$/i.test(fixture.id)
      || fixture.name !== `Workshop Test ${fixture.role} ${manifest.marker}`
      || fixture.email !== `workshop-${fixture.role.toLowerCase()}-${manifest.marker}@example.invalid`
      || seenIds.has(fixture.id)
      || (fixture.role === "COOK" && !/^[0-9a-f-]{36}$/i.test(fixture.cookProfileId || ""))
      || (fixture.role !== "COOK" && Object.hasOwn(fixture, "cookProfileId"))) {
      throw new Error("Fixture manifest contains an unexpected fixture identity.");
    }
    seenIds.add(fixture.id);
  }
  if (expectedRoles.size) throw new Error("Fixture manifest is missing a required account role.");
};

const relatedRecordCounts = async (tx, fixture) => {
  const user = await tx.user.findUnique({
    where: { id: fixture.id },
    select: {
      id: true, name: true, email: true, role: true,
      _count: { select: {
        verificationDocuments: true, addresses: true, passwordResetTokens: true,
        orders: true, experienceBookings: true, reviews: true, cookNotifications: true,
        userNotifications: true, checkouts: true, favorites: true, reviewModerations: true,
        resolvedReviewReports: true,
      } },
      cart: { select: { id: true } },
      deliveryAgent: { select: { id: true } },
      cookProfile: { select: {
        id: true,
        _count: { select: { dishes: true, orders: true, experiences: true, reviews: true, reviewReports: true } },
      } },
    },
  });
  if (!user) return null;
  if (user.email !== fixture.email || user.name !== fixture.name || user.role !== fixture.role
    || (fixture.role === "COOK" && user.cookProfile?.id !== fixture.cookProfileId)
    || (fixture.role !== "COOK" && user.cookProfile !== null)
    || user.deliveryAgent !== null) {
    throw new Error("A fixture identity no longer matches the manifest; cleanup stopped.");
  }
  const counts = [
    ...Object.values(user._count || {}),
    ...Object.values(user.cookProfile?._count || {}),
    ...(user.cart ? [1] : []),
  ];
  if (counts.some((count) => count !== 0)) {
    throw new Error("Fixture account has related records. Cleanup stopped to avoid deleting data created outside this utility.");
  }
  return user;
};

export const cleanupFixtures = async ({ database, expectedSystemIdentifier, manifest }) => {
  assertManifest(manifest);
  await verifyDatabaseIdentity(database, expectedSystemIdentifier);
  return database.$transaction(async (tx) => {
    await verifyDatabaseIdentity(tx, expectedSystemIdentifier);
    const existing = [];
    for (const fixture of manifest.fixtures) {
      const user = await relatedRecordCounts(tx, fixture);
      if (user) existing.push(fixture);
    }
    for (const fixture of existing) {
      const deleted = await tx.user.deleteMany({
        where: { id: fixture.id, email: fixture.email, role: fixture.role },
      });
      if (deleted.count !== 1) throw new Error("A fixture changed during cleanup; transaction rolled back.");
    }
    return { deletedCount: existing.length };
  }, { isolationLevel: "Serializable" });
};

const fixtureManifestPath = () => path.join(requiredFixtureDirectory, `workshop-browser-${randomUUID()}.json`);

const readHiddenPassword = async (label) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Password entry requires an interactive terminal; no password was read.");
  }
  process.stdout.write(`${label} password (hidden, minimum 6 characters): `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  try {
    return await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        for (const character of chunk.toString("utf8")) {
          if (character === "\u0003") { cleanup(); reject(new Error("Password entry cancelled.")); return; }
          if (character === "\r" || character === "\n") {
            process.stdout.write("\n"); cleanup();
            if (value.length < 6) reject(new Error("Password must be at least 6 characters."));
            else resolve(value);
            return;
          }
          if (character === "\u0008" || character === "\u007f") value = value.slice(0, -1);
          else if (character >= " ") value += character;
        }
      };
      const cleanup = () => process.stdin.off("data", onData);
      process.stdin.on("data", onData);
    });
  } finally {
    value = "";
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
};

export const manifestPathFromArgument = (providedPath, fixtureDirectory = requiredFixtureDirectory) => {
  if (typeof providedPath !== "string" || !providedPath.trim()) throw new Error("A manifest path is required.");
  const resolved = path.resolve(providedPath);
  const expectedFilename = /^workshop-browser-[0-9a-f-]{36}\.json$/i;
  if (path.dirname(resolved) !== path.resolve(fixtureDirectory)
    || !expectedFilename.test(path.basename(resolved))) {
    throw new Error("Manifest must be an exact workshop-browser fixture file in the local TasteBridge test-fixtures directory.");
  }
  return resolved;
};

const showUsage = () => {
  console.log("Workshop browser fixture utility (default mode performs no database access or writes)");
  console.log("  node prisma/test-fixtures/workshop-browser-fixtures.mjs --identity-check");
  console.log(`  node prisma/test-fixtures/workshop-browser-fixtures.mjs --create-fixtures ${CONFIRMATION_FLAG}`);
  console.log(`  node prisma/test-fixtures/workshop-browser-fixtures.mjs --cleanup-fixtures ${CONFIRMATION_FLAG} --manifest <manifest-path>`);
  console.log("Both DATABASE_URL and DINE_TEST_DATABASE_URL must be the same required isolated local database URL.");
  console.log("DINE_TEST_POSTGRES_SYSTEM_IDENTIFIER must be supplied from trusted local PostgreSQL identity evidence.");
};

const runCli = async () => {
  const { mode, manifest: manifestArgument } = parseMode(process.argv.slice(2));
  if (mode === "help") { showUsage(); return; }
  let cleanupManifest;
  if (mode === "--cleanup-fixtures") {
    const cleanupManifestPath = manifestPathFromArgument(manifestArgument);
    cleanupManifest = JSON.parse(await readFile(cleanupManifestPath, "utf8"));
    assertManifest(cleanupManifest);
  }
  await import("dotenv/config");
  validateDatabaseEnvironment(process.env);
  const expectedSystemIdentifier = validateSystemIdentifier(process.env.DINE_TEST_POSTGRES_SYSTEM_IDENTIFIER);

  const [{ default: database, pool }, bcrypt] = await Promise.all([
    import("../../src/config/prisma.js"),
    import("bcrypt"),
  ]);
  try {
    const identity = await verifyDatabaseIdentity(database, expectedSystemIdentifier);
    if (mode === "--identity-check") {
      console.log(`Read-only identity check passed: ${identity}. No records were changed.`);
      return;
    }
    if (mode === "--create-fixtures") {
      const passwords = {};
      for (const role of roles) {
        passwords[role] = await readHiddenPassword(role);
      }
      const passwordHashes = await hashFixturePasswords(passwords, bcrypt.default);
      const manifestPath = fixtureManifestPath();
      const manifest = await createFixtures({ database, expectedSystemIdentifier, passwordHashes, manifestPath });
      console.log(`Created three isolated browser-test accounts. Fixture marker: ${manifest.marker}`);
      for (const fixture of manifest.fixtures) console.log(`${fixture.role} login email: ${fixture.email}`);
      console.log("Password values were not displayed or saved.");
      console.log(`Cleanup manifest: ${manifestPath}`);
      return;
    }
    const result = await cleanupFixtures({ database, expectedSystemIdentifier, manifest: cleanupManifest });
    console.log(`Removed ${result.deletedCount} unused fixture account(s) from ${identity}.`);
    console.log("The manifest is retained for audit; remove it manually after confirming cleanup if desired.");
  } finally {
    await database.$disconnect();
    await pool.end();
  }
};

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    // Driver and validation exceptions can contain sensitive connection details.
    console.error("Fixture utility stopped safely; detailed errors were withheld.");
    process.exitCode = 1;
  });
}
