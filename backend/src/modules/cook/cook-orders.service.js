import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { assertOrderStatusTransition, cancelCheckoutOrders } from "../admin/admin.service.js";
import { assertReadyForPickupAvailable, recordOrderStatus } from "../orders/order-status-history.js";
import { notifyOrderStatusChanged } from "../notifications/order-lifecycle.producers.js";

const orderInclude = {
  items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] },
  checkout: { select: { id: true, paymentMethod: true, addressSnapshot: true, createdAt: true } },
  address: {
    select: {
      label: true, recipientName: true, phone: true, addressLine1: true,
      addressLine2: true, locality: true, city: true, state: true,
      pincode: true, landmark: true,
    },
  },
};

const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const isSerializationConflict = (error) => error?.code === "P2034";

const loadCookOrder = (database, cookId, orderId) => database.order.findFirst({
  where: { id: orderId, cookId },
  include: orderInclude,
});

const resolveConcurrentAccept = async (database, cookId, orderId) => {
  const current = await loadCookOrder(database, cookId, orderId);
  if (current?.status === "CONFIRMED") return current;
  throw conflict("The order changed while it was being accepted. Refresh and try again.");
};

const resolveConcurrentReject = async (database, cookId, orderId) => {
  const current = await loadCookOrder(database, cookId, orderId);
  if (current?.status === "CANCELLED" && current.checkoutId) {
    const group = await database.order.findMany({
      where: { checkoutId: current.checkoutId },
      select: { status: true },
    });
    if (group.length > 0 && group.every((order) => order.status === "CANCELLED")) return current;
  }
  throw conflict("The checkout changed while the rejection was being processed. Refresh and try again.");
};

export const createCookOrdersService = (database) => ({
  async listOrders(cookId) {
    return database.order.findMany({
      where: { cookId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: orderInclude,
    });
  },

  async acceptOrder(cookId, orderId) {
    try {
      return await database.$transaction(async (tx) => {
        const order = await loadCookOrder(tx, cookId, orderId);
        if (!order) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
        if (order.status === "CONFIRMED") return order;
        assertOrderStatusTransition(order.status, "CONFIRMED");
        if (!["PENDING", "PAID"].includes(order.paymentStatus)) {
          throw conflict("This order cannot be accepted in its current payment state.");
        }

        const updated = await tx.order.updateMany({
          where: { id: orderId, cookId, status: "PENDING", paymentStatus: order.paymentStatus },
          data: { status: "CONFIRMED" },
        });
        if (updated.count !== 1) throw conflict("The order changed while it was being accepted. Refresh and try again.");
        await recordOrderStatus(tx, { orderId, fromStatus: "PENDING", toStatus: "CONFIRMED" });
        await notifyOrderStatusChanged(tx, { order, fromStatus: "PENDING", toStatus: "CONFIRMED" });
        return loadCookOrder(tx, cookId, orderId);
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isSerializationConflict(error)) return resolveConcurrentAccept(database, cookId, orderId);
      throw error;
    }
  },

  async prepareOrder(cookId, orderId) {
    return transitionCookOrder(database, cookId, orderId, "CONFIRMED", "PREPARING");
  },

  async markReadyForPickup(cookId, orderId) {
    return transitionCookOrder(database, cookId, orderId, "PREPARING", "READY_FOR_PICKUP");
  },

  async rejectOrder(cookId, orderId) {
    try {
      return await database.$transaction(async (tx) => {
        const order = await loadCookOrder(tx, cookId, orderId);
        if (!order) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
        if (!order.checkoutId || order.checkout?.paymentMethod !== "COD") {
          throw conflict("Only COD checkout orders can be rejected without refund support.");
        }
        if (order.paymentStatus === "PAID") {
          throw conflict("This mock-paid order cannot be rejected because refunds are not supported.");
        }
        if (order.status !== "PENDING" && order.status !== "CANCELLED") {
          throw conflict("Only a pending order can be rejected.");
        }

        const group = await tx.order.findMany({
          where: { checkoutId: order.checkoutId },
          select: { paymentStatus: true },
        });
        if (!group.length || group.some((item) => item.paymentStatus !== "PENDING")) {
          throw conflict("The complete checkout is not eligible for COD rejection.");
        }

        return cancelCheckoutOrders(tx, order.checkoutId, orderId, { actorCookId: cookId });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (isSerializationConflict(error)) return resolveConcurrentReject(database, cookId, orderId);
      throw error;
    }
  },
});

const transitionCookOrder = async (database, cookId, orderId, fromStatus, toStatus) => {
  try {
    return await database.$transaction(async (tx) => {
      const order = await loadCookOrder(tx, cookId, orderId);
      if (!order) throw new AppError("Order not found.", HTTP_STATUS.NOT_FOUND);
      if (order.status === toStatus) return order;
      assertOrderStatusTransition(order.status, toStatus);
      if (!["PENDING", "PAID"].includes(order.paymentStatus)) {
        throw conflict("This order cannot be advanced in its current payment state.");
      }
      if (toStatus === "READY_FOR_PICKUP") await assertReadyForPickupAvailable(tx);

      const updated = await tx.order.updateMany({
        where: { id: orderId, cookId, status: fromStatus, paymentStatus: order.paymentStatus },
        data: { status: toStatus },
      });
      if (updated.count !== 1) throw conflict("The order changed while its status was being updated. Refresh and try again.");
      await recordOrderStatus(tx, { orderId, fromStatus, toStatus });
      await notifyOrderStatusChanged(tx, { order, fromStatus, toStatus });
      return loadCookOrder(tx, cookId, orderId);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isSerializationConflict(error)) {
      const current = await loadCookOrder(database, cookId, orderId);
      if (current?.status === toStatus) return current;
      throw conflict("The order changed while its status was being updated. Refresh and try again.");
    }
    throw error;
  }
};

export const cookOrdersService = createCookOrdersService(prisma);
