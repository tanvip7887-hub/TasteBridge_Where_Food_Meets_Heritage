import assert from "node:assert/strict";
import test from "node:test";
import { createAddressService } from "../modules/address/address.service.js";
import { addressIdSchema, createAddressSchema, updateAddressSchema } from "../modules/address/address.validation.js";

const validAddress = (overrides = {}) => ({
  label: "Home",
  recipientName: "Asha Rao",
  phone: "+91 98765-43210",
  addressLine1: "Flat 2, Lake View",
  addressLine2: "Second floor",
  locality: "Aundh",
  city: "Pune",
  state: "Maharashtra",
  pincode: "411007",
  landmark: "Near market",
  isDefault: false,
  ...overrides,
});

const createDatabase = () => {
  const rows = [];
  let nextId = 1;
  const db = {
    async $transaction(callback) { return callback(db); },
    async $queryRaw(strings, ...values) { assert.match(strings.join("?"), /FOR UPDATE/); assert.ok(values[0]); return []; },
    address: {
      async findMany({ where, orderBy, select } = {}) {
        let result = rows.filter((row) => !where || row.userId === where.userId && (where.isDefault === undefined || row.isDefault === where.isDefault));
        if (orderBy?.[0]?.createdAt === "asc") result = [...result].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        else result = [...result].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
        return result.map((row) => select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row });
      },
      async create({ data }) {
        const row = { ...data, id: `address-${nextId++}`, createdAt: new Date(nextId), updatedAt: new Date(nextId) };
        rows.push(row);
        return { ...row };
      },
      async findFirst({ where, select }) {
        const row = rows.find((candidate) => candidate.id === where.id && candidate.userId === where.userId);
        return row ? select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row } : null;
      },
      async update({ where, data }) {
        const row = rows.find((candidate) => candidate.id === where.id);
        assert.ok(row);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      async updateMany({ where, data }) {
        const matches = rows.filter((row) => row.userId === where.userId && row.isDefault === where.isDefault);
        for (const row of matches) Object.assign(row, data, { updatedAt: new Date() });
        return { count: matches.length };
      },
      async delete({ where }) {
        const index = rows.findIndex((row) => row.id === where.id);
        assert.notEqual(index, -1);
        return rows.splice(index, 1)[0];
      },
    },
    rows,
  };
  return db;
};

test("address validation requires Indian PIN and a project-convention phone number", () => {
  const parsed = createAddressSchema.body.safeParse(validAddress());
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.phone, "+919876543210");
  for (const pincode of ["000001", "41100", "41100A"]) {
    assert.equal(createAddressSchema.body.safeParse(validAddress({ pincode })).success, false);
  }
  for (const phone of ["12345", "abc9876543210"]) {
    assert.equal(createAddressSchema.body.safeParse(validAddress({ phone })).success, false);
  }
  assert.equal(createAddressSchema.body.safeParse(validAddress({ locality: "  " })).success, false);
  assert.equal(createAddressSchema.body.safeParse(validAddress({ recipientName: "" })).success, false);
});

test("address update and ID inputs are validated without accepting user ownership fields", () => {
  assert.equal(updateAddressSchema.body.safeParse({ city: " Mumbai " }).data.city, "Mumbai");
  assert.equal(updateAddressSchema.body.safeParse({}).success, false);
  assert.equal(updateAddressSchema.body.safeParse({ userId: "other-user" }).success, false);
  assert.equal(addressIdSchema.params.safeParse({ id: "address-1" }).success, true);
  assert.equal(addressIdSchema.params.safeParse({ id: "../other" }).success, false);
});

test("address CRUD keeps one default and deleting the default selects a remaining address", async () => {
  const db = createDatabase();
  const service = createAddressService(db);
  const first = await service.create("customer-1", validAddress());
  assert.equal(first.items.length, 1);
  assert.equal(first.defaultAddress.id, first.items[0].id);

  const second = await service.create("customer-1", validAddress({ label: "Work", addressLine1: "Office building", isDefault: false }));
  assert.equal(second.items.filter((address) => address.isDefault).length, 1);
  const secondAddress = second.items.find((address) => address.label === "Work");
  const madeDefault = await service.setDefault("customer-1", secondAddress.id);
  assert.equal(madeDefault.defaultAddress.id, secondAddress.id);
  assert.equal(madeDefault.items.filter((address) => address.isDefault).length, 1);

  const updated = await service.update("customer-1", secondAddress.id, { locality: "Baner" });
  assert.equal(updated.items.find((address) => address.id === secondAddress.id).locality, "Baner");
  const firstAddressId = first.items[0].id;
  const unsetDefault = await service.update("customer-1", secondAddress.id, { isDefault: false });
  assert.equal(unsetDefault.defaultAddress.id, firstAddressId);
  await service.setDefault("customer-1", secondAddress.id);
  await assert.rejects(service.update("customer-2", secondAddress.id, { city: "Mumbai" }), { statusCode: 404 });
  await assert.rejects(service.remove("customer-2", secondAddress.id), { statusCode: 404 });

  const afterDelete = await service.remove("customer-1", secondAddress.id);
  assert.equal(afterDelete.items.length, 1);
  assert.equal(afterDelete.defaultAddress.id, first.items[0].id);
  assert.equal(await service.getDefault("customer-1").then((address) => address.id), first.items[0].id);
});

test("address operations repair duplicate legacy defaults deterministically", async () => {
  const db = createDatabase();
  const service = createAddressService(db);
  const first = await service.create("customer-1", validAddress());
  const second = await service.create("customer-1", validAddress({ label: "Work" }));
  db.rows.forEach((row) => { row.isDefault = true; });
  const result = await service.list("customer-1");
  assert.equal(result.items.filter((address) => address.isDefault).length, 2);
  const workAddress = second.items.find((address) => address.label === "Work");
  const normalized = await service.setDefault("customer-1", workAddress.id);
  assert.equal(normalized.items.filter((address) => address.isDefault).length, 1);
  assert.equal(normalized.defaultAddress.id, workAddress.id);
  assert.ok(first.items.length);
});
