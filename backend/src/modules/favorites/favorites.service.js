import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { publicDishesWhere } from "../../utils/marketplaceSecurity.js";
import { findCookProfilesWithValidRequiredText, cookSellingReadinessWhere } from "../../utils/cookReadiness.js";
import { currencyNumber } from "../../utils/money.js";

const favoriteDishSelect = {
  id: true,
  name: true,
  description: true,
  cuisine: true,
  price: true,
  image: true,
  isVegetarian: true,
  isAvailable: true,
  availableQuantity: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  cook: { select: { id: true, businessName: true, profileImage: true, city: true, locality: true } },
};

const serializeDish = (dish) => ({
  ...dish,
  price: currencyNumber(dish.price),
  isAvailable: dish.isAvailable && dish.availableQuantity > 0,
});

const visibleFavoriteDishWhere = (now, eligibleProfileIds) => ({
  status: "PUBLISHED",
  cook: {
    is: {
      ...cookSellingReadinessWhere(now, eligibleProfileIds),
      isOpen: true,
    },
  },
});

export const createFavoritesService = (database) => ({
  async list(customerId) {
    const now = new Date();
    const eligibleProfileIds = await findCookProfilesWithValidRequiredText(database);
    const records = await database.customerFavorite.findMany({
      where: { customerId, dish: { is: visibleFavoriteDishWhere(now, eligibleProfileIds) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, dish: { select: favoriteDishSelect } },
    });
    return { items: records.map((favorite) => ({ ...serializeDish(favorite.dish), favoriteId: favorite.id, favoritedAt: favorite.createdAt })) };
  },

  async add(customerId, dishId) {
    const now = new Date();
    const eligibleProfileIds = await findCookProfilesWithValidRequiredText(database);
    const dish = await database.dish.findFirst({
      where: { id: dishId, ...publicDishesWhere(undefined, now, eligibleProfileIds) },
      select: { id: true },
    });
    if (!dish) throw new AppError("Dish not found or currently unavailable.", HTTP_STATUS.NOT_FOUND);

    const favorite = await database.customerFavorite.upsert({
      where: { customerId_dishId: { customerId, dishId } },
      create: { customerId, dishId },
      update: {},
      select: { id: true, createdAt: true },
    });
    return { favoriteId: favorite.id, dishId, favoritedAt: favorite.createdAt };
  },

  async remove(customerId, dishId) {
    await database.customerFavorite.deleteMany({ where: { customerId, dishId } });
    return { dishId, isFavorite: false };
  },
});
