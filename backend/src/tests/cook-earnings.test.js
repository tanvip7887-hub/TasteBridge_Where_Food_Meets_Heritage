import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createCookEarningsService } from "../modules/cook/cook-earnings.service.js";
import { cookEarningsQuerySchema } from "../modules/cook/cook.validation.js";

const fixedNow = () => new Date("2026-10-17T12:00:00.000Z");
const aggregateValues = { _sum: { subtotal: "100.00", platformFee: "10.00", cookEarning: "90.00" } };

const makeEarningsDatabase = (usersToCooks, orders) => {
  const matches = (order, where) => {
    if (where.cookId && order.cookId !== where.cookId) return false;
    if (where.status && order.status !== where.status) return false;
    if (where.paymentStatus && order.paymentStatus !== where.paymentStatus) return false;
    if (where.checkout?.is?.paymentMethod && order.checkout?.paymentMethod !== where.checkout.is.paymentMethod) return false;
    if (where.orderNumber && !order.orderNumber.toLowerCase().includes(where.orderNumber.contains.toLowerCase())) return false;
    const historyFilter = where.statusHistory?.some;
    if (historyFilter && !order.statusHistory.some((entry) => entry.toStatus === historyFilter.toStatus
      && (!historyFilter.changedAt || (entry.changedAt >= historyFilter.changedAt.gte && entry.changedAt < historyFilter.changedAt.lt)))) return false;
    return true;
  };
  return {
    cookProfile: { findUnique: async ({ where }) => usersToCooks[where.userId] ? { id: usersToCooks[where.userId] } : null },
    order: {
      aggregate: async ({ where, _sum }) => {
        const rows = orders.filter((order) => matches(order, where));
        return { _sum: Object.fromEntries(Object.keys(_sum).map((field) => [
          field, rows.length ? rows.reduce((total, order) => total + Number(order[field]), 0).toFixed(2) : null,
        ])) };
      },
      count: async ({ where }) => orders.filter((order) => matches(order, where)).length,
      findMany: async ({ where }) => orders.filter((order) => matches(order, where)),
    },
  };
};

const deliveredOrder = ({ id, cookId, paymentStatus, paymentMethod = "COD", cookEarning }) => ({
  id,
  cookId,
  orderNumber: `TB-${id}`,
  status: "DELIVERED",
  paymentStatus,
  subtotal: "120.00",
  platformFee: "12.00",
  cookEarning,
  createdAt: new Date("2026-10-10T00:00:00.000Z"),
  updatedAt: new Date("2026-10-11T00:00:00.000Z"),
  checkout: { paymentMethod },
  statusHistory: [{ toStatus: "DELIVERED", changedAt: new Date("2026-10-10T12:00:00.000Z") }],
});

test("cook earnings use saved amounts, payment eligibility, and IST delivery-month boundaries", async () => {
  const aggregateQueries = [];
  let listQuery;
  const service = createCookEarningsService({
    cookProfile: { findUnique: async ({ where }) => {
      assert.deepEqual(where, { userId: "user-1" });
      return { id: "cook-1" };
    } },
    order: {
      aggregate: async (query) => { aggregateQueries.push(query); return aggregateValues; },
      count: async () => 2,
      findMany: async (query) => {
        listQuery = query;
        return [
          { id: "paid", orderNumber: "TB-1", status: "DELIVERED", subtotal: "100.00", platformFee: "10.00", cookEarning: "90.00", paymentStatus: "PAID", checkout: { paymentMethod: "ONLINE" }, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-03"), statusHistory: [{ changedAt: new Date("2026-10-02") }] },
          { id: "cod", orderNumber: "TB-2", status: "DELIVERED", subtotal: "50.00", platformFee: "5.00", cookEarning: "45.00", paymentStatus: "PENDING", checkout: { paymentMethod: "COD" }, createdAt: new Date("2026-10-03"), updatedAt: new Date("2026-10-04"), statusHistory: [{ changedAt: new Date("2026-10-04") }] },
        ];
      },
    },
  }, fixedNow);

  const result = await service.getEarnings("user-1");
  assert.deepEqual(result.totals.allTime, { grossAmount: 100, platformCommission: 10, netCookEarnings: 90 });
  assert.deepEqual(result.totals.currentMonth, { grossAmount: 100, platformCommission: 10, netCookEarnings: 90 });
  assert.deepEqual(result.totals.previousMonth, { grossAmount: 100, platformCommission: 10, netCookEarnings: 90 });
  assert.equal(result.totals.awaitingCodCollection, 90);
  assert.equal(result.orders[0].earningStatus, "EARNED");
  assert.equal(result.orders[0].deliveredAt.toISOString(), "2026-10-02T00:00:00.000Z");
  assert.equal(result.orders[1].earningStatus, "AWAITING_COD_COLLECTION");
  assert.equal(result.payoutSettlementTracked, false);
  assert.equal(result.pagination.totalCount, 2);
  assert.equal(listQuery.take, 20);
  assert.equal(listQuery.skip, 0);

  assert.deepEqual(aggregateQueries[0].where, { cookId: "cook-1", status: "DELIVERED", paymentStatus: "PAID" });
  assert.deepEqual(aggregateQueries[1].where.statusHistory.some.changedAt, {
    gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-31T18:30:00.000Z"),
  });
  assert.deepEqual(aggregateQueries[2].where.statusHistory.some.changedAt, {
    gte: new Date("2026-08-31T18:30:00.000Z"), lt: new Date("2026-09-30T18:30:00.000Z"),
  });
  assert.deepEqual(aggregateQueries[3].where, {
    cookId: "cook-1", status: "DELIVERED", paymentStatus: "PENDING", checkout: { is: { paymentMethod: "COD" } },
  });
});

test("IST month selection changes immediately before and exactly at midnight on the first", async () => {
  const queryFor = async (instant) => {
    const aggregateQueries = [];
    const service = createCookEarningsService({
      cookProfile: { findUnique: async () => ({ id: "cook-boundary" }) },
      order: {
        aggregate: async (query) => { aggregateQueries.push(query); return aggregateValues; },
        count: async () => 0,
        findMany: async () => [],
      },
    }, () => new Date(instant));
    await service.getEarnings("user-boundary");
    return aggregateQueries;
  };

  const beforeBoundary = await queryFor("2026-10-31T18:29:59.999Z");
  const atBoundary = await queryFor("2026-10-31T18:30:00.000Z");

  assert.deepEqual(beforeBoundary[1].where.statusHistory.some.changedAt, {
    gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-31T18:30:00.000Z"),
  });
  assert.deepEqual(beforeBoundary[2].where.statusHistory.some.changedAt, {
    gte: new Date("2026-08-31T18:30:00.000Z"), lt: new Date("2026-09-30T18:30:00.000Z"),
  });
  assert.deepEqual(atBoundary[1].where.statusHistory.some.changedAt, {
    gte: new Date("2026-10-31T18:30:00.000Z"), lt: new Date("2026-11-30T18:30:00.000Z"),
  });
  assert.deepEqual(atBoundary[2].where.statusHistory.some.changedAt, {
    gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-31T18:30:00.000Z"),
  });
});

test("missing delivery history does not fabricate a delivery date or monthly reporting period", async () => {
  let listQuery;
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-no-history" }) },
    order: {
      aggregate: async () => aggregateValues,
      count: async ({ where }) => {
        assert.deepEqual(where.statusHistory.some, {
          toStatus: "DELIVERED",
          changedAt: { gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-31T18:30:00.000Z") },
        });
        return 1;
      },
      findMany: async (query) => {
        listQuery = query;
        return [{
          id: "delivered-without-history", orderNumber: "TB-NOHISTORY", status: "DELIVERED",
          subtotal: "100.00", platformFee: "10.00", cookEarning: "90.00", paymentStatus: "PAID",
          createdAt: new Date("2026-10-01T00:00:00.000Z"), updatedAt: new Date("2026-10-20T00:00:00.000Z"),
          checkout: { paymentMethod: "ONLINE" }, statusHistory: [],
        }];
      },
    },
  }, fixedNow);

  const result = await service.getEarnings("user-no-history", { period: "THIS_MONTH" });
  assert.equal(listQuery.where.statusHistory.some.toStatus, "DELIVERED");
  assert.deepEqual(result.orders[0].deliveredAt, null);
  assert.notEqual(result.orders[0].deliveredAt, result.orders[0].placedAt);
  assert.notEqual(result.orders[0].deliveredAt, result.orders[0].updatedAt);
});

test("earnings history filters and paginates only the authenticated cook's orders", async () => {
  let countQuery;
  let listQuery;
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-7" }) },
    order: {
      aggregate: async () => aggregateValues,
      count: async ({ where }) => { countQuery = where; return 31; },
      findMany: async (query) => { listQuery = query; return []; },
    },
  }, fixedNow);

  const result = await service.getEarnings("user-7", {
    page: 2, pageSize: 10, search: " tb-", status: "DELIVERED", paymentStatus: "PAID", period: "THIS_MONTH",
  });
  assert.deepEqual(countQuery, {
    cookId: "cook-7",
    status: "DELIVERED",
    paymentStatus: "PAID",
    orderNumber: { contains: " tb-", mode: "insensitive" },
    statusHistory: { some: { toStatus: "DELIVERED", changedAt: { gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-31T18:30:00.000Z") } } },
  });
  assert.equal(listQuery.skip, 10);
  assert.equal(listQuery.take, 10);
  assert.equal(result.pagination.totalPages, 4);
  assert.equal(result.pagination.hasPreviousPage, true);
  assert.equal(result.pagination.hasNextPage, true);
});

test("cancelled, failed, and refunded orders do not count as earned; refunded and cancelled labels stay explicit", async () => {
  const orders = [
    { id: "cancelled", status: "CANCELLED", paymentStatus: "PENDING", subtotal: "0", platformFee: "0", cookEarning: "0", checkout: { paymentMethod: "COD" }, statusHistory: [] },
    { id: "failed", status: "DELIVERED", paymentStatus: "FAILED", subtotal: "0", platformFee: "0", cookEarning: "0", checkout: { paymentMethod: "ONLINE" }, statusHistory: [] },
    { id: "refund", status: "DELIVERED", paymentStatus: "REFUNDED", subtotal: "0", platformFee: "0", cookEarning: "0", checkout: { paymentMethod: "ONLINE" }, statusHistory: [] },
  ];
  const queries = [];
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-1" }) },
    order: {
      aggregate: async (query) => { queries.push(query); return { _sum: { cookEarning: "0", subtotal: "0", platformFee: "0" } }; },
      count: async () => orders.length,
      findMany: async () => orders,
    },
  }, fixedNow);
  const result = await service.getEarnings("user-1");
  assert.equal(result.totalEarned, 0);
  assert.deepEqual(result.orders.map(({ earningStatus }) => earningStatus), [
    "CANCELLED_NOT_EARNED", "NOT_YET_EARNED", "REFUNDED_NOT_EARNED",
  ]);
  assert.ok(queries.slice(0, 3).every(({ where }) => where.paymentStatus === "PAID" && where.status === "DELIVERED"));
});

test("earnings report persisted subtotal and cook-earning snapshots without recalculating mismatched records", async () => {
  const storedOrders = [
    { id: "exact", orderNumber: "TB-EXACT", status: "DELIVERED", subtotal: "10.10", platformFee: "1.01", cookEarning: "9.09", paymentStatus: "PAID", checkout: { paymentMethod: "ONLINE" }, createdAt: new Date("2026-10-01T00:00:00.000Z"), updatedAt: new Date("2026-10-02T00:00:00.000Z"), statusHistory: [{ changedAt: new Date("2026-10-02T00:00:00.000Z") }] },
    { id: "mismatch", orderNumber: "TB-MISMATCH", status: "DELIVERED", subtotal: "10.10", platformFee: "1.01", cookEarning: "9.08", paymentStatus: "PAID", checkout: { paymentMethod: "ONLINE" }, createdAt: new Date("2026-10-03T00:00:00.000Z"), updatedAt: new Date("2026-10-04T00:00:00.000Z"), statusHistory: [{ changedAt: new Date("2026-10-04T00:00:00.000Z") }] },
  ];
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-reconcile" }) },
    order: {
      aggregate: async () => ({ _sum: { subtotal: "20.20", platformFee: "2.02", cookEarning: "18.17" } }),
      count: async () => storedOrders.length,
      findMany: async () => storedOrders,
    },
  }, fixedNow);

  const result = await service.getEarnings("user-reconcile");
  assert.deepEqual(result.totals.allTime, { grossAmount: 20.2, platformCommission: 2.02, netCookEarnings: 18.17 });
  assert.deepEqual(result.orders.map(({ grossAmount, platformCommission, amount }) => ({ grossAmount, platformCommission, amount })), [
    { grossAmount: 10.1, platformCommission: 1.01, amount: 9.09 },
    { grossAmount: 10.1, platformCommission: 1.01, amount: 9.08 },
  ]);
  // An existing mismatch remains visible as persisted data; earnings does not
  // silently reconstruct cookEarning or recalculate historical commission.
  assert.equal(result.totals.allTime.grossAmount - result.totals.allTime.platformCommission, 18.18);
  assert.notEqual(result.totals.allTime.netCookEarnings, 18.18);
});

test("empty earnings aggregates with missing sums serialize as exact zero values", async () => {
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-empty" }) },
    order: {
      aggregate: async () => ({ _sum: { subtotal: null, platformFee: null, cookEarning: null } }),
      count: async () => 0,
      findMany: async () => [],
    },
  }, fixedNow);

  const result = await service.getEarnings("user-empty");
  assert.deepEqual(result.totals.allTime, { grossAmount: 0, platformCommission: 0, netCookEarnings: 0 });
  assert.deepEqual(result.orders, []);
});

test("confirmed COD collection makes the delivered cook snapshot earned once; unconfirmed COD stays separate", async () => {
  const codOrder = deliveredOrder({ id: "cod-collection", cookId: "cook-cod", paymentStatus: "PENDING", cookEarning: "108.00" });
  const service = createCookEarningsService(makeEarningsDatabase({ "user-cod": "cook-cod" }, [codOrder]), fixedNow);

  const beforeCollection = await service.getEarnings("user-cod");
  assert.equal(beforeCollection.totals.allTime.netCookEarnings, 0);
  assert.equal(beforeCollection.totals.awaitingCodCollection, 108);
  assert.equal(beforeCollection.orders[0].earningStatus, "AWAITING_COD_COLLECTION");

  // Delivery-agent confirmCodCollection persists this guarded PENDING -> PAID
  // transition only after delivery. Earnings reads that persisted state.
  codOrder.paymentStatus = "PAID";
  const afterCollection = await service.getEarnings("user-cod");
  assert.equal(afterCollection.totals.allTime.netCookEarnings, 108);
  assert.equal(afterCollection.totals.currentMonth.netCookEarnings, 108);
  assert.equal(afterCollection.totals.awaitingCodCollection, 0);
  assert.equal(afterCollection.orders[0].amount, 108);
  assert.equal(afterCollection.orders[0].earningStatus, "EARNED");

  const retriedRead = await service.getEarnings("user-cod");
  assert.equal(retriedRead.totals.allTime.netCookEarnings, 108);
  assert.equal(retriedRead.orders.length, 1, "repeated earnings reads count the persisted order once");
});

test("confirmed COD earnings stay attributed to each cook in a multi-cook checkout", async () => {
  const orders = [
    deliveredOrder({ id: "cook-one-order", cookId: "cook-one", paymentStatus: "PAID", cookEarning: "108.00" }),
    deliveredOrder({ id: "cook-two-order", cookId: "cook-two", paymentStatus: "PAID", cookEarning: "72.00" }),
  ];
  const database = makeEarningsDatabase({ "user-one": "cook-one", "user-two": "cook-two" }, orders);
  const cookOne = await createCookEarningsService(database, fixedNow).getEarnings("user-one");
  const cookTwo = await createCookEarningsService(database, fixedNow).getEarnings("user-two");

  assert.equal(cookOne.totals.allTime.netCookEarnings, 108);
  assert.deepEqual(cookOne.orders.map(({ id }) => id), ["cook-one-order"]);
  assert.equal(cookTwo.totals.allTime.netCookEarnings, 72);
  assert.deepEqual(cookTwo.orders.map(({ id }) => id), ["cook-two-order"]);
});

test("earnings reject users without a cook profile", async () => {
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => null },
    order: { aggregate: async () => assert.fail("must not query earnings"), count: async () => assert.fail(), findMany: async () => assert.fail() },
  }, fixedNow);
  await assert.rejects(service.getEarnings("customer-1"), { statusCode: 404 });
});

test("earnings query validation bounds pagination and restricts filters to persisted enums", () => {
  assert.equal(cookEarningsQuerySchema.query.safeParse({ page: "2", pageSize: "50", period: "LAST_MONTH", status: "DELIVERED" }).success, true);
  const maximumPage = cookEarningsQuerySchema.query.safeParse({ page: "1000", pageSize: "50" });
  assert.equal(maximumPage.success, true);
  assert.equal(maximumPage.data.page, 1000);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ page: "1001" }).success, false);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ page: "0" }).success, false);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ page: "not-a-number" }).success, false);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ page: "1.5" }).success, false);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ pageSize: "1000" }).success, false);
  assert.equal(cookEarningsQuerySchema.query.safeParse({ status: "SETTLED" }).success, false);
});

test("maximum earnings page keeps the Prisma offset bounded", async () => {
  let listQuery;
  const service = createCookEarningsService({
    cookProfile: { findUnique: async () => ({ id: "cook-1" }) },
    order: {
      aggregate: async () => aggregateValues,
      count: async () => 50_000,
      findMany: async (query) => { listQuery = query; return []; },
    },
  }, fixedNow);

  await service.getEarnings("user-1", { page: 1000, pageSize: 50 });
  assert.equal(listQuery.skip, 49_950);
  assert.equal(listQuery.take, 50);
});

test("cook earnings endpoint remains restricted to approved cooks and validates query parameters", async () => {
  const routes = await readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  assert.match(routes, /router\.get\("\/earnings", requireApprovedCook, validate\(cookEarningsQuerySchema\), getMyCookEarnings\)/);
});
