import { publicDishesWhere, publicDishStory } from "../../utils/marketplaceSecurity.js";
import { findCookProfilesWithValidRequiredText } from "../../utils/cookReadiness.js";
import { currencyNumber } from "../../utils/money.js";

const publicDishSelect = {
  id: true,
  name: true,
  description: true,
  cuisine: true,
  price: true,
  image: true,
  isVegetarian: true,
  ingredients: true,
  prepTimeMinutes: true,
  dietaryTags: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  cook: {
    select: {
      id: true,
      businessName: true,
      profileImage: true,
      specialization: true,
      bio: true,
      city: true,
      locality: true,
    },
  },
  story: {
    select: {
      whoTaught: true,
      occasion: true,
      culturalSignificance: true,
      storyText: true,
      visibility: true,
    },
  },
  _count: { select: { reviews: { where: { status: "PUBLISHED" } } } },
};

const sortOrders = {
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  price_asc: [{ price: "asc" }, { id: "asc" }],
  price_desc: [{ price: "desc" }, { id: "asc" }],
};

const serializePublicDish = (dish) => ({
  id: dish.id,
  name: dish.name,
  description: dish.description,
  cuisine: dish.cuisine,
  price: currencyNumber(dish.price),
  image: dish.image,
  isVegetarian: dish.isVegetarian,
  ingredients: dish.ingredients,
  prepTimeMinutes: dish.prepTimeMinutes,
  dietaryTags: dish.dietaryTags,
  createdAt: dish.createdAt,
  category: dish.category
    ? { id: dish.category.id, name: dish.category.name, slug: dish.category.slug }
    : null,
  cook: dish.cook
    ? {
        id: dish.cook.id,
        businessName: dish.cook.businessName,
        profileImage: dish.cook.profileImage,
        specialization: dish.cook.specialization,
        bio: dish.cook.bio,
        city: dish.cook.city,
        locality: dish.cook.locality,
      }
    : null,
  story: publicDishStory(dish.story),
  ratingSummary: dish.ratingSummary || (dish._count?.reviews >= 3 ? { count: dish._count.reviews } : null),
});

const serializePublicDishes = (dishes) => dishes.map(serializePublicDish);

const withReviewSummaries = async (database, dishes) => {
  if (!dishes.length || typeof database.review?.groupBy !== "function") return dishes;
  const groups = await database.review.groupBy({
    by: ["dishId", "rating"],
    where: { dishId: { in: dishes.map((dish) => dish.id) }, status: "PUBLISHED" },
    _count: { _all: true },
  });
  const summaries = new Map();
  for (const group of groups) {
    const summary = summaries.get(group.dishId) || { count: 0, weighted: 0 };
    summary.count += group._count._all;
    summary.weighted += group.rating * group._count._all;
    summaries.set(group.dishId, summary);
  }
  return dishes.map((dish) => {
    const summary = summaries.get(dish.id);
    return summary?.count >= 3 ? { ...dish, ratingSummary: { count: summary.count, average: summary.weighted / summary.count } } : dish;
  });
};

const categoryIsActive = async (database, categoryId) =>
  database.foodCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });

export const getPublicDishesForCategory = async (database, categoryId) => {
  const category = await categoryIsActive(database, categoryId);

  // Keep unknown and inactive categories indistinguishable to public callers.
  if (!category) return [];

  const eligibleProfileIds = await findCookProfilesWithValidRequiredText(database);
  const dishes = await database.dish.findMany({
    where: publicDishesWhere(category.id, new Date(), eligibleProfileIds),
    orderBy: { createdAt: "desc" },
    select: publicDishSelect,
  });

  return serializePublicDishes(await withReviewSummaries(database, dishes));
};

export const getPublicDishes = async (database, { search, categoryId, sort, page, limit }) => {
  if (categoryId && !(await categoryIsActive(database, categoryId))) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const eligibleProfileIds = await findCookProfilesWithValidRequiredText(database);
  const where = {
    ...publicDishesWhere(categoryId, new Date(), eligibleProfileIds),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { cuisine: { contains: search, mode: "insensitive" } },
            { cook: { is: { businessName: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
  const [total, dishes] = await Promise.all([
    database.dish.count({ where }),
    database.dish.findMany({
      where,
      orderBy: sortOrders[sort],
      skip: (page - 1) * limit,
      take: limit,
      select: publicDishSelect,
    }),
  ]);

  return {
    items: serializePublicDishes(await withReviewSummaries(database, dishes)),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
};

export const getPublicDishById = async (database, dishId) => {
  const eligibleProfileIds = await findCookProfilesWithValidRequiredText(database);
  const dish = await database.dish.findFirst({
    where: { id: dishId, ...publicDishesWhere(undefined, new Date(), eligibleProfileIds) },
    select: publicDishSelect,
  });
  if (!dish) return null;
  const [withSummary] = await withReviewSummaries(database, [dish]);
  return serializePublicDish(withSummary);
};
