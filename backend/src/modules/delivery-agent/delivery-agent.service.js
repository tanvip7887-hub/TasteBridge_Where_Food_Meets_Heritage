import prisma from "../../config/prisma.js";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { sendEmailJob } from "../../services/email.service.js";
import { AppError } from "../../utils/AppError.js";
import {
  notifyDeliveryAgentAssigned,
  notifyDeliveryAgentOrderEvent,
  notifyOrderStatusChanged,
} from "../notifications/order-lifecycle.producers.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { getDeliveryAgentReadiness } from "./delivery-agent-readiness.js";
import { isValidDeliveryAgentPayoutDetails, isValidDeliveryAgentUpiId } from "./delivery-agent.validation.js";
import { currencyNumber } from "../../utils/money.js";

const dashboardAgentInclude = {
  payoutDetails: { select: { upiId: true, accountHolderName: true, verificationStatus: true, rejectionReason: true } },
  user: {
    select: {
      id: true,
      name: true,
      status: true,
      role: true,
      verificationDocuments: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          documentType: true,
          verificationStatus: true,
          expiryDate: true,
          createdAt: true,
        },
      },
    },
  },
};

const getAgentWorkContext = async (database, userId) => {
  const agent = await database.deliveryAgent.findUnique({
    where: { userId },
    include: dashboardAgentInclude,
  });
  if (!agent) throw new AppError("Delivery-agent profile not found.", HTTP_STATUS.NOT_FOUND);

  const applicationAddress = await database.address.findFirst({
    where: { userId, label: "DELIVERY_AGENT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { landmark: true },
  });
  const metadata = parseMetadata(applicationAddress?.landmark);
  const inferredDeliveryType = agent.vehicleType?.includes("Bicycle")
    ? "BICYCLE"
    : agent.vehicleType?.includes("Walking")
      ? "WALKING"
      : "TWO_WHEELER";

  return { ...agent, deliveryType: metadata.deliveryType || inferredDeliveryType };
};

const decimalToPaise = (value) => {
  const [whole = "0", fraction = ""] = String(value ?? 0).split(".");
  const normalizedFraction = `${fraction}00`.slice(0, 2);
  return BigInt(whole) * 100n + BigInt(normalizedFraction);
};

const publicPayoutDetails = (details) => details ? ({
  upiId: details.upiId,
  accountHolderName: details.accountHolderName,
  verificationStatus: details.verificationStatus,
  rejectionReason: details.rejectionReason,
  submittedAt: details.submittedAt,
  reviewedAt: details.reviewedAt,
}) : null;

const DELIVERY_OTP_TTL_MS = 10 * 60 * 1000;
const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const DELIVERY_OTP_ATTEMPT_LIMIT = 5;
const DELIVERY_OTP_INVALID_MESSAGE = "The verification code is incorrect, expired, or unavailable. Request a new code and try again.";
const maskEmailAddress = (email) => {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const separator = normalizedEmail.lastIndexOf("@");
  if (separator < 1 || separator === normalizedEmail.length - 1) return null;
  return `${normalizedEmail[0]}***@${normalizedEmail.slice(separator + 1)}`;
};
const deliveryOtpError = (message = DELIVERY_OTP_INVALID_MESSAGE, statusCode = HTTP_STATUS.BAD_REQUEST, retryAfterSeconds = null) => {
  const error = new AppError(message, statusCode, null, retryAfterSeconds);
  error.suppressStackTrace = true;
  error.errorCode = statusCode === HTTP_STATUS.TOO_MANY_REQUESTS
    ? (retryAfterSeconds ? "DELIVERY_OTP_RESEND_COOLDOWN" : "DELIVERY_OTP_ATTEMPTS_EXCEEDED")
    : statusCode === HTTP_STATUS.SERVICE_UNAVAILABLE
      ? "DELIVERY_OTP_EMAIL_FAILED"
      : /expired/i.test(message)
        ? "DELIVERY_OTP_EXPIRED"
        : /incorrect/i.test(message)
          ? "DELIVERY_OTP_INCORRECT"
          : "DELIVERY_OTP_REJECTED";
  return error;
};

export const submitDeliveryAgentPayoutDetails = async (database, userId, upiId, accountHolderName, now = new Date()) => {
  const normalizedUpiId = typeof upiId === "string" ? upiId.trim() : "";
  const normalizedAccountHolderName = typeof accountHolderName === "string" ? accountHolderName.trim() : "";
  if (!isValidDeliveryAgentUpiId(normalizedUpiId)) {
    throw new AppError("Enter a valid UPI ID, such as name@bank.", HTTP_STATUS.BAD_REQUEST);
  }
  if (normalizedAccountHolderName.length < 2 || normalizedAccountHolderName.length > 100) {
    throw new AppError("Enter the UPI account holder name (2 to 100 characters).", HTTP_STATUS.BAD_REQUEST);
  }
  try {
    return await database.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
      if (!user) throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
      if (user.status !== "ACTIVE") {
        throw new AppError("An active delivery-agent account is required to submit payout details.", HTTP_STATUS.FORBIDDEN);
      }

      const agent = await tx.deliveryAgent.findUnique({
        where: { userId },
        select: { id: true, verificationStatus: true, payoutDetails: { select: {
          upiId: true, accountHolderName: true, verificationStatus: true,
        } } },
      });
      if (!agent) throw new AppError("Delivery-agent profile not found.", HTTP_STATUS.NOT_FOUND);
      if (agent.verificationStatus !== "APPROVED") {
        throw new AppError("Your delivery-agent profile must be approved before payout details can be submitted.", HTTP_STATUS.CONFLICT);
      }
      const pendingDetailsAreComplete = agent.payoutDetails?.verificationStatus === "PENDING"
        && isValidDeliveryAgentPayoutDetails(agent.payoutDetails);
      if (pendingDetailsAreComplete) {
        throw new AppError("Your payout details are already awaiting admin approval.", HTTP_STATUS.CONFLICT);
      }

      const updatedAvailability = await tx.deliveryAgent.updateMany({
        where: { id: agent.id, userId, verificationStatus: "APPROVED" },
        data: { isAvailable: false },
      });
      if (updatedAvailability.count !== 1) {
        throw new AppError("Your delivery-agent profile changed. Refresh and try again.", HTTP_STATUS.CONFLICT);
      }

      const details = await tx.deliveryAgentPayoutDetails.upsert({
        where: { deliveryAgentId: agent.id },
        create: {
          deliveryAgentId: agent.id,
          upiId: normalizedUpiId,
          accountHolderName: normalizedAccountHolderName,
          verificationStatus: "PENDING",
          submittedAt: now,
        },
        update: {
          upiId: normalizedUpiId,
          accountHolderName: normalizedAccountHolderName,
          verificationStatus: "PENDING",
          rejectionReason: null,
          submittedAt: now,
          reviewedAt: null,
          reviewedBy: null,
        },
      });
      return publicPayoutDetails(details);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") {
      throw new AppError("Payout details changed in another request. Refresh and try again.", HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
};

/** Load only data already associated with this authenticated agent. */
export const getDeliveryAgentDashboard = async (database, userId, now = new Date()) => {
  const agent = await getAgentWorkContext(database, userId);
  const readiness = getDeliveryAgentReadiness(agent, now);
  const startOfTodayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [completedToday, activeDeliveries] = await Promise.all([
    database.order.findMany({
      where: {
        deliveryAgentId: agent.id,
        status: "DELIVERED",
        updatedAt: { gte: startOfTodayUtc },
      },
      select: { deliveryEarning: true },
    }),
    database.order.findMany({
      where: {
        deliveryAgentId: agent.id,
        status: { in: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 1,
      select: {
        id: true,
        orderNumber: true,
        cookName: true,
        status: true,
        updatedAt: true,
        items: { select: { name: true, quantity: true } },
      },
    }),
  ]);
  const earningsPaise = completedToday.reduce((total, order) => total + decimalToPaise(order.deliveryEarning), 0n);

  return {
    agent: {
      id: agent.id,
      name: agent.user.name,
      verificationStatus: agent.verificationStatus,
      isOnline: readiness.readyToWork && agent.isAvailable,
    },
    readiness,
    metrics: {
      completedDeliveriesToday: completedToday.length,
      deliveryFeesEarnedToday: Number(earningsPaise) / 100,
      waitingForPayout: null,
      payoutTrackingAvailable: false,
      availableDeliveriesCount: null,
    },
    currentDelivery: activeDeliveries[0] || null,
    capabilities: {
      deliveryAssignmentAvailable: true,
      earningsAvailable: true,
      payoutTrackingAvailable: false,
      notificationsAvailable: false,
    },
  };
};

const deliveryOrderInclude = {
  items: { select: { id: true, name: true, quantity: true } },
  cook: { select: { id: true, businessName: true, user: { select: { name: true, phone: true } } } },
  checkout: { select: { addressSnapshot: true, paymentMethod: true } },
  address: { select: { recipientName: true, phone: true, addressLine1: true, addressLine2: true, locality: true, city: true, state: true, pincode: true, landmark: true } },
};

const availableDeliveryOrderInclude = {
  ...deliveryOrderInclude,
  items: { select: { id: true, name: true, quantity: true, dishImage: true } },
};

const historyDeliveryOrderInclude = {
  ...availableDeliveryOrderInclude,
  statusHistory: { where: { toStatus: "DELIVERED" }, orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 1, select: { changedAt: true } },
};

const serializeDeliveryOrder = (order, includeAddress = false) => {
  const snapshot = order.checkout?.addressSnapshot;
  const address = includeAddress
    ? (snapshot && typeof snapshot === "object" ? snapshot : order.address)
    : undefined;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.checkout?.paymentMethod || null,
    paymentStatus: order.paymentStatus,
    cookName: order.cookName || order.cook?.businessName || "Home kitchen",
    cookPhone: order.cook?.user?.phone || null,
    deliveryFee: currencyNumber(order.deliveryFee),
    deliveryEarning: currencyNumber(order.deliveryEarning),
    items: order.items || [],
    ...(address && { deliveryAddress: address }),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

const requireReadyOnlineAgent = async (database, userId) => {
  const agent = await getAgentWorkContext(database, userId);
  const readiness = getDeliveryAgentReadiness(agent);
  if (!readiness.readyToWork) {
    throw new AppError("Complete all approved delivery-work requirements before accessing deliveries.", HTTP_STATUS.CONFLICT,
      readiness.pendingRequirements.map(({ id, label, action }) => ({ id, label, message: action })));
  }
  if (!agent.isAvailable) throw new AppError("Go online before claiming a delivery.", HTTP_STATUS.CONFLICT);
  return agent;
};

/** Existing Order fields support assignment and delivery status tracking without schema changes. */
export const createDeliveryWorkService = (database, now = () => new Date(), emailSender = sendEmailJob) => ({
  async listAvailable(userId) {
    const agent = await requireReadyOnlineAgent(database, userId);
    const orders = await database.order.findMany({
      where: { status: "READY_FOR_PICKUP", deliveryAgentId: null, paymentStatus: { in: ["PENDING", "PAID"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      include: availableDeliveryOrderInclude,
    });
    return orders.map((order) => ({ ...serializeDeliveryOrder(order),
      totalAmount: currencyNumber(order.totalAmount),
      deliveryArea: order.checkout?.addressSnapshot?.locality || order.address?.locality || null,
      deliveryCity: order.checkout?.addressSnapshot?.city || order.address?.city || null }));
  },

  async claim(userId, orderId) {
    return database.$transaction(async (tx) => {
      const agent = await requireReadyOnlineAgent(tx, userId);
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: "READY_FOR_PICKUP", deliveryAgentId: null, paymentStatus: { in: ["PENDING", "PAID"] } },
        data: { deliveryAgentId: agent.id },
      });
      if (updated.count !== 1) throw new AppError("This delivery is no longer available. Refresh the list.", HTTP_STATUS.CONFLICT);
      const order = await tx.order.findFirst({ where: { id: orderId, deliveryAgentId: agent.id }, include: deliveryOrderInclude });
      if (!order) throw new AppError("The claimed delivery could not be confirmed.", HTTP_STATUS.CONFLICT);
      await notifyDeliveryAgentAssigned(tx, { order, deliveryAgentUserId: agent.userId });
      return serializeDeliveryOrder(order, true);
    }, { isolationLevel: "Serializable" });
  },

  async listCurrent(userId) {
    const agent = await getAgentWorkContext(database, userId);
    const orders = await database.order.findMany({
      where: { deliveryAgentId: agent.id, status: { in: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"] } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      include: availableDeliveryOrderInclude,
    });
    return orders.map((order) => ({
      ...serializeDeliveryOrder(order, true),
      totalAmount: currencyNumber(order.totalAmount),
    }));
  },

  async transition(userId, orderId, fromStatus, toStatus) {
    if (toStatus === "DELIVERED") {
      throw new AppError("Verify the customer's email code before completing this delivery.", HTTP_STATUS.CONFLICT);
    }
    return database.$transaction(async (tx) => {
      const agent = await getAgentWorkContext(tx, userId);
      const historyTable = await tx.$queryRaw`
        SELECT to_regclass('public."OrderStatusHistory"') IS NOT NULL AS available
      `;
      if (historyTable?.[0]?.available !== true) {
        throw new AppError("Order status tracking is unavailable until migration 20261016110000_add_order_status_history is applied.", HTTP_STATUS.SERVICE_UNAVAILABLE);
      }
      const order = await tx.order.findFirst({
        where: { id: orderId, deliveryAgentId: agent.id },
        select: { id: true, customerId: true, cookId: true, orderNumber: true, status: true },
      });
      if (!order) throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
      if (order.status !== fromStatus) throw new AppError("This delivery must be " + fromStatus.replaceAll("_", " ") + " before it can be " + toStatus.replaceAll("_", " ") + ".", HTTP_STATUS.CONFLICT);
      const updated = await tx.order.updateMany({ where: { id: orderId, deliveryAgentId: agent.id, status: fromStatus }, data: { status: toStatus } });
      if (updated.count !== 1) throw new AppError("Delivery status changed in another request. Refresh and try again.", HTTP_STATUS.CONFLICT);
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus, toStatus, changedAt: now() } });
      await notifyOrderStatusChanged(tx, { order, fromStatus, toStatus });
      const agentNotice = toStatus === "OUT_FOR_DELIVERY"
        ? {
            kind: "DELIVERY_PICKED_UP",
            title: "Pickup confirmed",
            message: "pickup was confirmed and the delivery is now out for delivery.",
            eventKeySuffix: "picked-up",
          }
        : toStatus === "DELIVERED"
          ? {
              kind: "DELIVERY_COMPLETED",
              title: "Delivery completed",
              message: "the delivery was marked delivered.",
              eventKeySuffix: "delivered",
            }
          : null;
      if (agentNotice) {
        await notifyDeliveryAgentOrderEvent(tx, {
          order,
          deliveryAgentUserId: agent.userId,
          ...agentNotice,
        });
      }
      const result = await tx.order.findFirst({ where: { id: orderId, deliveryAgentId: agent.id }, include: deliveryOrderInclude });
      return serializeDeliveryOrder(result, true);
    }, { isolationLevel: "Serializable" });
  },

  async requestCompletionOtp(userId, orderId) {
    const agent = await getAgentWorkContext(database, userId);
    const currentTime = now();
    const otp = String(crypto.randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);
    const generationId = crypto.randomUUID();
    const expiresAt = new Date(currentTime.getTime() + DELIVERY_OTP_TTL_MS);
    const resendAllowedAt = new Date(currentTime.getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS);

    const delivery = await database.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, deliveryAgentId: agent.id },
        select: { id: true, orderNumber: true, status: true, customer: { select: { name: true, email: true } } },
      });
      if (!order) throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
      if (order.status !== "OUT_FOR_DELIVERY") {
        throw new AppError("Only an order that is out for delivery can be completed.", HTTP_STATUS.CONFLICT);
      }
      const email = order.customer?.email?.trim().toLowerCase();
      if (!email) throw new AppError("The customer does not have a registered email address for delivery verification.", HTTP_STATUS.CONFLICT);

      const previous = await tx.deliveryCompletionOtp.findUnique({ where: { orderId } });
      if (previous && previous.deliveryAgentId !== agent.id) {
        throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
      }
      if (previous?.resendAllowedAt && previous.resendAllowedAt > currentTime) {
        const retryAfterSeconds = Math.ceil((previous.resendAllowedAt.getTime() - currentTime.getTime()) / 1000);
        throw deliveryOtpError("Please wait before requesting another verification email.", HTTP_STATUS.TOO_MANY_REQUESTS, retryAfterSeconds);
      }

      const otpRecord = await tx.deliveryCompletionOtp.upsert({
        where: { orderId },
        create: { orderId, deliveryAgentId: agent.id, otpHash, generationId, expiresAt, attempts: 0, resendAllowedAt, consumedAt: null, emailStatus: "PENDING", emailSentAt: null },
        update: { deliveryAgentId: agent.id, otpHash, generationId, expiresAt, attempts: 0, resendAllowedAt, consumedAt: null, emailStatus: "PENDING", emailSentAt: null },
        select: { id: true },
      });
      return { email, name: order.customer.name, orderNumber: order.orderNumber, otpRecordId: otpRecord.id };
    }, { isolationLevel: "Serializable" });

    try {
      const dispatchResult = await emailSender({
        type: "DELIVERY_COMPLETION_OTP",
        to: delivery.email,
        name: delivery.name,
        orderNumber: delivery.orderNumber,
        orderId,
        generationId,
        otp,
        expiresInMinutes: 10,
      });
      if (dispatchResult?.success !== true) {
        throw new Error("Delivery verification email was not accepted by the email service.");
      }
      const emailStatus = "SMTP_ACCEPTED";
      await database.deliveryCompletionOtp.updateMany({
        where: { id: delivery.otpRecordId, generationId, emailStatus: "PENDING" },
        data: { emailStatus, ...(emailStatus === "SMTP_ACCEPTED" ? { emailSentAt: now() } : {}) },
      });
      return {
        emailStatus,
        emailHint: maskEmailAddress(delivery.email),
        expiresInSeconds: Math.floor(DELIVERY_OTP_TTL_MS / 1000),
        resendAfterSeconds: Math.floor(DELIVERY_OTP_RESEND_COOLDOWN_MS / 1000),
      };
    } catch {
      await database.deliveryCompletionOtp.updateMany({
        where: { id: delivery.otpRecordId, generationId },
        data: { consumedAt: now(), expiresAt: now(), emailStatus: "FAILED" },
      });
      throw deliveryOtpError("The verification email could not be sent. Please try again.", HTTP_STATUS.SERVICE_UNAVAILABLE);
    }
  },

  async getCompletionOtpStatus(userId, orderId) {
    const agent = await getAgentWorkContext(database, userId);
    const order = await database.order.findFirst({
      where: { id: orderId, deliveryAgentId: agent.id },
      select: { id: true, customer: { select: { email: true } } },
    });
    if (!order) throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
    const otpRecord = await database.deliveryCompletionOtp.findUnique({ where: { orderId } });
    if (!otpRecord || otpRecord.deliveryAgentId !== agent.id) throw new AppError("Verification request not found.", HTTP_STATUS.NOT_FOUND);
    return {
      emailStatus: otpRecord.emailStatus,
      emailHint: maskEmailAddress(order.customer?.email),
      expiresAt: otpRecord.expiresAt,
      resendAfterSeconds: otpRecord.resendAllowedAt && otpRecord.resendAllowedAt > now()
        ? Math.ceil((otpRecord.resendAllowedAt.getTime() - now().getTime()) / 1000)
        : 0,
    };
  },

  async markDeliveryCompleted(userId, orderId, submittedOtp) {
    const agent = await getAgentWorkContext(database, userId);
    const currentTime = now();
    const outcome = await database.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, deliveryAgentId: agent.id },
        select: { id: true, customerId: true, cookId: true, orderNumber: true, status: true },
      });
      if (!order) throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
      if (order.status !== "OUT_FOR_DELIVERY") {
        throw new AppError("This delivery is no longer awaiting completion.", HTTP_STATUS.CONFLICT);
      }
      const otpRecord = await tx.deliveryCompletionOtp.findUnique({ where: { orderId } });
      if (!otpRecord || otpRecord.deliveryAgentId !== agent.id || otpRecord.consumedAt) {
        return { error: DELIVERY_OTP_INVALID_MESSAGE, statusCode: HTTP_STATUS.BAD_REQUEST };
      }
      if (otpRecord.expiresAt <= currentTime) {
        await tx.deliveryCompletionOtp.updateMany({
          where: { id: otpRecord.id, generationId: otpRecord.generationId, consumedAt: null },
          data: { consumedAt: currentTime },
        });
        return { error: "This verification code has expired. Request a new code.", statusCode: HTTP_STATUS.BAD_REQUEST };
      }
      if (otpRecord.attempts >= DELIVERY_OTP_ATTEMPT_LIMIT) {
        return { error: "Too many incorrect codes. Request a new verification email.", statusCode: HTTP_STATUS.TOO_MANY_REQUESTS };
      }

      const matches = await bcrypt.compare(submittedOtp, otpRecord.otpHash);
      if (!matches) {
        const nextAttempts = otpRecord.attempts + 1;
        await tx.deliveryCompletionOtp.updateMany({
          where: { id: otpRecord.id, generationId: otpRecord.generationId, consumedAt: null, attempts: otpRecord.attempts },
          data: { attempts: nextAttempts, ...(nextAttempts >= DELIVERY_OTP_ATTEMPT_LIMIT ? { consumedAt: currentTime } : {}) },
        });
        return {
          error: nextAttempts >= DELIVERY_OTP_ATTEMPT_LIMIT ? "Too many incorrect codes. Request a new verification email." : "That code is incorrect. Check the customer's email and try again.",
          statusCode: nextAttempts >= DELIVERY_OTP_ATTEMPT_LIMIT ? HTTP_STATUS.TOO_MANY_REQUESTS : HTTP_STATUS.BAD_REQUEST,
        };
      }

      const consumed = await tx.deliveryCompletionOtp.updateMany({
        where: {
          id: otpRecord.id,
          deliveryAgentId: agent.id,
          generationId: otpRecord.generationId,
          otpHash: otpRecord.otpHash,
          consumedAt: null,
          expiresAt: { gt: currentTime },
          attempts: { lt: DELIVERY_OTP_ATTEMPT_LIMIT },
        },
        data: { consumedAt: currentTime },
      });
      if (consumed.count !== 1) {
        return { error: "This verification code has already been used. Refresh the delivery and try again.", statusCode: HTTP_STATUS.CONFLICT };
      }

      const historyTable = await tx.$queryRaw`SELECT to_regclass('public."OrderStatusHistory"') IS NOT NULL AS available`;
      if (historyTable?.[0]?.available !== true) {
        throw new AppError("Order status tracking is unavailable until its migration is applied.", HTTP_STATUS.SERVICE_UNAVAILABLE);
      }
      const updated = await tx.order.updateMany({
        where: { id: orderId, deliveryAgentId: agent.id, status: "OUT_FOR_DELIVERY" },
        data: { status: "DELIVERED" },
      });
      if (updated.count !== 1) throw new AppError("Delivery status changed in another request. Refresh and try again.", HTTP_STATUS.CONFLICT);
      await tx.orderStatusHistory.create({ data: { orderId, fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED", changedAt: currentTime } });
      await notifyOrderStatusChanged(tx, { order, fromStatus: "OUT_FOR_DELIVERY", toStatus: "DELIVERED" });
      await notifyDeliveryAgentOrderEvent(tx, {
        order,
        deliveryAgentUserId: agent.userId,
        kind: "DELIVERY_COMPLETED",
        title: "Delivery completed",
        message: "the delivery was marked delivered.",
        eventKeySuffix: "delivered",
      });
      const result = await tx.order.findFirst({ where: { id: orderId, deliveryAgentId: agent.id }, include: deliveryOrderInclude });
      return { order: serializeDeliveryOrder(result, true) };
    }, { isolationLevel: "Serializable" });
    if (outcome.error) throw deliveryOtpError(outcome.error, outcome.statusCode);
    return outcome.order;
  },

  async confirmCodCollection(userId, orderId) {
    return database.$transaction(async (tx) => {
      const agent = await getAgentWorkContext(tx, userId);
      const order = await tx.order.findFirst({
        where: { id: orderId, deliveryAgentId: agent.id },
        include: deliveryOrderInclude,
      });
      if (!order) throw new AppError("Assigned delivery not found.", HTTP_STATUS.NOT_FOUND);
      if (order.checkout?.paymentMethod !== "COD") {
        throw new AppError("Cash collection can only be confirmed for a COD order.", HTTP_STATUS.CONFLICT);
      }
      if (order.status !== "DELIVERED") {
        throw new AppError("Mark this delivery as delivered before confirming COD collection.", HTTP_STATUS.CONFLICT);
      }
      // A retry after a successful collection is safe and does not create another record.
      if (order.paymentStatus === "PAID") return serializeDeliveryOrder(order, true);
      if (order.paymentStatus !== "PENDING") {
        throw new AppError("This COD payment cannot be collected in its current state.", HTTP_STATUS.CONFLICT);
      }

      const updated = await tx.order.updateMany({
        where: {
          id: orderId,
          deliveryAgentId: agent.id,
          status: "DELIVERED",
          paymentStatus: "PENDING",
        },
        data: { paymentStatus: "PAID" },
      });
      if (updated.count !== 1) {
        const latest = await tx.order.findFirst({
          where: { id: orderId, deliveryAgentId: agent.id },
          include: deliveryOrderInclude,
        });
        if (latest?.checkout?.paymentMethod === "COD" && latest.status === "DELIVERED" && latest.paymentStatus === "PAID") {
          return serializeDeliveryOrder(latest, true);
        }
        throw new AppError("COD payment status changed in another request. Refresh and try again.", HTTP_STATUS.CONFLICT);
      }

      await notifyDeliveryAgentOrderEvent(tx, {
        order,
        deliveryAgentUserId: agent.userId,
        kind: "COD_COLLECTION_RECORDED",
        title: "COD collection recorded",
        message: "cash-on-delivery collection was recorded.",
        eventKeySuffix: "cod-collected",
      });

      const result = await tx.order.findFirst({
        where: { id: orderId, deliveryAgentId: agent.id },
        include: deliveryOrderInclude,
      });
      return serializeDeliveryOrder(result, true);
    });
  },

  async listHistory(userId) {
    const agent = await getAgentWorkContext(database, userId);
    const orders = await database.order.findMany({
      where: { deliveryAgentId: agent.id, status: { in: ["DELIVERED", "CANCELLED"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 100,
      include: historyDeliveryOrderInclude,
    });
    return orders.map((order) => ({
      ...serializeDeliveryOrder(order, true),
      deliveredAt: order.statusHistory?.[0]?.changedAt || null,
    }));
  },

  async getEarnings(userId) {
    const agent = await getAgentWorkContext(database, userId);
    const where = { deliveryAgentId: agent.id, status: "DELIVERED" };
    const [orders, aggregate] = await Promise.all([database.order.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        cookName: true,
        deliveryEarning: true,
        createdAt: true,
        updatedAt: true,
        cook: { select: { businessName: true } },
        items: { select: { id: true, name: true, quantity: true, dishImage: true } },
        statusHistory: { where: { toStatus: "DELIVERED" }, orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 1, select: { changedAt: true } },
      },
    }), database.order.aggregate({ where, _sum: { deliveryEarning: true } })]);
    const totalPaise = decimalToPaise(aggregate?._sum?.deliveryEarning ?? 0);
    return { totalEarned: Number(totalPaise) / 100, deliveries: orders.map((order) => ({
      id: order.id, orderNumber: order.orderNumber, amount: currencyNumber(order.deliveryEarning),
      orderDate: order.createdAt, completedAt: order.updatedAt,
      deliveredAt: order.statusHistory?.[0]?.changedAt || null,
      cookName: order.cookName || order.cook?.businessName || null,
      items: order.items || [],
    })), note: "These are delivery fees accrued for completed orders; TasteBridge has not recorded payout settlement." };
  },
});

const deliveryWorkService = createDeliveryWorkService(prisma);

/** Persist the online switch only after rechecking readiness in the backend. */
export const setDeliveryAgentAvailability = async (database, userId, isAvailable) => {
  if (!isAvailable) {
    const agent = await database.deliveryAgent.findUnique({ where: { userId }, select: { id: true } });
    if (!agent) throw new AppError("Delivery-agent profile not found.", HTTP_STATUS.NOT_FOUND);
    await database.deliveryAgent.updateMany({ where: { id: agent.id, userId }, data: { isAvailable: false } });
    return { isAvailable: false };
  }

  return database.$transaction(async (tx) => {
    const agent = await getAgentWorkContext(tx, userId);
    const readiness = getDeliveryAgentReadiness(agent);
    if (!readiness.readyToWork) {
      throw new AppError(
        "You cannot go online until all delivery work requirements are approved.",
        HTTP_STATUS.CONFLICT,
        readiness.pendingRequirements.map(({ id, label, action }) => ({ id, label, message: action })),
      );
    }
    const updated = await tx.deliveryAgent.updateMany({
      where: { id: agent.id, userId, verificationStatus: "APPROVED" },
      data: { isAvailable: true },
    });
    if (updated.count !== 1) {
      throw new AppError("Your delivery-agent profile changed. Refresh and try again.", HTTP_STATUS.CONFLICT);
    }
    return { isAvailable: true };
  }, { isolationLevel: "Serializable" });
};

// Helper to safely parse extra metadata stored in Address landmark
const parseMetadata = (landmarkStr) => {
  if (!landmarkStr) return {};
  try {
    return JSON.parse(landmarkStr);
  } catch {
    return {};
  }
};

export const deliveryAgentService = {
  async getPanelDashboard(userId) {
    return getDeliveryAgentDashboard(prisma, userId);
  },

  async updateAvailability(userId, isAvailable) {
    return setDeliveryAgentAvailability(prisma, userId, isAvailable);
  },

  async submitPayoutDetails(userId, upiId, accountHolderName) {
    return submitDeliveryAgentPayoutDetails(prisma, userId, upiId, accountHolderName);
  },

  async listAvailableDeliveries(userId) { return deliveryWorkService.listAvailable(userId); },
  async claimDelivery(userId, orderId) { return deliveryWorkService.claim(userId, orderId); },
  async listCurrentDeliveries(userId) { return deliveryWorkService.listCurrent(userId); },
  async markDeliveryPickedUp(userId, orderId) { return deliveryWorkService.transition(userId, orderId, "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"); },
  async requestDeliveryCompletionOtp(userId, orderId) { return deliveryWorkService.requestCompletionOtp(userId, orderId); },
  async getDeliveryCompletionOtpStatus(userId, orderId) { return deliveryWorkService.getCompletionOtpStatus(userId, orderId); },
  async markDeliveryCompleted(userId, orderId, otp) { return deliveryWorkService.markDeliveryCompleted(userId, orderId, otp); },
  async confirmCodCollection(userId, orderId) { return deliveryWorkService.confirmCodCollection(userId, orderId); },
  async listDeliveryHistory(userId) { return deliveryWorkService.listHistory(userId); },
  async getDeliveryEarnings(userId) { return deliveryWorkService.getEarnings(userId); },

  /**
   * Get current applicant's delivery agent registration and application status
   */
  async getDeliveryAgentApplication(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        verificationDocuments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
    }

    const deliveryAgent = await prisma.deliveryAgent.findUnique({
      where: { userId },
      include: { payoutDetails: true },
    });

    // Find applicant's address record
    const address = await prisma.address.findFirst({
      where: {
        userId,
        OR: [{ label: "DELIVERY_AGENT" }, { isDefault: true }],
      },
      orderBy: { createdAt: "desc" },
    });

    const meta = parseMetadata(address?.landmark);

    let application = null;
    if (deliveryAgent) {
      application = {
        id: deliveryAgent.id,
        userId: deliveryAgent.userId,
        verificationStatus: deliveryAgent.verificationStatus,
        isAvailable: deliveryAgent.isAvailable,
        vehicleType: deliveryAgent.vehicleType,
        licenseNumber: deliveryAgent.licenseNumber,
        deliveryType: meta.deliveryType || (deliveryAgent.vehicleType?.includes("Bicycle") ? "BICYCLE" : deliveryAgent.vehicleType?.includes("Walking") ? "WALKING" : "TWO_WHEELER"),
        rawVehicleType: meta.vehicleType || deliveryAgent.vehicleType,
        vehicleNumber: meta.vehicleNumber || null,
        dateOfBirth: meta.dateOfBirth || null,
        gender: meta.gender || null,
        emergencyContactName: address?.recipientName || meta.emergencyContactName || null,
        emergencyContactPhone: address?.phone || meta.emergencyContactPhone || null,
        createdAt: deliveryAgent.createdAt,
        updatedAt: deliveryAgent.updatedAt,
        payoutDetails: publicPayoutDetails(deliveryAgent.payoutDetails),
        address: address
          ? {
              id: address.id,
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2,
              locality: address.locality,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
            }
          : null,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          verificationDocuments: (user.verificationDocuments || []).map((d) => ({
            ...d,
            downloadUrl: `/api/v1/delivery-agents/documents/${d.id}`,
          })),
        },
      };
    }

    return {
      userRole: user.role,
      hasApplication: Boolean(deliveryAgent),
      application,
    };
  },

  /**
   * Submit or resubmit delivery agent registration with uploaded documents
   */
  async submitDeliveryAgentApplication(userId, applicationData, files = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        deliveryAgent: true,
        verificationDocuments: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
    }

    // Role check: If already approved DELIVERY_AGENT, prevent duplicate submission
    if (user.deliveryAgent?.verificationStatus === "APPROVED") {
      throw new AppError(
        "You are already an approved delivery partner on TasteBridge.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Duplicate check: If existing registration is PENDING review, prevent duplicate submission
    if (user.deliveryAgent && user.deliveryAgent.verificationStatus === "PENDING") {
      throw new AppError(
        "Your delivery partner registration is already under review by the operations team.",
        HTTP_STATUS.CONFLICT
      );
    }

    // 1. Validate required Government Identity Proof file
    const identityFile = files?.identityProof?.[0];
    const existingIdentityDoc = user.verificationDocuments.find(
      (d) => d.documentType === "IDENTITY_PROOF"
    );
    if (!identityFile && !existingIdentityDoc) {
      throw new AppError(
        "A government-issued identity proof document (Aadhaar, PAN, Voter ID, or Passport) is required.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 2. Validate conditional Driving License and Vehicle RC for motorized delivery
    const isTwoWheeler = applicationData.deliveryType === "TWO_WHEELER";
    const dlFile = files?.drivingLicense?.[0];
    const existingDlDoc = user.verificationDocuments.find(
      (d) => d.documentType === "DRIVING_LICENSE"
    );

    if (isTwoWheeler && !dlFile && !existingDlDoc) {
      throw new AppError(
        "A valid driving license document is required for two-wheeler delivery.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const rcFile = files?.vehicleRegistration?.[0];
    const existingRcDoc = user.verificationDocuments.find(
      (d) => d.documentType === "VEHICLE_REGISTRATION"
    );

    if (isTwoWheeler && !rcFile && !existingRcDoc) {
      throw new AppError(
        "A vehicle registration certificate (RC) is required for two-wheeler delivery.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Update user's name or phone if provided and changed
    const userUpdates = {};
    if (applicationData.fullName && applicationData.fullName.trim() !== user.name) {
      userUpdates.name = applicationData.fullName.trim();
    }
    if (applicationData.phone && applicationData.phone.trim() !== (user.phone || "")) {
      userUpdates.phone = applicationData.phone.trim();
    }
    if (Object.keys(userUpdates).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdates,
      });
    }

    // Pack metadata for storage in Address landmark
    const metadataPayload = JSON.stringify({
      deliveryType: applicationData.deliveryType,
      vehicleType: applicationData.vehicleType || applicationData.deliveryType,
      vehicleNumber: isTwoWheeler ? applicationData.vehicleNumber?.trim() : null,
      dateOfBirth: applicationData.dateOfBirth,
      gender: applicationData.gender || null,
      emergencyContactName: applicationData.emergencyContactName.trim(),
      emergencyContactPhone: applicationData.emergencyContactPhone.trim(),
      consentAgreed: true,
      consentAgreedAt: new Date().toISOString(),
    });

    // Upsert or create Address record for delivery partner
    const existingAddress = await prisma.address.findFirst({
      where: { userId, label: "DELIVERY_AGENT" },
    });

    const addressData = {
      userId,
      label: "DELIVERY_AGENT",
      recipientName: applicationData.emergencyContactName.trim(),
      phone: applicationData.emergencyContactPhone.trim(),
      addressLine1: applicationData.addressLine1.trim(),
      locality: applicationData.locality.trim(),
      city: applicationData.city.trim(),
      state: applicationData.state.trim(),
      pincode: applicationData.pincode.trim(),
      landmark: metadataPayload,
      isDefault: true,
    };

    if (existingAddress) {
      await prisma.address.update({
        where: { id: existingAddress.id },
        data: addressData,
      });
    } else {
      await prisma.address.create({
        data: addressData,
      });
    }

    // Build human-friendly vehicleType string for DeliveryAgent table
    let vehicleDisplay = "Two-wheeler";
    if (applicationData.deliveryType === "BICYCLE") {
      vehicleDisplay = "Bicycle";
    } else if (applicationData.deliveryType === "WALKING") {
      vehicleDisplay = "Walking";
    } else if (applicationData.vehicleType && applicationData.vehicleNumber) {
      vehicleDisplay = `${applicationData.vehicleType.trim()} (${applicationData.vehicleNumber.trim()})`;
    } else if (applicationData.vehicleType) {
      vehicleDisplay = applicationData.vehicleType.trim();
    }

    // Upsert DeliveryAgent record in PENDING verification state
    const deliveryAgent = await prisma.deliveryAgent.upsert({
      where: { userId },
      update: {
        vehicleType: vehicleDisplay,
        licenseNumber: isTwoWheeler ? applicationData.licenseNumber?.trim() || null : null,
        verificationStatus: "PENDING",
        isAvailable: false,
      },
      create: {
        userId,
        vehicleType: vehicleDisplay,
        licenseNumber: isTwoWheeler ? applicationData.licenseNumber?.trim() || null : null,
        verificationStatus: "PENDING",
        isAvailable: false,
      },
    });

    // Helper for uploading or replacing private verification documents
    const uploadDocument = async (file, docType, docNumber = null) => {
      if (!file) return;

      // Find and remove any old pending document of this type
      const oldDoc = await prisma.verificationDocument.findFirst({
        where: { userId, documentType: docType, verificationStatus: "PENDING" },
      });

      if (oldDoc?.cloudinaryPublicId) {
        await cloudinaryService
          .deleteCloudinaryAsset(oldDoc.cloudinaryPublicId, oldDoc.resourceType || "raw", "authenticated")
          .catch(() => {});
      }

      await prisma.verificationDocument.deleteMany({
        where: { userId, documentType: docType, verificationStatus: "PENDING" },
      });

      // Upload to private Cloudinary storage
      const uploadRes = await cloudinaryService.uploadPrivateDocument({
        fileBuffer: file.buffer,
        fileName: file.originalname,
        userId,
        documentType: docType,
        mimeType: file.mimetype,
      });

      return prisma.verificationDocument.create({
        data: {
          userId,
          documentType: docType,
          documentUrl: uploadRes.secureUrl,
          cloudinaryPublicId: uploadRes.publicId,
          resourceType: uploadRes.resourceType,
          storageProvider: "CLOUDINARY",
          documentNumber: docNumber,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          verificationStatus: "PENDING",
        },
      });
    };

    // 1. Identity proof
    if (identityFile) {
      await uploadDocument(identityFile, "IDENTITY_PROOF", applicationData.identityDocumentNumber || null);
    }

    // 2. Driving license (motorized only)
    if (dlFile) {
      await uploadDocument(dlFile, "DRIVING_LICENSE", applicationData.licenseNumber || null);
    }

    // 3. Vehicle RC (motorized only)
    if (rcFile) {
      await uploadDocument(rcFile, "VEHICLE_REGISTRATION", applicationData.vehicleNumber || null);
    }

    // 4. Optional address proof
    const addressFile = files?.addressProof?.[0];
    if (addressFile) {
      await uploadDocument(addressFile, "ADDRESS_PROOF");
    }

    // 5. Optional profile photo
    const photoFile = files?.profilePhoto?.[0];
    if (photoFile) {
      await uploadDocument(photoFile, "OTHER");
    }

    return this.getDeliveryAgentApplication(userId);
  },

  /**
   * Securely retrieve private verification document by ID
   */
  async getDocumentById(docId, user) {
    const doc = await prisma.verificationDocument.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      throw new AppError("Document not found", HTTP_STATUS.NOT_FOUND);
    }

    if (doc.userId !== user.id && user.role !== "ADMIN") {
      throw new AppError("You do not have permission to view this document", HTTP_STATUS.FORBIDDEN);
    }

    return doc;
  },
};
