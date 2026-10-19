import prisma from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { getDishCustomerVisibility } from "../../utils/marketplaceSecurity.js";
import { findCookProfilesWithValidRequiredText } from "../../utils/cookReadiness.js";
import { currencyNumber, rupeesFromPaise, toPaise } from "../../utils/money.js";
import { MAX_CART_ITEM_QUANTITY } from "./cart.validation.js";

const cartDishInclude = {
  category: { select: { id: true, name: true, isActive: true } },
  cook: {
    include: {
      user: { select: { role: true, status: true } },
    },
  },
};

export const getCartDishEligibility = (dish, eligibleCookIds, now = new Date()) => {
  if (!dish) return { isAvailable: false, reasons: ["This dish was removed."] };

  const visibility = getDishCustomerVisibility(dish, dish.cook, dish.cook?.user?.status, now);
  const reasons = [...visibility.reasons];
  if (!eligibleCookIds.has(dish.cookId)) reasons.push("Kitchen profile details are incomplete.");
  if (dish.category && !dish.category.isActive) reasons.push("Dish category is inactive.");
  return { isAvailable: reasons.length === 0, reasons };
};

export const serializeCart = (cart, eligibleCookIds = new Set(), now = new Date()) => {
  let availableSubtotalPaise = 0n;
  const items = (cart?.items || []).map((item) => {
    const dish = item.dish;
    const eligibility = getCartDishEligibility(dish, eligibleCookIds, now);
    let unitPricePaise = null;
    try {
      if (dish) unitPricePaise = toPaise(dish.price);
    } catch {
      // Invalid persisted values are shown as unavailable and never totaled.
    }
    const unitPrice = unitPricePaise === null ? null : currencyNumber(rupeesFromPaise(unitPricePaise));
    const subtotalPaise = unitPricePaise === null ? 0n : unitPricePaise * BigInt(item.quantity);
    const subtotal = currencyNumber(rupeesFromPaise(subtotalPaise));
    const exceedsStock = dish && item.quantity > dish.availableQuantity;
    const reasons = exceedsStock
      ? [...eligibility.reasons, `Only ${dish.availableQuantity} currently available; reduce the quantity.`]
      : eligibility.reasons;
    if (dish && (unitPricePaise === null || unitPricePaise <= 0n)) reasons.push("This dish has an invalid price.");
    const isAvailable = eligibility.isAvailable && !exceedsStock && unitPricePaise !== null && unitPricePaise > 0n;
    if (isAvailable) availableSubtotalPaise += subtotalPaise;

    return {
      id: item.id,
      quantity: item.quantity,
      unitPrice,
      subtotal,
      isAvailable,
      unavailableReasons: isAvailable ? [] : reasons,
      dish: dish ? {
        id: dish.id,
        name: dish.name,
        description: dish.description,
        cuisine: dish.cuisine,
        price: unitPrice,
        image: dish.image,
        isVegetarian: dish.isVegetarian,
        availableQuantity: dish.availableQuantity,
        cook: {
          id: dish.cook.id,
          businessName: dish.cook.businessName,
          profileImage: dish.cook.profileImage,
        },
      } : null,
    };
  });

  const availableItems = items.filter((item) => item.isAvailable);
  return {
    id: cart?.id || null,
    items,
    totals: {
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      availableItemCount: availableItems.reduce((sum, item) => sum + item.quantity, 0),
      unavailableItemCount: items.length - availableItems.length,
      subtotal: currencyNumber(rupeesFromPaise(availableSubtotalPaise)),
    },
  };
};

const loadDish = async (database, dishId) => {
  const eligibleCookIds = await findCookProfilesWithValidRequiredText(database);
  const dish = await database.dish.findUnique({ where: { id: dishId }, include: cartDishInclude });
  if (!dish) throw new AppError("Dish not found.", HTTP_STATUS.NOT_FOUND);
  const eligibility = getCartDishEligibility(dish, new Set(eligibleCookIds));
  if (!eligibility.isAvailable) {
    throw new AppError("This dish is currently unavailable and cannot be added to the cart.", HTTP_STATUS.CONFLICT);
  }
  return dish;
};

const loadCart = async (database, customerId) => database.cart.findUnique({
  where: { customerId },
  include: {
    items: {
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { dish: { include: cartDishInclude } },
    },
  },
});

const readCart = async (database, customerId) => {
  const cart = await loadCart(database, customerId);
  if (!cart?.items.length) return serializeCart(cart || null);
  const eligibleIds = new Set(await findCookProfilesWithValidRequiredText(database));
  return serializeCart(cart, eligibleIds);
};

export const createCartService = (database) => ({
  async getCart(customerId) {
    return readCart(database, customerId);
  },

  async addItem(customerId, { dishId, quantity }) {
    const addQuantity = quantity ?? 1;
    if (!Number.isInteger(addQuantity) || addQuantity < 1 || addQuantity > MAX_CART_ITEM_QUANTITY) {
      throw new AppError(`Quantity must be a whole number from 1 to ${MAX_CART_ITEM_QUANTITY}.`, HTTP_STATUS.BAD_REQUEST);
    }

    return database.$transaction(async (tx) => {
      const dish = await loadDish(tx, dishId);
      const cart = await tx.cart.upsert({
        where: { customerId },
        create: { customerId },
        update: {},
        select: { id: true },
      });
      const existing = await tx.cartItem.findUnique({
        where: { cartId_dishId: { cartId: cart.id, dishId } },
        select: { quantity: true },
      });
      const newQuantity = (existing?.quantity || 0) + addQuantity;
      if (newQuantity > dish.availableQuantity) {
        throw new AppError(`Only ${dish.availableQuantity} of this dish are currently available.`, HTTP_STATUS.CONFLICT);
      }
      await tx.cartItem.upsert({
        where: { cartId_dishId: { cartId: cart.id, dishId } },
        create: { cartId: cart.id, dishId, quantity: addQuantity },
        update: { quantity: { increment: addQuantity } },
      });
      return readCart(tx, customerId);
    }, { isolationLevel: "Serializable" });
  },

  async updateItem(customerId, itemId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) {
      throw new AppError(`Quantity must be a whole number from 1 to ${MAX_CART_ITEM_QUANTITY}.`, HTTP_STATUS.BAD_REQUEST);
    }
    return database.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { customerId }, select: { id: true } });
      const item = cart && await tx.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
      if (!cart || !item) throw new AppError("Cart item not found.", HTTP_STATUS.NOT_FOUND);
      const dish = await loadDish(tx, item.dishId);
      if (quantity > dish.availableQuantity) {
        throw new AppError(`Only ${dish.availableQuantity} of this dish are currently available.`, HTTP_STATUS.CONFLICT);
      }
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
      return readCart(tx, customerId);
    }, { isolationLevel: "Serializable" });
  },

  async removeItem(customerId, itemId) {
    const cart = await database.cart.findUnique({ where: { customerId }, select: { id: true } });
    if (!cart) throw new AppError("Cart item not found.", HTTP_STATUS.NOT_FOUND);
    const deleted = await database.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    if (!deleted.count) throw new AppError("Cart item not found.", HTTP_STATUS.NOT_FOUND);
    return readCart(database, customerId);
  },
});

export const cartService = createCartService(prisma);
