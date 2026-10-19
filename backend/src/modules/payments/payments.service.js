import { randomBytes } from "node:crypto";
import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { currencyNumber, normalizeCurrency, rupeesFromPaise, toPaise } from "../../utils/money.js";
import { addressIsComplete, addressSnapshot, getFees, loadCheckoutReviewData } from "../orders/orders.service.js";
import { getCartDishEligibility } from "../cart/cart.service.js";
import { findCookProfilesWithValidRequiredText } from "../../utils/cookReadiness.js";
import { simulatedPaymentProvider } from "./simulatedPayment.provider.js";
import { recordOrderStatus } from "../orders/order-status-history.js";
import { notifyCheckoutPlaced, notifyCookNewOrder } from "../notifications/order-lifecycle.producers.js";

const DEFAULT_EXPIRY_MINUTES = 15;
const fulfillmentDishInclude = {
  category: { select: { id: true, name: true, isActive: true } },
  cook: { include: { user: { select: { role: true, status: true } } } },
};

const safeAttempt = (attempt) => ({
  id: attempt.id,
  checkoutId: attempt.checkoutId,
  reference: attempt.reference,
  amount: currencyNumber(attempt.amount),
  currency: attempt.currency,
  method: attempt.method,
  methodLabel: attempt.methodLabel,
  status: attempt.status,
  expiresAt: attempt.expiresAt,
  completedAt: attempt.completedAt,
  createdAt: attempt.createdAt,
});

const safeCheckout = (checkout, attempt) => ({
  id: checkout.id,
  paymentMethod: checkout.paymentMethod,
  totalAmount: currencyNumber(checkout.totalAmount),
  createdAt: checkout.createdAt,
  paymentAttempt: safeAttempt(attempt),
});

const ownedAttemptWhere = (customerId, attemptId) => ({
  id: attemptId,
  checkout: { is: { customerId } },
});

const findCustomerActiveAttempt = (tx, customerId, now) => tx.paymentAttempt.findFirst({
  where: {
    status: "PENDING",
    expiresAt: { gt: now },
    checkout: { is: { customerId, paymentMethod: "ONLINE" } },
  },
  include: { checkout: true },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
});

const expireDueAttempts = async (tx, customerId, now) => {
  const due = await tx.paymentAttempt.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
      checkout: { is: { customerId, paymentMethod: "ONLINE" } },
    },
    select: { id: true },
  });

  for (const { id } of due) {
    const changed = await tx.paymentAttempt.updateMany({
      where: { id, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", completedAt: now },
    });
    if (changed.count === 1) {
      await tx.paymentAttemptEvent.create({
        data: { paymentAttemptId: id, fromStatus: "PENDING", toStatus: "EXPIRED", reasonCode: "TIMEOUT" },
      });
    }
  }
};

const loadIdempotentCheckout = (tx, customerId, idempotencyKey) => tx.checkout.findFirst({
  where: { customerId, idempotencyKey },
  include: {
    lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    paymentAttempts: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
  },
});

const serializeInitiation = (checkout, attempt) => {
  if (!checkout || !attempt) throw new AppError("The payment checkout could not be loaded.", HTTP_STATUS.CONFLICT);
  return safeCheckout(checkout, attempt);
};

const checkoutForConfirmation = (database, customerId, attemptId) => database.paymentAttempt.findFirst({
  where: ownedAttemptWhere(customerId, attemptId),
  include: {
    checkout: {
      include: {
        lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        cookSnapshots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        orders: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { items: true, statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] } } },
      },
    },
  },
});

const confirmationResult = (checkout, attempt) => ({
  checkoutId: checkout.id,
  totalAmount: currencyNumber(checkout.totalAmount),
  paymentAttempt: safeAttempt(attempt),
  orders: (checkout.orders || []).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    cookId: order.cookId,
    cookName: order.cookName,
    status: order.status,
    paymentStatus: order.paymentStatus,
  })),
});

const transitionPendingToFailed = async (tx, attemptId, at, reasonCode) => {
  const changed = await tx.paymentAttempt.updateMany({
    where: { id: attemptId, status: "PENDING", expiresAt: { gt: at } },
    data: { status: "FAILED", completedAt: at },
  });
  if (changed.count === 1) {
    await tx.paymentAttemptEvent.create({
      data: { paymentAttemptId: attemptId, fromStatus: "PENDING", toStatus: "FAILED", reasonCode },
    });
  }
  return changed.count === 1;
};

const markPendingExpired = async (tx, attemptId, at) => {
  const changed = await tx.paymentAttempt.updateMany({
    where: { id: attemptId, status: "PENDING", expiresAt: { lte: at } },
    data: { status: "EXPIRED", completedAt: at },
  });
  if (changed.count === 1) {
    await tx.paymentAttemptEvent.create({
      data: { paymentAttemptId: attemptId, fromStatus: "PENDING", toStatus: "EXPIRED", reasonCode: "TIMEOUT" },
    });
  }
  return changed.count === 1;
};

const paiseOrNull = (value) => {
  try { return toPaise(value); } catch { return null; }
};

const verifySnapshots = (checkout, attempt) => {
  const lines = checkout.lines || [];
  const cooks = checkout.cookSnapshots || [];
  if (!lines.length || !cooks.length) return "CHECKOUT_SNAPSHOT_MISSING";
  if (lines.some((line) => !line.cartItemId || !line.cartItemUpdatedAt || !line.dishId
    || !Number.isInteger(line.quantity) || line.quantity < 1 || !line.cookId)) return "CHECKOUT_SNAPSHOT_INCOMPLETE";

  const amount = paiseOrNull(checkout.totalAmount);
  const attemptAmount = paiseOrNull(attempt.amount);
  if (amount === null || attemptAmount === null || amount <= 0n || amount !== attemptAmount) return "CHECKOUT_AMOUNT_MISMATCH";

  const lineTotals = new Map();
  let subtotal = 0n;
  for (const line of lines) {
    const unit = paiseOrNull(line.unitPrice);
    const total = paiseOrNull(line.totalPrice);
    if (unit === null || total === null || unit <= 0n || total !== unit * BigInt(line.quantity)) return "CHECKOUT_LINE_AMOUNT_MISMATCH";
    subtotal += total;
    lineTotals.set(line.cookId, (lineTotals.get(line.cookId) || 0n) + total);
  }

  const cookIds = new Set();
  let splitSubtotal = 0n;
  let splitDelivery = 0n;
  let splitPlatform = 0n;
  let splitTotal = 0n;
  for (const cook of cooks) {
    if (cookIds.has(cook.cookId)) return "CHECKOUT_COOK_SNAPSHOT_DUPLICATED";
    cookIds.add(cook.cookId);
    const cookSubtotal = paiseOrNull(cook.subtotal);
    const delivery = paiseOrNull(cook.deliveryFee);
    const platform = paiseOrNull(cook.platformFee);
    const total = paiseOrNull(cook.totalAmount);
    const cookEarning = paiseOrNull(cook.cookEarning);
    const deliveryEarning = paiseOrNull(cook.deliveryEarning);
    if ([cookSubtotal, delivery, platform, total, cookEarning, deliveryEarning].some((value) => value === null)
      || cookSubtotal !== lineTotals.get(cook.cookId)
      || total !== cookSubtotal + delivery + platform
      || cookEarning !== cookSubtotal - platform
      || deliveryEarning !== delivery) return "CHECKOUT_COOK_TOTAL_MISMATCH";
    splitSubtotal += cookSubtotal;
    splitDelivery += delivery;
    splitPlatform += platform;
    splitTotal += total;
  }
  if (lineTotals.size !== cookIds.size || splitSubtotal !== subtotal
    || splitSubtotal !== paiseOrNull(checkout.subtotal)
    || splitDelivery !== paiseOrNull(checkout.deliveryFee)
    || splitPlatform !== paiseOrNull(checkout.platformFee)
    || splitTotal !== amount) return "CHECKOUT_TOTAL_MISMATCH";
  return null;
};

export const createPaymentsService = (database, options = {}) => {
  const provider = options.provider || simulatedPaymentProvider;
  const now = options.now || (() => new Date());
  const expiryMinutes = options.expiryMinutes ?? DEFAULT_EXPIRY_MINUTES;
  const allowMockPayments = options.allowMockPayments ?? process.env.NODE_ENV !== "production";
  const assertMockPaymentsEnabled = () => {
    if (!allowMockPayments) {
      throw new AppError("Mock online payments are disabled in production.", HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
  };
  const loadOwnedAttempt = (tx, customerId, attemptId) => tx.paymentAttempt.findFirst({
    where: ownedAttemptWhere(customerId, attemptId),
    include: {
      checkout: {
        include: {
          lines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          cookSnapshots: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          orders: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { items: true, statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] } } },
        },
      },
    },
  });

  const markExpired = async (tx, customerId, attemptId, at) => {
    const owned = await tx.paymentAttempt.findFirst({
      where: ownedAttemptWhere(customerId, attemptId),
      include: { checkout: true },
    });
    if (!owned) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
    if (owned.status !== "PENDING" || owned.expiresAt > at) return owned;

    const changed = await tx.paymentAttempt.updateMany({
      where: { id: attemptId, status: "PENDING", expiresAt: { lte: at } },
      data: { status: "EXPIRED", completedAt: at },
    });
    if (changed.count === 1) {
      await tx.paymentAttemptEvent.create({
        data: { paymentAttemptId: attemptId, fromStatus: "PENDING", toStatus: "EXPIRED", reasonCode: "TIMEOUT" },
      });
    }
    return tx.paymentAttempt.findFirst({ where: ownedAttemptWhere(customerId, attemptId), include: { checkout: true } });
  };

  return {
    async initiateOnlineCheckout(customerId, { addressId, idempotencyKey }) {
      assertMockPaymentsEnabled();
      const at = now();
      try {
        const result = await database.$transaction(async (tx) => {
          await expireDueAttempts(tx, customerId, at);

          const existing = await loadIdempotentCheckout(tx, customerId, idempotencyKey);
          if (existing) {
            if (existing.paymentMethod !== "ONLINE") {
              throw new AppError("This idempotency key was already used for another checkout method.", HTTP_STATUS.CONFLICT);
            }
            return serializeInitiation(existing, existing.paymentAttempts?.[0]);
          }

          const active = await findCustomerActiveAttempt(tx, customerId, at);
          if (active) return serializeInitiation(active.checkout, active);

          const { cart, address, settings, review } = await loadCheckoutReviewData(tx, customerId, addressId);
          if (!address) throw new AppError("The selected delivery address was not found.", HTTP_STATUS.NOT_FOUND);
          if (!addressIsComplete(address)) throw new AppError("The selected delivery address is incomplete. Update it before continuing.", HTTP_STATUS.BAD_REQUEST);
          if (!cart?.items?.length) throw new AppError("Your cart is empty.", HTTP_STATUS.BAD_REQUEST);
          if (!review.canPlaceOrder) {
            const details = review.issues.flatMap((issue) => issue.reasons).join(" ");
            throw new AppError(`Your cart needs attention before payment. ${details}`, HTTP_STATUS.CONFLICT);
          }

          const groups = new Map();
          for (const reviewed of review.items) {
            const cartItem = cart.items.find((item) => item.id === reviewed.id);
            const dish = cartItem?.dish;
            if (!dish) throw new AppError("A dish in your cart is no longer available.", HTTP_STATUS.CONFLICT);
            if (!groups.has(dish.cookId)) groups.set(dish.cookId, { cookId: dish.cookId, cookName: dish.cook.businessName, items: [] });
            groups.get(dish.cookId).items.push({ cartItem, dish, quantity: cartItem.quantity, unitPricePaise: toPaise(dish.price) });
          }
          const feeGroups = new Map([...groups.entries()].map(([id, group]) => [id, {
            ...group,
            items: group.items.map((line) => ({ lineTotalPaise: line.unitPricePaise * BigInt(line.quantity) })),
          }]));
          const fees = getFees(feeGroups, settings);
          const checkout = await tx.checkout.create({
            data: {
              customerId,
              idempotencyKey,
              paymentMethod: "ONLINE",
              addressId: address.id,
              addressSnapshot: addressSnapshot(address),
              subtotal: fees.subtotal,
              deliveryFee: fees.deliveryFee,
              platformFee: fees.platformFee,
              totalAmount: fees.totalAmount,
            },
          });

          const snapshotLines = [...groups.values()].flatMap((group) => group.items.map((line) => ({
            checkoutId: checkout.id,
            cartItemId: line.cartItem.id,
            cartItemUpdatedAt: line.cartItem.updatedAt,
            dishId: line.dish.id,
            cookId: group.cookId,
            dishName: line.dish.name,
            cookName: group.cookName,
            cuisine: line.dish.cuisine,
            dishImage: line.dish.image,
            quantity: line.quantity,
            unitPrice: rupeesFromPaise(line.unitPricePaise),
            totalPrice: rupeesFromPaise(line.unitPricePaise * BigInt(line.quantity)),
          })));
          await tx.checkoutLine.createMany({ data: snapshotLines });
          await tx.checkoutCookSnapshot.createMany({
            data: fees.splits.map((split) => ({
              checkoutId: checkout.id,
              cookId: split.cookId,
              cookName: split.cookName,
              subtotal: split.subtotal,
              deliveryFee: split.deliveryFee,
              platformFee: split.platformFee,
              totalAmount: split.totalAmount,
              cookEarning: split.cookEarning,
              deliveryEarning: split.deliveryEarning,
            })),
          });

          // Pass the persisted checkout total, not a client value or a fresh calculation.
          const providerIntent = await provider.createPayment({
            amount: checkout.totalAmount,
            currency: "INR",
            expiresAt: new Date(at.getTime() + expiryMinutes * 60_000),
          });
          const persistedAmount = normalizeCurrency(checkout.totalAmount);
          if (providerIntent.amount !== persistedAmount || providerIntent.status !== "PENDING") {
            throw new AppError("The simulated provider returned an invalid pending payment intent.", HTTP_STATUS.SERVICE_UNAVAILABLE);
          }

          const attempt = await tx.paymentAttempt.create({
            data: {
              checkoutId: checkout.id,
              reference: providerIntent.reference,
              amount: persistedAmount,
              currency: providerIntent.currency,
              method: providerIntent.method,
              methodLabel: providerIntent.methodLabel,
              status: "PENDING",
              expiresAt: providerIntent.expiresAt,
              events: { create: { fromStatus: null, toStatus: "PENDING", reasonCode: "INITIATED" } },
            },
          });
          return serializeInitiation(checkout, attempt);
        }, { isolationLevel: "Serializable" });
        return result;
      } catch (error) {
        if (error?.code === "P2002" || error?.code === "P2034") {
          const existing = await loadIdempotentCheckout(database, customerId, idempotencyKey);
          if (existing?.paymentMethod === "ONLINE" && existing.paymentAttempts?.[0]) {
            return serializeInitiation(existing, existing.paymentAttempts[0]);
          }
          const active = await findCustomerActiveAttempt(database, customerId, now());
          if (active) return serializeInitiation(active.checkout, active);
          if (error.code === "P2034") throw new AppError("The cart or payment state changed during initiation. Retry with the same idempotency key.", HTTP_STATUS.CONFLICT);
        }
        throw error;
      }
    },

    async getAttempt(customerId, attemptId) {
      const at = now();
      const attempt = await database.$transaction(async (tx) => markExpired(tx, customerId, attemptId, at));
      return safeAttempt(attempt);
    },

    async confirmAttempt(customerId, attemptId, { mockOutcome } = {}) {
      const initial = await checkoutForConfirmation(database, customerId, attemptId);
      if (!initial) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
      if (initial.status === "SUCCEEDED") {
        if (!initial.checkout?.orders?.length) throw new AppError("The completed payment has no associated orders.", HTTP_STATUS.CONFLICT);
        return confirmationResult(initial.checkout, initial);
      }
      if (initial.status !== "PENDING") throw new AppError(`Payment attempt is ${initial.status.toLowerCase()} and cannot be confirmed.`, HTTP_STATUS.CONFLICT);

      const checkedAt = now();
      if (initial.expiresAt <= checkedAt) {
        await database.$transaction(async (tx) => markExpired(tx, customerId, attemptId, checkedAt), { isolationLevel: "Serializable" });
        throw new AppError("Payment attempt has expired. Start a new checkout to try again.", HTTP_STATUS.CONFLICT);
      }

      if (mockOutcome !== "SUCCESS" && mockOutcome !== "FAILURE") {
        throw new AppError("Choose Simulate Success or Simulate Failure for this mock payment.", HTTP_STATUS.BAD_REQUEST);
      }

      assertMockPaymentsEnabled();

      // The mock scenario is translated by the provider adapter. It is not a
      // status/paid assertion, and cannot bypass the transactional checks below.
      const providerResult = await provider.confirmPayment({ reference: initial.reference, mockOutcome });
      if (providerResult?.reference !== initial.reference
        || !["SUCCEEDED", "FAILED"].includes(providerResult?.status)) {
        throw new AppError("The simulated provider returned an invalid confirmation result.", HTTP_STATUS.SERVICE_UNAVAILABLE);
      }

      if (providerResult.status === "FAILED") {
        const result = await database.$transaction(async (tx) => {
          const current = await loadOwnedAttempt(tx, customerId, attemptId);
          if (!current) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
          if (current.status === "PENDING" && current.expiresAt <= now()) {
            await markPendingExpired(tx, attemptId, now());
          } else if (current.status === "PENDING") {
            await transitionPendingToFailed(tx, attemptId, now(), "SIMULATED_DECLINE");
          }
          return loadOwnedAttempt(tx, customerId, attemptId);
        }, { isolationLevel: "Serializable" });
        if (result.status === "SUCCEEDED") return confirmationResult(result.checkout, result);
        if (result.status === "PENDING") throw new AppError("The payment state changed while confirmation was being processed. Retry the request.", HTTP_STATUS.CONFLICT);
        return confirmationResult(result.checkout, result);
      }

      try {
        const result = await database.$transaction(async (tx) => {
          const attempt = await loadOwnedAttempt(tx, customerId, attemptId);
          if (!attempt) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
          if (attempt.status === "SUCCEEDED") {
            if (!attempt.checkout?.orders?.length) throw new AppError("The completed payment has no associated orders.", HTTP_STATUS.CONFLICT);
            return { kind: "completed", value: confirmationResult(attempt.checkout, attempt) };
          }
          if (attempt.status !== "PENDING") return { kind: "terminal", status: attempt.status };

          const at = now();
          if (attempt.expiresAt <= at) {
            await markPendingExpired(tx, attemptId, at);
            return { kind: "terminal", status: "EXPIRED" };
          }
          const checkout = attempt.checkout;
          if (!checkout || checkout.paymentMethod !== "ONLINE") {
            await transitionPendingToFailed(tx, attemptId, at, "INVALID_CHECKOUT_METHOD");
            return { kind: "terminal", status: "FAILED", reason: "This payment is not associated with an online checkout." };
          }

          const integrityFailure = verifySnapshots(checkout, attempt);
          if (integrityFailure) {
            await transitionPendingToFailed(tx, attemptId, at, integrityFailure);
            return { kind: "terminal", status: "FAILED", reason: "Checkout details could not be verified. Please contact support." };
          }

          const dishIds = [...new Set(checkout.lines.map((line) => line.dishId))];
          const eligibleCookIds = await findCookProfilesWithValidRequiredText(tx);
          const dishes = await tx.dish.findMany({ where: { id: { in: dishIds } }, include: fulfillmentDishInclude });
          const eligibleIds = new Set(eligibleCookIds);
          const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
          const quantityByDish = new Map();
          const lineTotalsByCook = new Map();
          for (const line of checkout.lines) {
            const dish = dishById.get(line.dishId);
            const eligibility = getCartDishEligibility(dish, eligibleIds, at);
            if (!dish || dish.cookId !== line.cookId || !eligibility.isAvailable) {
              await transitionPendingToFailed(tx, attemptId, at, "DISH_NO_LONGER_ELIGIBLE");
              return { kind: "terminal", status: "FAILED", reason: "A dish or kitchen is no longer eligible. No order was created." };
            }
            quantityByDish.set(line.dishId, (quantityByDish.get(line.dishId) || 0) + line.quantity);
            lineTotalsByCook.set(line.cookId, (lineTotalsByCook.get(line.cookId) || 0n) + toPaise(line.totalPrice));
          }
          for (const [dishId, quantity] of quantityByDish) {
            if (dishById.get(dishId).availableQuantity < quantity) {
              await transitionPendingToFailed(tx, attemptId, at, "INVENTORY_UNAVAILABLE");
              return { kind: "terminal", status: "FAILED", reason: "Some dishes sold out before payment confirmation. No order was created; your cart is unchanged." };
            }
          }

          // This conditional write claims the pending attempt. All following
          // order, stock, cart, and event writes share this transaction; any
          // thrown error rolls the claim back as well.
          const claimed = await tx.paymentAttempt.updateMany({
            where: { id: attemptId, status: "PENDING", expiresAt: { gt: at } },
            data: { status: "SUCCEEDED", completedAt: at },
          });
          if (claimed.count !== 1) {
            const latest = await loadOwnedAttempt(tx, customerId, attemptId);
            if (latest?.status === "SUCCEEDED" && latest.checkout?.orders?.length) {
              return { kind: "completed", value: confirmationResult(latest.checkout, latest) };
            }
            if (latest?.status === "PENDING" && latest.expiresAt <= at) {
              await markPendingExpired(tx, attemptId, at);
              return { kind: "terminal", status: "EXPIRED" };
            }
            return { kind: "terminal", status: latest?.status || "FAILED" };
          }

          for (const [dishId, quantity] of quantityByDish) {
            const reserved = await tx.dish.updateMany({
              where: {
                id: dishId,
                status: "PUBLISHED",
                isAvailable: true,
                availableQuantity: { gte: quantity },
              },
              data: { availableQuantity: { decrement: quantity } },
            });
            if (reserved.count !== 1) {
              const error = new AppError("Stock changed while confirming payment. No order was created.", HTTP_STATUS.CONFLICT);
              error.paymentFailureReason = "INVENTORY_CHANGED_DURING_CONFIRMATION";
              throw error;
            }
          }

          const cookSnapshots = new Map(checkout.cookSnapshots.map((cook) => [cook.cookId, cook]));
          const linesByCook = new Map();
          for (const line of checkout.lines) {
            if (!linesByCook.has(line.cookId)) linesByCook.set(line.cookId, []);
            linesByCook.get(line.cookId).push(line);
          }
          for (const [cookId, lines] of linesByCook) {
            const cook = cookSnapshots.get(cookId);
            if (!cook || lineTotalsByCook.get(cookId) !== toPaise(cook.subtotal)) {
              throw new AppError("Cook checkout totals do not match the saved line snapshots.", HTTP_STATUS.CONFLICT);
            }
            const createdOrder = await tx.order.create({
              data: {
                orderNumber: `TB-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`,
                customerId,
                cookId,
                cookName: cook.cookName,
                checkoutId: checkout.id,
                addressId: checkout.addressId,
                status: "PENDING",
                paymentStatus: "PAID",
                subtotal: cook.subtotal,
                deliveryFee: cook.deliveryFee,
                platformFee: cook.platformFee,
                totalAmount: cook.totalAmount,
                cookEarning: cook.cookEarning,
                deliveryEarning: cook.deliveryEarning,
                items: {
                  create: lines.map((line) => ({
                    dishId: line.dishId,
                    name: line.dishName,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    totalPrice: line.totalPrice,
                    dishImage: line.dishImage,
                  })),
                },
              },
            });
            await recordOrderStatus(tx, { orderId: createdOrder.id, toStatus: "PENDING" });
            await notifyCookNewOrder(tx, createdOrder);
          }

          await notifyCheckoutPlaced(tx, {
            checkoutId: checkout.id,
            customerId,
            orderCount: linesByCook.size,
          });

          const cart = await tx.cart.findUnique({ where: { customerId }, select: { id: true } });
          if (cart) {
            for (const line of checkout.lines) {
              await tx.cartItem.deleteMany({
                where: {
                  id: line.cartItemId,
                  cartId: cart.id,
                  dishId: line.dishId,
                  quantity: line.quantity,
                  updatedAt: line.cartItemUpdatedAt,
                },
              });
            }
          }

          await tx.paymentAttemptEvent.create({
            data: { paymentAttemptId: attemptId, fromStatus: "PENDING", toStatus: "SUCCEEDED", reasonCode: "SIMULATED_CONFIRMATION" },
          });
          const completed = await loadOwnedAttempt(tx, customerId, attemptId);
          return { kind: "completed", value: confirmationResult(completed.checkout, completed) };
        }, { isolationLevel: "Serializable" });

        if (result.kind === "completed") return result.value;
        if (result.status === "FAILED") {
          throw new AppError(result.reason || "Payment could not be completed.", HTTP_STATUS.CONFLICT);
        }
        throw new AppError(`Payment attempt is ${String(result.status || "unavailable").toLowerCase()} and cannot be confirmed.`, HTTP_STATUS.CONFLICT);
      } catch (error) {
        if (error?.paymentFailureReason === "INVENTORY_CHANGED_DURING_CONFIRMATION") {
          const failed = await database.$transaction(async (tx) => {
            const current = await loadOwnedAttempt(tx, customerId, attemptId);
            if (!current) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
            if (current.status === "PENDING") await transitionPendingToFailed(tx, attemptId, now(), error.paymentFailureReason);
            return loadOwnedAttempt(tx, customerId, attemptId);
          }, { isolationLevel: "Serializable" });
          if (failed.status === "SUCCEEDED" && failed.checkout?.orders?.length) return confirmationResult(failed.checkout, failed);
          throw new AppError(error.message, HTTP_STATUS.CONFLICT);
        }
        if (error?.code === "P2034") {
          const latest = await checkoutForConfirmation(database, customerId, attemptId);
          if (latest?.status === "SUCCEEDED" && latest.checkout?.orders?.length) return confirmationResult(latest.checkout, latest);
          if (latest?.status === "PENDING" && latest.expiresAt <= now()) {
            await database.$transaction(async (tx) => markExpired(tx, customerId, attemptId, now()), { isolationLevel: "Serializable" });
          }
          throw new AppError("The payment or inventory changed concurrently. Refresh the payment status before retrying.", HTTP_STATUS.CONFLICT);
        }
        throw error;
      }
    },

    async cancelAttempt(customerId, attemptId) {
      const at = now();
      return database.$transaction(async (tx) => {
        const owned = await tx.paymentAttempt.findFirst({
          where: ownedAttemptWhere(customerId, attemptId),
          include: { checkout: true },
        });
        if (!owned) throw new AppError("Payment attempt not found.", HTTP_STATUS.NOT_FOUND);
        if (owned.status === "PENDING" && owned.expiresAt <= at) {
          const expired = await markExpired(tx, customerId, attemptId, at);
          return safeAttempt(expired);
        }
        if (owned.status !== "PENDING") return safeAttempt(owned);

        const changed = await tx.paymentAttempt.updateMany({
          where: { id: attemptId, status: "PENDING", expiresAt: { gt: at } },
          data: { status: "FAILED", completedAt: at },
        });
        if (changed.count === 1) {
          await tx.paymentAttemptEvent.create({
            data: { paymentAttemptId: attemptId, fromStatus: "PENDING", toStatus: "FAILED", reasonCode: "CUSTOMER_CANCELLED" },
          });
        }
        const current = await tx.paymentAttempt.findFirst({ where: ownedAttemptWhere(customerId, attemptId) });
        return safeAttempt(current);
      }, { isolationLevel: "Serializable" });
    },
  };
};

export const paymentsService = createPaymentsService(prisma);
