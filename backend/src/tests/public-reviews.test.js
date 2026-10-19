import test from "node:test";
import assert from "node:assert/strict";
import { createReviewsService } from "../modules/reviews/reviews.service.js";
import publicReviewRouter from "../modules/reviews/public-reviews.routes.js";

const makeMockDb = ({
  reviews = [],
  dishes = [],
  cooks = [],
} = {}) => {
  const transaction = {
    review: {
      findMany: async ({ where, skip = 0, take = 20, orderBy }) => {
        return reviews
          .filter((r) => {
            if (where.status && r.status !== where.status) return false;
            if (where.dishId && r.dishId !== where.dishId) return false;
            if (where.cookId && r.cookId !== where.cookId) return false;
            return true;
          })
          .slice(skip, skip + take);
      },
      count: async ({ where }) => {
        return reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.dishId && r.dishId !== where.dishId) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          return true;
        }).length;
      },
      aggregate: async ({ where, _avg, _count }) => {
        const matching = reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.dishId && r.dishId !== where.dishId) return false;
          if (where.cookId && r.cookId !== where.cookId) return false;
          return true;
        });
        const count = matching.length;
        const totalRating = matching.reduce((sum, r) => sum + r.rating, 0);
        return {
          _avg: { rating: count > 0 ? totalRating / count : null },
          _count: { _all: count },
        };
      },
      groupBy: async ({ by, where, _count }) => {
        const matching = reviews.filter((r) => {
          if (where.status && r.status !== where.status) return false;
          if (where.dishId?.in && !where.dishId.in.includes(r.dishId)) return false;
          return true;
        });
        const map = new Map();
        for (const r of matching) {
          const key = `${r.dishId}:${r.rating}`;
          map.set(key, (map.get(key) || 0) + 1);
        }
        return Array.from(map.entries()).map(([key, count]) => {
          const [dishId, rating] = key.split(":");
          return { dishId, rating: Number(rating), _count: { _all: count } };
        });
      },
    },
    dish: {
      findFirst: async ({ where }) => {
        return dishes.find((d) => d.id === where.id && (!where.status || d.status === where.status)) || null;
      },
    },
    cookProfile: {
      findFirst: async ({ where }) => {
        return cooks.find((c) => c.id === where.id && (!where.verificationStatus || c.verificationStatus === where.verificationStatus)) || null;
      },
    },
  };

  return {
    ...transaction,
    $transaction: async (callback) => callback(transaction),
  };
};

test("publicDishReviews returns published reviews for the dish with masked customer names and verified badges", async () => {
  const dish = { id: "dish-1", name: "Butter Chicken", status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } };
  const reviews = [
    {
      id: "rev-1",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 5,
      comment: "Delicious authentic taste!",
      status: "PUBLISHED",
      createdAt: new Date("2026-10-15T10:00:00Z"),
      customer: { name: "Ananya Sharma", email: "ananya@private.com", phone: "+919876543210" },
      dish: { name: "Butter Chicken" },
      cook: { businessName: "Sharma Kitchen" },
      cookReply: "Thank you Ananya!",
      cookRepliedAt: new Date("2026-10-15T12:00:00Z"),
    },
  ];
  const db = makeMockDb({ dishes: [dish], reviews });
  const service = createReviewsService(db);

  const result = await service.publicDishReviews("dish-1", { page: 1, limit: 10 });
  assert.equal(result.items.length, 1);
  const item = result.items[0];

  // Requirements check:
  assert.equal(item.rating, 5);
  assert.equal(item.comment, "Delicious authentic taste!");
  assert.equal(item.cookReply, "Thank you Ananya!");
  assert.ok(item.cookRepliedAt);
  assert.equal(item.verified, "VERIFIED_ORDER");
  assert.equal(item.customerName, "Ananya S."); // Masked

  // Privacy safe: no private fields exposed
  assert.equal(item.email, undefined);
  assert.equal(item.phone, undefined);
  assert.equal(item.customerId, undefined);
  assert.equal(item.address, undefined);

  // Rating summary
  assert.equal(result.ratingSummary.count, 1);
  assert.equal(result.ratingSummary.average, 5);
});

test("hidden and removed reviews are strictly excluded from public lists and averages", async () => {
  const dish = { id: "dish-1", name: "Paneer Tikka", status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } };
  const reviews = [
    {
      id: "rev-published-1",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 5,
      comment: "Great food",
      status: "PUBLISHED",
      createdAt: new Date("2026-10-15T10:00:00Z"),
      customer: { name: "Rohan Verma" },
      dish: { name: "Paneer Tikka" },
      cook: { businessName: "Verma Kitchen" },
    },
    {
      id: "rev-published-2",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 3,
      comment: "Average",
      status: "PUBLISHED",
      createdAt: new Date("2026-10-15T11:00:00Z"),
      customer: { name: "Deepak Mehta" },
      dish: { name: "Paneer Tikka" },
      cook: { businessName: "Verma Kitchen" },
    },
    {
      id: "rev-hidden",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 1,
      comment: "Hidden spam content",
      status: "HIDDEN",
      createdAt: new Date("2026-10-15T12:00:00Z"),
      customer: { name: "Spammer" },
    },
    {
      id: "rev-removed",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 1,
      comment: "Removed abusive content",
      status: "REMOVED",
      createdAt: new Date("2026-10-15T13:00:00Z"),
      customer: { name: "Abusive" },
    },
  ];

  const db = makeMockDb({ dishes: [dish], reviews });
  const service = createReviewsService(db);

  const result = await service.publicDishReviews("dish-1", { page: 1, limit: 10 });
  assert.equal(result.items.length, 2);
  const ids = result.items.map((i) => i.id);
  assert.ok(!ids.includes("rev-hidden"));
  assert.ok(!ids.includes("rev-removed"));

  // Average calculation: only published reviews (5 + 3) / 2 = 4.0
  // If hidden/removed were included, it would be (5 + 3 + 1 + 1) / 4 = 2.5
  assert.equal(result.ratingSummary.count, 2);
  assert.equal(result.ratingSummary.average, 4.0);
});

test("publicCookProfile returns verified cook details, published dishes with price formatting, and review aggregates", async () => {
  const cook = {
    id: "cook-1",
    businessName: "Grandma's Kitchen",
    profileImage: "https://cloudinary.com/img.jpg",
    bio: "Cooking authentic home recipes for over 30 years.",
    specialization: "North Indian & Mughlai",
    experienceYears: "30",
    cuisines: ["North Indian", "Mughlai"],
    city: "Delhi",
    locality: "Lajpat Nagar",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    verificationStatus: "APPROVED",
    user: { status: "ACTIVE" },
    dishes: [
      {
        id: "dish-1",
        name: "Dal Makhani",
        description: "Slow-cooked black lentils",
        cuisine: "North Indian",
        price: "220.00",
        image: "https://cloudinary.com/dal.jpg",
        isVegetarian: true,
        dietaryTags: ["Vegetarian", "Gluten-Free"],
        prepTimeMinutes: 45,
        category: { id: "cat-1", name: "Curries", slug: "curries" },
        status: "PUBLISHED",
      },
    ],
  };

  const reviews = [
    {
      id: "rev-1",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 5,
      status: "PUBLISHED",
      customer: { name: "Priya S." },
    },
    {
      id: "rev-2",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 4,
      status: "PUBLISHED",
      customer: { name: "Kunal M." },
    },
    {
      id: "rev-3",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 5,
      status: "PUBLISHED",
      customer: { name: "Tarun K." },
    },
    {
      id: "rev-hidden",
      reviewType: "FOOD",
      dishId: "dish-1",
      cookId: "cook-1",
      rating: 1,
      status: "HIDDEN",
      customer: { name: "Hidden User" },
    },
  ];

  const db = makeMockDb({ cooks: [cook], reviews });
  const service = createReviewsService(db);

  const profile = await service.publicCookProfile("cook-1");
  assert.equal(profile.id, "cook-1");
  assert.equal(profile.businessName, "Grandma's Kitchen");
  assert.equal(profile.bio, "Cooking authentic home recipes for over 30 years.");
  assert.equal(profile.dishes.length, 1);
  assert.equal(profile.dishes[0].price, 220); // Normalized currency number

  // 3 published reviews: (5 + 4 + 5) / 3 = 4.666...
  assert.equal(profile.ratingSummary.count, 3);
  assert.ok(Math.abs(profile.ratingSummary.average - 4.6666) < 0.01);

  // Dish meets >= 3 threshold so has ratingSummary
  assert.ok(profile.dishes[0].ratingSummary);
  assert.equal(profile.dishes[0].ratingSummary.count, 3);
});

test("privacy-safe masking formats single names, multi-word names, and handles empty names gracefully", async () => {
  const dish = { id: "dish-1", name: "Samosa", status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } };
  const reviews = [
    { id: "r1", reviewType: "FOOD", dishId: "dish-1", cookId: "cook-1", rating: 5, status: "PUBLISHED", customer: { name: "Rahul" } },
    { id: "r2", reviewType: "FOOD", dishId: "dish-1", cookId: "cook-1", rating: 5, status: "PUBLISHED", customer: { name: "Aditi Ramesh Iyer" } },
    { id: "r3", reviewType: "FOOD", dishId: "dish-1", cookId: "cook-1", rating: 5, status: "PUBLISHED", customer: { name: "" } },
    { id: "r4", reviewType: "FOOD", dishId: "dish-1", cookId: "cook-1", rating: 5, status: "PUBLISHED", customer: null },
  ];

  const db = makeMockDb({ dishes: [dish], reviews });
  const service = createReviewsService(db);
  const result = await service.publicDishReviews("dish-1");

  assert.equal(result.items.find((i) => i.id === "r1").customerName, "Rahul");
  assert.equal(result.items.find((i) => i.id === "r2").customerName, "Aditi I.");
  assert.equal(result.items.find((i) => i.id === "r3").customerName, "TasteBridge customer");
  assert.equal(result.items.find((i) => i.id === "r4").customerName, "TasteBridge customer");
});

test("dish and cook review isolation ensures reviews only appear for their respective targets", async () => {
  const dish1 = { id: "dish-1", status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } };
  const dish2 = { id: "dish-2", status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } };
  const cook1 = { id: "cook-1", verificationStatus: "APPROVED", user: { status: "ACTIVE" }, dishes: [] };
  const cook2 = { id: "cook-2", verificationStatus: "APPROVED", user: { status: "ACTIVE" }, dishes: [] };

  const reviews = [
    { id: "r1", reviewType: "FOOD", dishId: "dish-1", cookId: "cook-1", rating: 5, status: "PUBLISHED", customer: { name: "User 1" } },
    { id: "r2", reviewType: "FOOD", dishId: "dish-2", cookId: "cook-2", rating: 4, status: "PUBLISHED", customer: { name: "User 2" } },
  ];

  const db = makeMockDb({ dishes: [dish1, dish2], cooks: [cook1, cook2], reviews });
  const service = createReviewsService(db);

  const d1Reviews = await service.publicDishReviews("dish-1");
  assert.equal(d1Reviews.items.length, 1);
  assert.equal(d1Reviews.items[0].id, "r1");

  const d2Reviews = await service.publicDishReviews("dish-2");
  assert.equal(d2Reviews.items.length, 1);
  assert.equal(d2Reviews.items[0].id, "r2");

  const c1Reviews = await service.publicCookReviews("cook-1");
  assert.equal(c1Reviews.items.length, 1);
  assert.equal(c1Reviews.items[0].id, "r1");

  const c2Reviews = await service.publicCookReviews("cook-2");
  assert.equal(c2Reviews.items.length, 1);
  assert.equal(c2Reviews.items[0].id, "r2");
});

test("unapproved cook or unverified dish rejects with 404 not found", async () => {
  const pendingCook = { id: "cook-pending", verificationStatus: "PENDING", user: { status: "ACTIVE" }, dishes: [] };
  const unverifiedDish = { id: "dish-unverified", status: "DRAFT", cook: { verificationStatus: "PENDING", user: { status: "ACTIVE" } } };

  const db = makeMockDb({ dishes: [unverifiedDish], cooks: [pendingCook] });
  const service = createReviewsService(db);

  await assert.rejects(service.publicDishReviews("dish-unverified"), { statusCode: 404 });
  await assert.rejects(service.publicCookReviews("cook-pending"), { statusCode: 404 });
  await assert.rejects(service.publicCookProfile("cook-pending"), { statusCode: 404 });
});

test("authoritative verified indicator distinguishes between order and event reviews", async () => {
  const cook = { id: "cook-1", verificationStatus: "APPROVED", user: { status: "ACTIVE" } };
  const reviews = [
    {
      id: "food-rev",
      reviewType: "FOOD",
      cookId: "cook-1",
      dishId: "dish-1",
      rating: 5,
      status: "PUBLISHED",
      customer: { name: "Ravi Kumar" },
      dish: { name: "Biryani" },
      cook: { businessName: "Biryani House" },
    },
    {
      id: "event-rev",
      reviewType: "EXPERIENCE",
      cookId: "cook-1",
      rating: 5,
      status: "PUBLISHED",
      customer: { name: "Anita Roy" },
      subjectNameSnapshot: "Mastering Biryani Workshop",
      cook: { businessName: "Biryani House" },
    },
  ];

  const db = makeMockDb({ cooks: [cook], reviews });
  const service = createReviewsService(db);

  const result = await service.publicCookReviews("cook-1");
  const foodItem = result.items.find((i) => i.id === "food-rev");
  const eventItem = result.items.find((i) => i.id === "event-rev");

  assert.equal(foodItem.verified, "VERIFIED_ORDER");
  assert.equal(eventItem.verified, "ATTENDED_EVENT");
  assert.equal(eventItem.subjectName, "Mastering Biryani Workshop");
});

test("public review router passes through reserved cook routes via next('router')", async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use("/api/v1", publicReviewRouter);
  app.use("/api/v1/cooks", (req, res) => res.json({ cookRouteReached: req.path }));

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const reserved = [
      "application", "kitchen", "dashboard", "earnings", "orders",
      "dishes", "notifications", "documents", "reviews", "experience-bookings", "experiences",
      "welcome", "fssai-document"
    ];
    for (const keyword of reserved) {
      const res = await fetch(`${baseUrl}/api/v1/cooks/${keyword}`);
      const body = await res.json();
      assert.equal(body.cookRouteReached, `/${keyword}`, `Expected ${keyword} to reach cookRoute`);
    }
  } finally {
    server.close();
  }
});
