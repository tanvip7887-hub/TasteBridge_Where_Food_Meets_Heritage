import assert from "node:assert/strict";
import test from "node:test";
import { getPublicDishesForCategory } from "../modules/category/category.service.js";

const makeDatabase = ({ category, dishes = [] }) => {
  let dishFindManyCalls = 0;
  let dishQuery;
  const textEligibilityQueries = [];
  return {
    foodCategory: {
      async findFirst(query) {
        assert.deepEqual(query, {
          where: { id: "category-1", isActive: true },
          select: { id: true },
        });
        return category;
      },
    },
    dish: {
      async findMany(query) {
        dishFindManyCalls += 1;
        dishQuery = query;
        return dishes;
      },
    },
    async $queryRaw(strings, ...values) {
      textEligibilityQueries.push({ sql: strings.join("?"), values });
      return [{ id: "cook-1" }];
    },
    get dishFindManyCalls() {
      return dishFindManyCalls;
    },
    get dishQuery() {
      return dishQuery;
    },
    get textEligibilityQueries() {
      return textEligibilityQueries;
    },
  };
};

test("active category returns eligible dishes using the existing seller filters", async () => {
  const database = makeDatabase({
    category: { id: "category-1" },
    dishes: [
      {
        id: "dish-1",
        name: "Idli",
        price: "25.00",
        story: {
          whoTaught: "Grandmother",
          occasion: "",
          culturalSignificance: "Family recipe",
          storyText: "A public story",
          visibility: "PUBLIC",
          privateField: "not exposed",
        },
      },
    ],
  });

  const dishes = await getPublicDishesForCategory(database, "category-1");

  assert.equal(database.dishFindManyCalls, 1);
  const where = database.dishQuery.where;
  assert.equal(where.categoryId, "category-1");
  assert.equal(where.status, "PUBLISHED");
  assert.equal(where.isAvailable, true);
  assert.deepEqual(where.availableQuantity, { gt: 0 });
  assert.equal(where.cook.is.verificationStatus, "APPROVED");
  assert.equal(where.cook.is.fssaiStatus, "APPROVED");
  assert.equal(where.cook.is.isApprovedToSell, true);
  assert.equal(where.cook.is.isOpen, true);
  assert.deepEqual(where.cook.is.id, { in: ["cook-1"] });
  assert.ok(where.cook.is.fssaiExpiryDate.gt instanceof Date);
  assert.equal(database.textEligibilityQueries.length, 1);
  assert.match(database.textEligibilityQueries[0].sql, /char_length\(btrim\(profile\."bio", trim_chars\.chars\)\)/);
  assert.equal(database.textEligibilityQueries[0].values.length, 8);
  assert.equal(dishes[0].story.visibility, "PUBLIC");
  assert.equal("privateField" in dishes[0].story, false);
});

test("inactive category returns an empty list without querying its dishes", async () => {
  const database = makeDatabase({ category: null });

  assert.deepEqual(await getPublicDishesForCategory(database, "category-1"), []);
  assert.equal(database.dishFindManyCalls, 0);
});

test("nonexistent category follows the same empty-list behavior", async () => {
  const database = makeDatabase({ category: null });

  assert.deepEqual(await getPublicDishesForCategory(database, "category-1"), []);
  assert.equal(database.dishFindManyCalls, 0);
});
