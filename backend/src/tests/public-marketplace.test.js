import assert from "node:assert/strict";
import test from "node:test";
import {
  getPublicDishById,
  getPublicDishes,
} from "../modules/category/category.service.js";
import {
  publicDishIdParamsSchema,
  publicDishListQuerySchema,
} from "../modules/category/marketplace.validation.js";
import { publicDishesWhere } from "../utils/marketplaceSecurity.js";
import { cookSellingReadinessWhere } from "../utils/cookReadiness.js";

const options = (overrides = {}) => ({
  search: undefined,
  categoryId: undefined,
  sort: "newest",
  page: 1,
  limit: 10,
  ...overrides,
});

const makeDatabase = ({ category = { id: "category-1" }, dishes = [], total = dishes.length, detail = null, eligibleCookIds = ["cook-1"] } = {}) => {
  const calls = { counts: [], lists: [], details: [], categoryLookups: [], textEligibilityQueries: [] };
  return {
    calls,
    async $queryRaw(strings, ...values) {
      calls.textEligibilityQueries.push({ sql: strings.join("?"), values });
      return eligibleCookIds.map((id) => ({ id }));
    },
    foodCategory: {
      async findFirst(query) {
        calls.categoryLookups.push(query);
        return category;
      },
    },
    dish: {
      async count(query) {
        calls.counts.push(query);
        return total;
      },
      async findMany(query) {
        calls.lists.push(query);
        return dishes.filter((dish) => query.where.cook.is.id.in.includes(dish.cook.id));
      },
      async findFirst(query) {
        calls.details.push(query);
        return detail && query.where.cook.is.id.in.includes(detail.cook.id) ? detail : null;
      },
    },
  };
};

const sampleDish = (overrides = {}) => ({
  id: "dish-1",
  name: "Idli",
  price: 25,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  cook: { id: "cook-1", businessName: "Home Kitchen", privatePhone: "555-1234" },
  category: { id: "category-1", name: "South Indian", slug: "south-indian" },
  story: {
    whoTaught: "Grandmother",
    occasion: null,
    culturalSignificance: null,
    storyText: "A family recipe shared for generations.",
    visibility: "PUBLIC",
    mediaUrl: "private-media-reference",
  },
  privateField: "must not escape select",
  ...overrides,
});

test("public listing applies eligibility, search, category, pagination, and metadata", async () => {
  const database = makeDatabase({ dishes: [sampleDish()], total: 23 });
  const result = await getPublicDishes(database, options({
    search: "idli",
    categoryId: "category-1",
    page: 2,
    limit: 10,
  }));

  const expectedWhere = {
    ...publicDishesWhere("category-1", new Date(), ["cook-1"]),
    OR: [
      { name: { contains: "idli", mode: "insensitive" } },
      { description: { contains: "idli", mode: "insensitive" } },
      { cuisine: { contains: "idli", mode: "insensitive" } },
      { cook: { is: { businessName: { contains: "idli", mode: "insensitive" } } } },
    ],
  };

  const normalizeExpiry = (where) => where;
  expectedWhere.cook.is.fssaiExpiryDate = database.calls.counts[0].where.cook.is.fssaiExpiryDate;
  assert.deepEqual(normalizeExpiry(database.calls.counts[0].where), normalizeExpiry(expectedWhere));
  assert.ok(database.calls.counts[0].where.cook.is.fssaiExpiryDate.gt instanceof Date);
  assert.equal(database.calls.textEligibilityQueries.length, 1);
  assert.equal(database.calls.textEligibilityQueries[0].values.length, 8);
  assert.deepEqual(database.calls.lists[0], {
    where: database.calls.lists[0].where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: 10,
    take: 10,
    select: database.calls.lists[0].select,
  });
  assert.deepEqual(normalizeExpiry(database.calls.lists[0].where), normalizeExpiry(expectedWhere));
  assert.equal(result.pagination.page, 2);
  assert.equal(result.pagination.limit, 10);
  assert.equal(result.pagination.total, 23);
  assert.equal(result.pagination.totalPages, 3);
  assert.equal(result.items[0].story.visibility, "PUBLIC");
  assert.equal("privateField" in result.items[0], false);
  assert.equal("privatePhone" in result.items[0].cook, false);
  assert.equal("mediaUrl" in result.items[0].story, false);
  assert.equal("imagePublicId" in database.calls.lists[0].select, false);
});

test("empty search results report zero pages", async () => {
  const result = await getPublicDishes(makeDatabase({ dishes: [], total: 0 }), options({ search: "saffron" }));
  assert.deepEqual(result, { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
});

test("public listing keeps published stock and every seller approval requirement in its predicate", async () => {
  const database = makeDatabase();
  await getPublicDishes(database, options());
  const where = database.calls.lists[0].where;
  assert.equal(where.status, "PUBLISHED");
  assert.equal(where.isAvailable, true);
  assert.deepEqual(where.availableQuantity, { gt: 0 });
  assert.deepEqual(where.cook.is, {
    ...cookSellingReadinessWhere(where.cook.is.fssaiExpiryDate.gt, ["cook-1"]),
    isOpen: true,
  });
  const { fssaiExpiryDate } = where.cook.is;
  assert.ok(fssaiExpiryDate.gt instanceof Date);
});

test("profiles with invalid required text are excluded in SQL before counts, pages, and detail lookup", async () => {
  const listingDatabase = makeDatabase({
    dishes: [sampleDish()],
    total: 0,
    eligibleCookIds: [],
  });
  const listing = await getPublicDishes(listingDatabase, options({ page: 2, limit: 5 }));

  assert.deepEqual(listing, {
    items: [],
    pagination: { page: 2, limit: 5, total: 0, totalPages: 0 },
  });
  assert.deepEqual(listingDatabase.calls.counts[0].where.cook.is.id, { in: [] });
  assert.equal(listingDatabase.calls.lists[0].skip, 5);
  assert.equal(listingDatabase.calls.lists[0].take, 5);

  const detailDatabase = makeDatabase({ detail: sampleDish(), eligibleCookIds: [] });
  assert.equal(await getPublicDishById(detailDatabase, "dish-1"), null);
  assert.deepEqual(detailDatabase.calls.details[0].where.cook.is.id, { in: [] });
});

test("all allowed sort orders use an ID tie-breaker", async () => {
  const cases = [
    ["newest", [{ createdAt: "desc" }, { id: "asc" }]],
    ["price_asc", [{ price: "asc" }, { id: "asc" }]],
    ["price_desc", [{ price: "desc" }, { id: "asc" }]],
  ];
  for (const [sort, orderBy] of cases) {
    const database = makeDatabase();
    await getPublicDishes(database, options({ sort }));
    assert.deepEqual(database.calls.lists[0].orderBy, orderBy);
  }
});

test("inactive and nonexistent categories return empty paginated results without querying dishes", async () => {
  for (const category of [null, null]) {
    const database = makeDatabase({ category });
    const result = await getPublicDishes(database, options({ categoryId: "category-1" }));
    assert.deepEqual(result, { items: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    assert.equal(database.calls.counts.length, 0);
    assert.equal(database.calls.lists.length, 0);
  }
});

test("active category filter is validated before count and listing queries", async () => {
  const database = makeDatabase({ category: { id: "category-1" } });
  await getPublicDishes(database, options({ categoryId: "category-1" }));
  assert.deepEqual(database.calls.categoryLookups, [{
    where: { id: "category-1", isActive: true },
    select: { id: true },
  }]);
  assert.equal(database.calls.counts[0].where.categoryId, "category-1");
});

test("public detail uses the complete eligibility predicate and returns only public story fields", async () => {
  const database = makeDatabase({ detail: sampleDish() });
  const result = await getPublicDishById(database, "dish-1");

  const { cook, ...actualWhere } = database.calls.details[0].where;
  const { fssaiExpiryDate } = cook.is;
  assert.deepEqual(actualWhere, { id: "dish-1", status: "PUBLISHED", isAvailable: true, availableQuantity: { gt: 0 } });
  assert.deepEqual(cook.is, {
    ...cookSellingReadinessWhere(fssaiExpiryDate.gt, ["cook-1"]),
    isOpen: true,
  });
  assert.ok(fssaiExpiryDate.gt instanceof Date);
  assert.equal(result.story.visibility, "PUBLIC");
  assert.equal("mediaUrl" in result.story, false);
  assert.equal("privateField" in result, false);
  assert.equal("privatePhone" in result.cook, false);
});

test("public detail maps unpublished, unavailable, out-of-stock, and ineligible dishes to not found", async () => {
  for (const detail of [null, null, null, null]) {
    const result = await getPublicDishById(makeDatabase({ detail }), "dish-private");
    assert.equal(result, null);
  }
});

test("PUBLIC stories are serialized; PRIVATE and ARCHIVE_ONLY stories are hidden", async () => {
  for (const visibility of ["PRIVATE", "ARCHIVE_ONLY"]) {
    const result = await getPublicDishById(
      makeDatabase({ detail: sampleDish({ story: { whoTaught: "Secret", storyText: "Secret", visibility } }) }),
      "dish-1"
    );
    assert.equal(result.story, null);
  }
});

test("listing and detail query validation rejects malformed and out-of-bounds inputs", () => {
  const parseQuery = (query) => publicDishListQuerySchema.query.parse(query);
  assert.deepEqual(parseQuery({}), { sort: "newest", page: 1, limit: 10 });
  assert.equal(parseQuery({ page: "2", limit: "100" }).page, 2);
  for (const query of [
    { page: "0" },
    { page: "1.5" },
    { page: "1e3" },
    { page: "1000001" },
    { limit: "101" },
    { limit: "0" },
    { sort: "random" },
    { categoryId: " " },
    { categoryId: "invalid/id" },
    { unknown: "value" },
  ]) {
    assert.throws(() => parseQuery(query), undefined, JSON.stringify(query));
  }
  assert.throws(() => publicDishIdParamsSchema.params.parse({ id: "bad/id" }));
});
