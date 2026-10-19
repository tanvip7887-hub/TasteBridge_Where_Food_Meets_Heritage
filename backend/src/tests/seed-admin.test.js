import test from "node:test";
import assert from "node:assert/strict";
import { ensureSeedAdmin, requireSeedAdminPassword } from "../../prisma/seed-admin.js";

test("seed Admin password is required and non-empty before database access", async () => {
  for (const password of [undefined, "", "   "]) {
    assert.throws(
      () => requireSeedAdminPassword(password),
      /SEED_ADMIN_PASSWORD must be configured/
    );
  }

  let databaseCalls = 0;
  await assert.rejects(
    ensureSeedAdmin({
      database: { user: { findUnique: async () => { databaseCalls += 1; } } },
      email: "admin@example.test",
      password: "",
      hashPassword: async () => "unused",
    }),
    /SEED_ADMIN_PASSWORD must be configured/
  );
  assert.equal(databaseCalls, 0);
});

test("rerunning seed for an active Admin leaves the account unchanged", async () => {
  const existing = {
    id: "existing-admin",
    email: "admin@example.test",
    passwordHash: "existing-hash",
    role: "ADMIN",
    status: "ACTIVE",
    name: "Existing administrator",
  };
  const calls = { find: 0, create: 0, hash: 0 };
  const result = await ensureSeedAdmin({
    database: {
      user: {
        findUnique: async () => { calls.find += 1; return existing; },
        create: async () => { calls.create += 1; throw new Error("must not create"); },
      },
    },
    email: "ADMIN@example.test ",
    password: "configured-test-password",
    hashPassword: async () => { calls.hash += 1; return "new-hash"; },
  });

  assert.equal(result.user, existing);
  assert.equal(result.created, false);
  assert.deepEqual(calls, { find: 1, create: 0, hash: 0 });
  assert.equal(existing.passwordHash, "existing-hash");
  assert.equal(existing.name, "Existing administrator");
});

test("seed refuses to promote or reactivate an existing account", async () => {
  for (const existing of [
    { role: "CUSTOMER", status: "ACTIVE" },
    { role: "ADMIN", status: "SUSPENDED" },
  ]) {
    let createCalls = 0;
    await assert.rejects(
      ensureSeedAdmin({
        database: {
          user: {
            findUnique: async () => existing,
            create: async () => { createCalls += 1; },
          },
        },
        email: "admin@example.test",
        password: "configured-test-password",
        hashPassword: async () => "unused",
      }),
      /not an active Admin/
    );
    assert.equal(createCalls, 0);
  }
});

test("first-time seed hashes the configured password before creating an Admin", async () => {
  const calls = { find: 0, createData: null, hashArgs: null };
  const user = { id: "new-admin", email: "admin@example.test", role: "ADMIN", status: "ACTIVE" };
  const result = await ensureSeedAdmin({
    database: {
      user: {
        findUnique: async () => { calls.find += 1; return null; },
        create: async ({ data }) => { calls.createData = data; return user; },
      },
    },
    email: "ADMIN@example.test ",
    password: "configured-test-password",
    hashPassword: async (...args) => { calls.hashArgs = args; return "bcrypt-hash"; },
  });

  assert.equal(result.user, user);
  assert.equal(result.created, true);
  assert.deepEqual(calls.hashArgs, ["configured-test-password", 10]);
  assert.equal(calls.createData.email, "admin@example.test");
  assert.equal(calls.createData.passwordHash, "bcrypt-hash");
  assert.equal(calls.createData.role, "ADMIN");
  assert.equal(calls.createData.status, "ACTIVE");
});
