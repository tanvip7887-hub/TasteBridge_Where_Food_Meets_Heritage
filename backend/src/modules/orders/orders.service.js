import { randomBytes } from "node:crypto";
import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { getCartDishEligibility } from "../cart/cart.service.js";
import { findCookProfilesWithValidRequiredText } from "../../utils/cookReadiness.js";
import {
  currencyNumber,
  divideRoundHalfUp,
  rateToTenThousandths,
  rupeesFromPaise,
  sumPaise,
  toPaise,
} from "../../utils/money.js";
import { env } from "../../config/env.js";
import { recordOrderStatus } from "./order-status-history.js";
import { notifyCheckoutPlaced, notifyCookNewOrder, notifyOrderStatusChanged } from "../notifications/order-lifecycle.producers.js";

const moneyFields = ["subtotal", "deliveryFee", "platformFee", "totalAmount"];
const orderMoneyFields = [...moneyFields, "cookEarning", "deliveryEarning"];
const serializeOrderMoney = (order) => ({
  ...order,
  ...Object.fromEntries(orderMoneyFields.filter((field) => order[field] !== undefined).map((field) => [field, currencyNumber(order[field])])),
  items: order.items?.map((item) => ({
    ...item,
    ...(item.unitPrice !== undefined && { unitPrice: currencyNumber(item.unitPrice) }),
    ...(item.totalPrice !== undefined && { totalPrice: currencyNumber(item.totalPrice) }),
  })),
});

const addressFields = [
  "label", "recipientName", "phone", "addressLine1", "addressLine2",
  "locality", "city", "state", "pincode", "landmark",
];

export const addressSnapshot = (address) => Object.fromEntries(
  addressFields.map((field) => [field, address[field] ?? null])
);

export const addressIsComplete = (address) => Boolean(
  address?.recipientName?.trim() && address?.phone?.trim() && address?.addressLine1?.trim()
  && address?.locality?.trim() && address?.city?.trim() && address?.state?.trim()
  && address?.pincode?.trim()
);

const cartInclude = {
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      dish: {
        include: {
          category: { select: { id: true, name: true, isActive: true } },
          cook: { include: { user: { select: { role: true, status: true } } } },
        },
      },
    },
  },
};

const checkoutInclude = {
  orders: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
      cook: { select: { id: true, businessName: true } },
      deliveryAgent: { select: { id: true, user: { select: { name: true, phone: true } } } },
    },
  },
};

const legacyOrderInclude = {
  items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
  cook: { select: { id: true, businessName: true } },
  deliveryAgent: { select: { id: true, user: { select: { name: true, phone: true } } } },
  address: true,
};

const cancellationWindowMs = (minutes) => (Number.isFinite(Number(minutes)) ? Math.max(0, Number(minutes)) : 5) * 60 * 1000;

const withCancellation = (checkout, now, windowMinutes) => {
  const cancelUntil = new Date(new Date(checkout.createdAt).getTime() + cancellationWindowMs(windowMinutes));
  const statuses = checkout.orders?.map((order) => order.status) || [];
  const allCancelled = statuses.length > 0 && statuses.every((status) => status === "CANCELLED");
  const allPending = statuses.length > 0 && statuses.every((status) => status === "PENDING");
  const isPaidCheckout = checkout.paymentMethod === "ONLINE"
    || checkout.orders?.some((order) => order.paymentStatus === "PAID");
  return {
    ...checkout,
    cancelUntil,
    canCancel: !allCancelled && !isPaidCheckout && allPending && now.getTime() < cancelUntil.getTime(),
    cancellationReason: allCancelled ? "This checkout has been cancelled."
      : isPaidCheckout ? "Paid mock checkouts cannot be cancelled because refunds are not supported."
      : !allPending ? "Cancellation is unavailable after a kitchen order is accepted."
        : now.getTime() >= cancelUntil.getTime() ? `The ${windowMinutes}-minute cancellation window has ended.`
          : null,
  };
};

const toCustomerCheckout = (checkout, now = new Date(), windowMinutes = env.ORDER_CANCELLATION_WINDOW_MINUTES) => {
  if (!checkout) return null;
  const { customerId, idempotencyKey, addressId, ...safeCheckout } = checkout;
  const serialized = {
    ...safeCheckout,
    ...Object.fromEntries(moneyFields.filter((field) => safeCheckout[field] !== undefined).map((field) => [field, currencyNumber(safeCheckout[field])])),
    orders: safeCheckout.orders?.map(serializeOrderMoney),
  };
  return withCancellation(serialized, now, windowMinutes);
};

const toCustomerHistoryCheckout = (checkout, now, windowMinutes) => {
  const customerCheckout = toCustomerCheckout(checkout, now, windowMinutes);
  return {
    ...customerCheckout,
    orders: customerCheckout.orders?.filter((order) => !order.hiddenFromCustomerAt),
  };
};

const toLegacyCheckout = (order) => ({
  id: order.id,
  createdAt: order.createdAt,
  subtotal: currencyNumber(order.subtotal),
  deliveryFee: currencyNumber(order.deliveryFee),
  platformFee: currencyNumber(order.platformFee),
  totalAmount: currencyNumber(order.totalAmount),
  addressSnapshot: order.address ? addressSnapshot(order.address) : null,
  paymentMethod: null,
  orders: [{
    id: order.id,
    orderNumber: order.orderNumber,
    cookId: order.cookId,
    cookName: order.cookName || order.cook?.businessName || "Home kitchen",
    cook: order.cook,
    deliveryAgent: order.deliveryAgent,
    status: order.status,
    paymentStatus: order.paymentStatus,
    ...serializeOrderMoney(order),
  }],
});

const getSettings = async (database) => {
  const settings = await database.platformSettings.findUnique({ where: { id: "default" } });
  return {
    deliveryFeeBase: settings?.deliveryFeeBase ?? "30.00",
    platformFeePercent: settings?.platformFeePercent ?? "10.0000",
  };
};

export const getFees = (groups, settings) => {
  const rateScaled = rateToTenThousandths(settings.platformFeePercent);
  const deliveryFeePaise = toPaise(settings.deliveryFeeBase);
  const splits = [...groups.values()].map((group) => {
    const subtotalPaise = group.items.reduce((sum, item) => sum + item.lineTotalPaise, 0n);
    const platformFeePaise = divideRoundHalfUp(subtotalPaise * rateScaled, 1_000_000n);
    const totalAmountPaise = subtotalPaise + deliveryFeePaise + platformFeePaise;
    return {
      ...group,
      subtotalPaise,
      deliveryFeePaise,
      platformFeePaise,
      totalAmountPaise,
      cookEarningPaise: subtotalPaise - platformFeePaise,
      deliveryEarningPaise: deliveryFeePaise,
      subtotal: rupeesFromPaise(subtotalPaise),
      deliveryFee: rupeesFromPaise(deliveryFeePaise),
      platformFee: rupeesFromPaise(platformFeePaise),
      totalAmount: rupeesFromPaise(totalAmountPaise),
      cookEarning: rupeesFromPaise(subtotalPaise - platformFeePaise),
      deliveryEarning: rupeesFromPaise(deliveryFeePaise),
    };
  });
  const subtotalPaise = sumPaise(splits.map((split) => split.subtotal));
  const totalDeliveryFeePaise = sumPaise(splits.map((split) => split.deliveryFee));
  const totalPlatformFeePaise = sumPaise(splits.map((split) => split.platformFee));
  const totalAmountPaise = sumPaise(splits.map((split) => split.totalAmount));
  return {
    splits,
    subtotal: rupeesFromPaise(subtotalPaise),
    deliveryFee: rupeesFromPaise(totalDeliveryFeePaise),
    platformFee: rupeesFromPaise(totalPlatformFeePaise),
    totalAmount: rupeesFromPaise(totalAmountPaise),
  };
};

const reviewCart = (cart, eligibleCookIds, settings, now = new Date()) => {
  const groups = new Map();
  const issues = [];
  const items = (cart?.items || []).map((item) => {
    const dish = item.dish;
    const eligibility = getCartDishEligibility(dish, eligibleCookIds, now);
    const reasons = [...eligibility.reasons];
    if (!Number.isInteger(item.quantity) || item.quantity < 1) reasons.push("This cart quantity is invalid.");
    if (dish && item.quantity > dish.availableQuantity) {
      reasons.push(`Only ${dish.availableQuantity} currently available; reduce the quantity.`);
    }
    let unitPricePaise = 0n;
    try {
      unitPricePaise = toPaise(dish?.price);
    } catch {
      // Invalid persisted values fail closed below.
    }
    if (dish && unitPricePaise <= 0n) {
      reasons.push("This dish has an invalid price and cannot be ordered.");
    }
    const lineTotalPaise = unitPricePaise * BigInt(Number.isInteger(item.quantity) ? item.quantity : 0);
    const available = reasons.length === 0;
    if (!available) issues.push({ itemId: item.id, dishName: dish?.name || "Removed dish", reasons });
    if (available) {
      if (!groups.has(dish.cookId)) groups.set(dish.cookId, { cookId: dish.cookId, cookName: dish.cook.businessName, items: [] });
      groups.get(dish.cookId).items.push({ item, dish, unitPricePaise, lineTotalPaise });
    }
    return {
      id: item.id,
      quantity: item.quantity,
      isAvailable: available,
      unavailableReasons: reasons,
      unitPrice: dish && unitPricePaise > 0n ? currencyNumber(rupeesFromPaise(unitPricePaise)) : null,
      subtotal: currencyNumber(rupeesFromPaise(lineTotalPaise)),
      dish: dish ? {
        id: dish.id,
        name: dish.name,
        image: dish.image,
        cuisine: dish.cuisine,
        availableQuantity: dish.availableQuantity,
        cook: { id: dish.cook.id, businessName: dish.cook.businessName },
      } : null,
    };
  });
  const fees = getFees(groups, settings);
  return {
    items,
    issues,
    fees,
    canPlaceOrder: items.length > 0 && issues.length === 0,
      totals: {
        itemCount: items.reduce((sum, item) => sum + (Number.isInteger(item.quantity) ? item.quantity : 0), 0),
        subtotal: currencyNumber(fees.subtotal),
        deliveryFee: currencyNumber(fees.deliveryFee),
        platformFee: currencyNumber(fees.platformFee),
        totalAmount: currencyNumber(fees.totalAmount),
      },
  };
};

export const loadCheckoutReviewData = async (database, customerId, selectedAddressId = null) => {
  const cart = await database.cart.findUnique({ where: { customerId }, include: cartInclude });
  const addresses = await database.address.findMany({ where: { userId: customerId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
  const settings = await getSettings(database);
  const eligibleIds = await findCookProfilesWithValidRequiredText(database);
  const address = selectedAddressId
    ? addresses.find((candidate) => candidate.id === selectedAddressId) || null
    : addresses.find((candidate) => candidate.isDefault) || addresses[0] || null;
  const review = reviewCart(cart, new Set(eligibleIds), settings);
  if (!cart?.items?.length) review.issues.unshift({ itemId: null, dishName: null, reasons: ["Your cart is empty."] });
  if (!address) review.issues.push({ itemId: null, dishName: null, reasons: ["Choose a saved delivery address before placing your order."] });
  else if (!addressIsComplete(address)) review.issues.push({ itemId: null, dishName: null, reasons: ["The selected address is incomplete. Update it before placing your order."] });
  review.canPlaceOrder = Boolean(cart?.items?.length && address && addressIsComplete(address) && review.issues.length === 0);
  return { cart, addresses, address, settings, eligibleIds: new Set(eligibleIds), review };
};

const loadCheckout = (database, where) => database.checkout.findFirst({ where, include: checkoutInclude });

export const createOrdersService = (database, options = {}) => {
  const windowMinutes = options.cancellationWindowMinutes ?? env.ORDER_CANCELLATION_WINDOW_MINUTES;
  const now = options.now || (() => new Date());
  return ({
  async getCheckoutSummary(customerId, selectedAddressId = null) {
    const { addresses, address, review } = await loadCheckoutReviewData(database, customerId, selectedAddressId);
    return {
      items: review.items,
      addresses,
      selectedAddressId: address?.id || null,
      addressSnapshot: address ? addressSnapshot(address) : null,
      totals: review.totals,
      orderSplits: review.fees.splits.map(({ cookId, cookName, subtotal, deliveryFee, platformFee, totalAmount }) => ({
        cookId, cookName,
        subtotal: currencyNumber(subtotal),
        deliveryFee: currencyNumber(deliveryFee),
        platformFee: currencyNumber(platformFee),
        totalAmount: currencyNumber(totalAmount),
      })),
      canPlaceOrder: review.canPlaceOrder,
      issues: review.issues,
    };
  },

  async placeOrder(customerId, { addressId, idempotencyKey, paymentMethod }) {
    if (paymentMethod !== "COD") throw new AppError("Select a supported payment method before placing your order.", HTTP_STATUS.BAD_REQUEST);
    const existing = await loadCheckout(database, { customerId, idempotencyKey });
    if (existing) return toCustomerCheckout(existing, now(), windowMinutes);

    try {
      const checkout = await database.$transaction(async (tx) => {
        const alreadyPlaced = await loadCheckout(tx, { customerId, idempotencyKey });
        if (alreadyPlaced) return alreadyPlaced;

        const { cart, address, settings, review } = await loadCheckoutReviewData(tx, customerId, addressId);
        if (!address) throw new AppError("The selected delivery address was not found.", HTTP_STATUS.NOT_FOUND);
        if (!addressIsComplete(address)) throw new AppError("The selected delivery address is incomplete. Update it before ordering.", HTTP_STATUS.BAD_REQUEST);
        if (!cart?.items?.length) throw new AppError("Your cart is empty.", HTTP_STATUS.BAD_REQUEST);
        if (!review.canPlaceOrder) {
          const details = review.issues.flatMap((issue) => issue.reasons).join(" ");
          throw new AppError(`Your cart needs attention before ordering. ${details}`, HTTP_STATUS.CONFLICT);
        }

        const cartGroups = new Map();
        for (const reviewed of review.items) {
          const cartItem = cart.items.find((item) => item.id === reviewed.id);
          const dish = cartItem.dish;
          if (!cartGroups.has(dish.cookId)) cartGroups.set(dish.cookId, { cookId: dish.cookId, cookName: dish.cook.businessName, items: [] });
          cartGroups.get(dish.cookId).items.push({ cartItem, dish, quantity: cartItem.quantity, unitPricePaise: toPaise(dish.price) });
        }
        const groupsForFees = new Map([...cartGroups.entries()].map(([id, group]) => [id, {
          ...group,
          items: group.items.map((item) => ({ lineTotalPaise: item.unitPricePaise * BigInt(item.quantity) })),
        }]));
        const fees = getFees(groupsForFees, settings);
        const addressData = addressSnapshot(address);
        const createdCheckout = await tx.checkout.create({
          data: {
            customerId,
            idempotencyKey,
            paymentMethod,
            addressId: address.id,
            addressSnapshot: addressData,
            subtotal: fees.subtotal,
            deliveryFee: fees.deliveryFee,
            platformFee: fees.platformFee,
            totalAmount: fees.totalAmount,
          },
        });

        for (const split of fees.splits) {
          const group = cartGroups.get(split.cookId);
          const orderItems = [];
          for (const line of group.items) {
            const reserved = await tx.dish.updateMany({
              where: {
                id: line.dish.id,
                status: "PUBLISHED",
                isAvailable: true,
                availableQuantity: { gte: line.quantity },
              },
              data: { availableQuantity: { decrement: line.quantity } },
            });
            if (reserved.count !== 1) {
              throw new AppError(`${line.dish.name} is no longer available in the requested quantity. Refresh your cart.`, HTTP_STATUS.CONFLICT);
            }
            const lineTotalPaise = line.unitPricePaise * BigInt(line.quantity);
            orderItems.push({
              dishId: line.dish.id,
              name: line.dish.name,
              dishImage: line.dish.image,
              quantity: line.quantity,
              unitPrice: rupeesFromPaise(line.unitPricePaise),
              totalPrice: rupeesFromPaise(lineTotalPaise),
            });
          }
          const createdOrder = await tx.order.create({
            data: {
              orderNumber: `TB-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`,
              customerId,
              cookId: split.cookId,
              cookName: split.cookName,
              checkoutId: createdCheckout.id,
              addressId: address.id,
              status: "PENDING",
              paymentStatus: "PENDING",
              subtotal: split.subtotal,
              deliveryFee: split.deliveryFee,
              platformFee: split.platformFee,
              totalAmount: split.totalAmount,
              cookEarning: split.cookEarning,
              deliveryEarning: split.deliveryEarning,
              items: { create: orderItems },
            },
          });
          await recordOrderStatus(tx, { orderId: createdOrder.id, toStatus: "PENDING" });
          await notifyCookNewOrder(tx, createdOrder);
        }

        await notifyCheckoutPlaced(tx, {
          checkoutId: createdCheckout.id,
          customerId,
          orderCount: fees.splits.length,
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return loadCheckout(tx, { id: createdCheckout.id, customerId });
      }, { isolationLevel: "Serializable" });
      return toCustomerCheckout(checkout, now(), windowMinutes);
    } catch (error) {
      if (error?.code === "P2002" || error?.code === "P2034") {
        const committed = await loadCheckout(database, { customerId, idempotencyKey });
        if (committed) return toCustomerCheckout(committed, now(), windowMinutes);
        if (error.code === "P2034") throw new AppError("The cart or stock changed during checkout. Refresh and try again.", HTTP_STATUS.CONFLICT);
      }
      throw error;
    }
  },

  async listOrders(customerId) {
    const [checkouts, legacyOrders] = await Promise.all([
      database.checkout.findMany({
        where: { customerId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: checkoutInclude,
      }),
      database.order.findMany({
        where: { customerId, checkoutId: null, hiddenFromCustomerAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: legacyOrderInclude,
      }),
    ]);
    return [
      ...checkouts.map((checkout) => toCustomerHistoryCheckout(checkout, now(), windowMinutes)).filter((checkout) => checkout.orders?.length),
      ...legacyOrders.map(toLegacyCheckout),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || a.id.localeCompare(b.id));
  },

  async getOrder(customerId, checkoutId) {
    const checkout = await loadCheckout(database, { id: checkoutId, customerId });
    if (checkout) return toCustomerCheckout(checkout, now(), windowMinutes);
    const legacyOrder = await database.order.findFirst({
      where: { id: checkoutId, customerId, checkoutId: null },
      include: legacyOrderInclude,
    });
    if (!legacyOrder) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    return toLegacyCheckout(legacyOrder);
  },

  async confirmOrderReceived(customerId, orderId) {
    const existing = await database.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, customerReceivedAt: true },
    });
    if (!existing) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    if (existing.status !== "DELIVERED") {
      throw new AppError("You can confirm receipt only after this order is delivered.", HTTP_STATUS.CONFLICT);
    }
    if (existing.customerReceivedAt) return existing;

    const confirmedAt = now();
    const changed = await database.order.updateMany({
      where: { id: orderId, customerId, status: "DELIVERED", customerReceivedAt: null },
      data: { customerReceivedAt: confirmedAt },
    });
    if (changed.count === 1) return { ...existing, customerReceivedAt: confirmedAt };

    const latest = await database.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, customerReceivedAt: true },
    });
    if (latest?.status === "DELIVERED" && latest.customerReceivedAt) return latest;
    if (!latest) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    throw new AppError("The order changed while receipt confirmation was being saved. Refresh and try again.", HTTP_STATUS.CONFLICT);
  },

  async hideOrderFromHistory(customerId, orderId) {
    const existing = await database.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, hiddenFromCustomerAt: true },
    });
    if (!existing) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    if (existing.status !== "DELIVERED") {
      throw new AppError("Only delivered orders can be hidden from your order history.", HTTP_STATUS.CONFLICT);
    }
    if (existing.hiddenFromCustomerAt) return existing;

    const hiddenAt = now();
    const changed = await database.order.updateMany({
      where: { id: orderId, customerId, status: "DELIVERED", hiddenFromCustomerAt: null },
      data: { hiddenFromCustomerAt: hiddenAt },
    });
    if (changed.count === 1) return { ...existing, hiddenFromCustomerAt: hiddenAt };

    const latest = await database.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, status: true, hiddenFromCustomerAt: true },
    });
    if (!latest) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    if (latest.status === "DELIVERED" && latest.hiddenFromCustomerAt) return latest;
    throw new AppError("The order changed while it was being hidden. Refresh and try again.", HTTP_STATUS.CONFLICT);
  },

  async cancelCheckout(customerId, checkoutId) {
    const existing = await loadCheckout(database, { id: checkoutId, customerId });
    if (!existing) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
    const isCancelled = (checkout) => checkout.orders?.length && checkout.orders.every((order) => order.status === "CANCELLED");
    if (existing.paymentMethod === "ONLINE" || existing.orders?.some((order) => order.paymentStatus === "PAID")) {
      throw new AppError("Paid mock checkouts cannot be cancelled because refunds are not supported.", HTTP_STATUS.CONFLICT);
    }
    if (isCancelled(existing)) return toCustomerCheckout(existing, now(), windowMinutes);
    if (existing.paymentMethod !== "COD" || existing.orders?.some((order) => order.paymentStatus !== "PENDING")) {
      throw new AppError("Only unpaid COD checkouts can be cancelled through this action.", HTTP_STATUS.CONFLICT);
    }

    const deadline = new Date(new Date(existing.createdAt).getTime() + cancellationWindowMs(windowMinutes));
    if (now().getTime() >= deadline.getTime()) throw new AppError(`The ${windowMinutes}-minute cancellation window has ended.`, HTTP_STATUS.CONFLICT);
    if (!existing.orders?.length || existing.orders.some((order) => order.status !== "PENDING")) {
      throw new AppError("Cancellation is unavailable after a kitchen order is accepted.", HTTP_STATUS.CONFLICT);
    }

    try {
      const cancelled = await database.$transaction(async (tx) => {
        const current = await loadCheckout(tx, { id: checkoutId, customerId });
        if (!current) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
        if (current.paymentMethod === "ONLINE" || current.orders?.some((order) => order.paymentStatus === "PAID")) {
          throw new AppError("Paid mock checkouts cannot be cancelled because refunds are not supported.", HTTP_STATUS.CONFLICT);
        }
        if (isCancelled(current)) return current;
        if (current.paymentMethod !== "COD" || current.orders?.some((order) => order.paymentStatus !== "PENDING")) {
          throw new AppError("Only unpaid COD checkouts can be cancelled through this action.", HTTP_STATUS.CONFLICT);
        }
        const transactionNow = now();
        const transactionDeadline = new Date(new Date(current.createdAt).getTime() + cancellationWindowMs(windowMinutes));
        if (transactionNow.getTime() >= transactionDeadline.getTime()) throw new AppError(`The ${windowMinutes}-minute cancellation window has ended.`, HTTP_STATUS.CONFLICT);
        if (!current.orders?.length || current.orders.some((order) => order.status !== "PENDING")) {
          throw new AppError("Cancellation is unavailable after a kitchen order is accepted.", HTTP_STATUS.CONFLICT);
        }
        for (const order of current.orders) {
          const changed = await tx.order.updateMany({ where: { id: order.id, checkoutId, status: "PENDING" }, data: { status: "CANCELLED" } });
          if (changed.count !== 1) throw new AppError("The checkout changed while cancellation was being processed. Refresh your order.", HTTP_STATUS.CONFLICT);
          await recordOrderStatus(tx, { orderId: order.id, fromStatus: "PENDING", toStatus: "CANCELLED" });
          await notifyOrderStatusChanged(tx, { order, fromStatus: "PENDING", toStatus: "CANCELLED", notifyCook: true });
          for (const item of order.items || []) {
            if (item.dishId) await tx.dish.update({ where: { id: item.dishId }, data: { availableQuantity: { increment: item.quantity } } });
          }
        }
        return loadCheckout(tx, { id: checkoutId, customerId });
      }, { isolationLevel: "Serializable" });
      return toCustomerCheckout(cancelled, now(), windowMinutes);
    } catch (error) {
      if (error?.code === "P2034") {
        const afterRace = await loadCheckout(database, { id: checkoutId, customerId });
        if (isCancelled(afterRace)) return toCustomerCheckout(afterRace, now(), windowMinutes);
        throw new AppError("The checkout changed while cancellation was being processed. Refresh your order.", HTTP_STATUS.CONFLICT);
      }
      throw error;
    }
  },
  });
};

export const ordersService = createOrdersService(prisma);
