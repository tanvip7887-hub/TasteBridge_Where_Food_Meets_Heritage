import { createNotificationsService } from "./notifications.service.js";

const customerStatusMessages = {
  CONFIRMED: ["Order accepted", "The cook accepted your order."],
  PREPARING: ["Order being prepared", "The cook has started preparing your order."],
  READY_FOR_PICKUP: ["Order ready", "Your order is ready for pickup."],
  OUT_FOR_DELIVERY: ["Order on the way", "Your order is on its way."],
  DELIVERED: ["Order delivered", "Your order has been delivered."],
  CANCELLED: ["Order cancelled", "Your order was cancelled."],
};

const adminCustomerStatusMessages = {
  CONFIRMED: ["Order confirmed", "TasteBridge support confirmed your order."],
};

const cookStatusMessages = {
  CONFIRMED: ["Order accepted", "An administrator updated this order to accepted."],
  PREPARING: ["Order preparation updated", "An administrator updated this order to preparing."],
  READY_FOR_PICKUP: ["Order ready for pickup", "An administrator marked this order ready for pickup."],
  CANCELLED: ["Order cancelled", "This order was cancelled."],
};

const eventKeyFor = ({ orderId, fromStatus, toStatus, recipientId }) =>
  `order:${orderId}:transition:${fromStatus || "CREATED"}:${toStatus}:${recipientId}`;

export const notifyCheckoutPlaced = async (transaction, { checkoutId, customerId, orderCount }) => {
  const notifications = createNotificationsService(transaction);
  const description = orderCount === 1 ? "Your order was placed successfully." : `Your checkout created ${orderCount} kitchen orders.`;
  await notifications.create({
    userId: customerId,
    portal: "CUSTOMER",
    type: "ORDER_ALERT",
    title: "Order placed",
    message: description,
    metadata: { kind: "CHECKOUT_PLACED", checkoutId, orderCount },
    eventKey: `checkout:${checkoutId}:placed:customer:${customerId}`,
  });
};

export const notifyCookNewOrder = async (transaction, order) => {
  const cook = await transaction.cookProfile.findUnique({
    where: { id: order.cookId },
    select: { userId: true },
  });
  if (!cook?.userId) return;

  await createNotificationsService(transaction).create({
    userId: cook.userId,
    portal: "COOK",
    type: "ORDER_ALERT",
    title: "New order to review",
    message: `Order ${order.orderNumber} is waiting for your review.`,
    metadata: { kind: "ORDER_CREATED", orderId: order.id, orderNumber: order.orderNumber },
    eventKey: `order:${order.id}:created:cook:${cook.userId}`,
  });
};

/** Notify the agent who won the guarded claim for a pickup-ready order. */
export const notifyDeliveryAgentAssigned = async (transaction, { order, deliveryAgentUserId }) => {
  if (!order?.id || !deliveryAgentUserId) return;
  await createNotificationsService(transaction).create({
    userId: deliveryAgentUserId,
    portal: "DELIVERY_AGENT",
    type: "ORDER_ALERT",
    title: "Delivery assigned",
    message: `Order ${order.orderNumber} is ready for pickup and has been assigned to you.`,
    metadata: { kind: "DELIVERY_ASSIGNED", orderId: order.id, orderNumber: order.orderNumber },
    eventKey: `order:${order.id}:assigned:delivery-agent:${deliveryAgentUserId}`,
  });
};

/** Notify only the agent who owns the delivery when its persisted state changes. */
export const notifyDeliveryAgentOrderEvent = async (transaction, {
  order,
  deliveryAgentUserId,
  kind,
  title,
  message,
  eventKeySuffix,
}) => {
  if (!order?.id || !deliveryAgentUserId || !kind || !title || !message || !eventKeySuffix) return;
  await createNotificationsService(transaction).create({
    userId: deliveryAgentUserId,
    portal: "DELIVERY_AGENT",
    type: "ORDER_ALERT",
    title,
    message: `Order ${order.orderNumber}: ${message}`,
    metadata: { kind, orderId: order.id, orderNumber: order.orderNumber },
    eventKey: `order:${order.id}:${eventKeySuffix}:delivery-agent:${deliveryAgentUserId}`,
  });
};

/** Notify the owning customer and, only when requested by the actor's workflow,
 * the cook for this specific order. Call after the guarded status write, using
 * the same transaction client, so notification failure rolls back the event.
 */
export const notifyOrderStatusChanged = async (transaction, {
  order,
  fromStatus,
  toStatus,
  actor = "COOK",
  notifyCook = false,
  excludedCookId = null,
}) => {
  const notifications = createNotificationsService(transaction);
  const customerMessage = actor === "ADMIN"
    ? adminCustomerStatusMessages[toStatus] || customerStatusMessages[toStatus]
    : customerStatusMessages[toStatus];
  if (customerMessage && order.customerId) {
    await notifications.create({
      userId: order.customerId,
      portal: "CUSTOMER",
      type: "ORDER_ALERT",
      title: customerMessage[0],
      message: `${order.orderNumber ? `Order ${order.orderNumber}: ` : ""}${customerMessage[1]}`,
      metadata: { kind: "ORDER_STATUS", orderId: order.id, fromStatus: fromStatus || null, toStatus },
      eventKey: eventKeyFor({ orderId: order.id, fromStatus, toStatus, recipientId: order.customerId }),
    });
  }

  if (toStatus === "DELIVERED" && order.customerId) {
    await notifications.create({
      userId: order.customerId,
      portal: "CUSTOMER",
      type: "ORDER_ALERT",
      title: "Your review is welcome",
      message: "Your delivered food is ready for a review while the review window is open.",
      metadata: { kind: "REVIEW_REQUESTED", orderId: order.id, href: `/reviews?orderId=${encodeURIComponent(order.checkoutId || order.id)}` },
      eventKey: `order:${order.id}:review-request:customer:${order.customerId}`,
    });
  }

  const cookMessage = cookStatusMessages[toStatus];
  if (!notifyCook || !cookMessage || !order.cookId || order.cookId === excludedCookId) return;
  const cook = await transaction.cookProfile.findUnique({
    where: { id: order.cookId },
    select: { userId: true },
  });
  if (!cook?.userId) return;
  await notifications.create({
    userId: cook.userId,
    portal: "COOK",
    type: "ORDER_ALERT",
    title: cookMessage[0],
    message: `${order.orderNumber ? `Order ${order.orderNumber}: ` : ""}${cookMessage[1]}`,
    metadata: { kind: "ORDER_STATUS", orderId: order.id, fromStatus: fromStatus || null, toStatus },
    eventKey: eventKeyFor({ orderId: order.id, fromStatus, toStatus, recipientId: cook.userId }),
  });
};
