import prisma from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { effectiveFssaiStatus, fssaiExpiryAtEndOfDay, fssaiExpiryDateIsFuture } from "../../utils/fssai.js";
import { currencyNumber, normalizeCurrency, normalizeRate, rupeesFromPaise, sumPaise, toPaise } from "../../utils/money.js";
import { assertReadyForPickupAvailable, recordOrderStatus } from "../orders/order-status-history.js";
import { notifyOrderStatusChanged } from "../notifications/order-lifecycle.producers.js";
import { fssaiReviewEventKey, notifyCookFssaiReview } from "../notifications/fssai-review.producers.js";
import { isValidDeliveryAgentPayoutDetails } from "../delivery-agent/delivery-agent.validation.js";
import { isCookEligibleToSell } from "../../utils/marketplaceSecurity.js";
import { createSocialReportingService } from "../cook/social-reporting.service.js";

export const assertAdminDishStatusTransition = (currentStatus, nextStatus) => {
  const allowed = (currentStatus === "PENDING_APPROVAL" && ["PUBLISHED", "REJECTED"].includes(nextStatus))
    || (currentStatus === "PUBLISHED" && nextStatus === "UNPUBLISHED");
  if (!allowed) {
    throw new AppError(
      currentStatus === "PENDING_APPROVAL"
        ? "Only a pending dish can be approved or rejected."
        : "Dish status changed. Refresh and choose a valid Admin review action.",
      HTTP_STATUS.CONFLICT
    );
  }
};

export const assertDishReadyForAdminApproval = (dish) => {
  if (dish.status !== "PENDING_APPROVAL") {
    throw new AppError("Only a dish awaiting Admin review can be approved.", HTTP_STATUS.CONFLICT);
  }
  if (!isCookEligibleToSell(dish.cook)) {
    throw new AppError("The Cook must meet current selling and food-safety requirements before approval.", HTTP_STATUS.CONFLICT);
  }
  let priceIsValid = false;
  try { priceIsValid = toPaise(dish.price) > 0n; } catch { priceIsValid = false; }
  if (!dish.name?.trim() || !dish.cuisine?.trim() || !dish.categoryId || !priceIsValid || !dish.story?.whoTaught?.trim() || !dish.story?.storyText?.trim() || dish.story.storyText.trim().length < 10) {
    throw new AppError("The dish must include its required recipe details and cultural story before approval.", HTTP_STATUS.CONFLICT);
  }
};

export const createAdminExperienceBookingsService = (database) => ({
  async list(type, { status, paymentStatus, search, page = 1, limit = 20 }) {
    if (!['HOME_DINING', 'WORKSHOP'].includes(type)) throw new AppError("Unsupported experience booking type.", HTTP_STATUS.BAD_REQUEST);
    const where = { experience: { is: { type } } };
    if (status) where.status = status;
    if (paymentStatus === "UNPAID") where.paymentAttempts = { none: {} };
    else if (paymentStatus) where.paymentAttempts = { some: { status: paymentStatus } };
    if (search) {
      where.OR = [
        { id: { contains: search, mode: "insensitive" } },
        { experience: { is: { title: { contains: search, mode: "insensitive" } } } },
        { experience: { is: { cook: { is: { businessName: { contains: search, mode: "insensitive" } } } } } },
        { customer: { is: { name: { contains: search, mode: "insensitive" } } } },
        { customer: { is: { email: { contains: search, mode: "insensitive" } } } },
      ];
    }
    const skip = (page - 1) * limit;
    const [total, bookings] = await Promise.all([
      database.experienceBooking.count({ where }),
      database.experienceBooking.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true, bookingDate: true, numberOfGuests: true, totalAmount: true,
          pricePerPersonSnapshot: true, totalAmountSnapshot: true, status: true,
          cancellationRequestedAt: true, cancellationReason: true, cancellationStatus: true,
          cancellationDecisionReason: true, cancellationDecidedAt: true, createdAt: true,
          experience: { select: { id: true, type: true, title: true, theme: true, cuisine: true, location: true, image: true, photos: true, pricePerPerson: true,
            menuItems: { orderBy: { sortOrder: "asc" }, select: { dish: { select: { name: true, image: true, cuisine: true } } } },
            cook: { select: { id: true, businessName: true, user: { select: { name: true } } } } },
          },
          customer: { select: { id: true, name: true, email: true } },
          slot: { select: { startsAt: true, endsAt: true } },
          paymentAttempts: { orderBy: [{ attemptNumber: "desc" }], take: 1, select: {
            amount: true, currency: true, status: true, provider: true, verificationMode: true,
            succeededAt: true, createdAt: true,
            refund: { select: { amount: true, currency: true, status: true, provider: true,
              verificationMode: true, succeededAt: true, createdAt: true } },
          } },
        },
      }),
    ]);
    return { bookings, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  },
});

export const createAdminWorkshopReviewService = (database, { now = () => new Date(), isCookEligible = isCookEligibleToSell } = {}) => ({
  async review(id, { action, rejectionReason }) {
    return database.$transaction(async (tx) => {
      const current = await tx.experience.findFirst({
        where: { id, type: "WORKSHOP", status: "PENDING" },
        include: { cook: { include: { user: true } }, slots: true },
      });
      if (!current) {
        throw new AppError("Only a pending workshop can be reviewed.", HTTP_STATUS.CONFLICT);
      }
      if (action === "APPROVE") {
        const complete = current.title?.trim()
          && current.theme?.trim()
          && current.description?.trim()
          && current.teachingContent?.trim()
          && current.learningOutcomes?.trim()
          && current.image
          && current.pricePerPerson > 0
          && current.publicArea?.trim()
          && current.privateAddress?.trim()
          && current.addressSource
          && current.slots?.some((slot) => slot.status === "OPEN" && slot.startsAt > now() && slot.endsAt > slot.startsAt && slot.availableSeats > 0 && slot.capacity > 0)
          && isCookEligible(current.cook, now());
        if (!complete) {
          throw new AppError("This workshop is missing required details, a valid image, an eligible Cook, or future available seats.", HTTP_STATUS.CONFLICT);
        }
      }
      const result = await tx.experience.updateMany({
        where: { id, type: "WORKSHOP", status: "PENDING" },
        data: action === "APPROVE"
          ? { status: "PUBLISHED", reviewRejectionReason: null }
          : { status: "REJECTED", reviewRejectionReason: rejectionReason.trim() },
      });
      if (result.count !== 1) {
        throw new AppError("Workshop status changed. Refresh the review queue and try again.", HTTP_STATUS.CONFLICT);
      }
      return tx.experience.findUnique({ where: { id }, include: { cook: { select: { businessName: true } }, slots: true } });
    }, { isolationLevel: "Serializable" });
  },
});

export const persistCookVerificationTransition = (
  prismaClient,
  cook,
  verificationStatus,
  updateData
) =>
  prismaClient.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: cook.userId },
      data: { role: verificationStatus === "APPROVED" ? "COOK" : "CUSTOMER" },
    });

    const updatedCook = await tx.cookProfile.update({
      where: { id: cook.id },
      data: updateData,
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, status: true },
        },
      },
    });

    if (verificationStatus === "APPROVED") {
      await tx.verificationDocument.updateMany({
        where: { userId: cook.userId, verificationStatus: "PENDING", documentType: { not: "FSSAI_LICENSE" } },
        data: { verificationStatus: "APPROVED" },
      });
    }

    return updatedCook;
  });

export const persistCookFssaiTransition = (prismaClient, cook, decision) =>
  prismaClient.$transaction(async (tx) => {
    if (!decision.documentId) {
      throw new AppError("Select an uploaded FSSAI document to review.", HTTP_STATUS.BAD_REQUEST);
    }
    if (decision.action !== "APPROVE" && !decision.rejectionReason?.trim()) {
      throw new AppError("A reason is required for this FSSAI decision.", HTTP_STATUS.BAD_REQUEST);
    }
    const nextStatus = decision.action === "APPROVE"
      ? "APPROVED"
      : decision.action === "REJECT"
        ? "REJECTED"
        : "NEEDS_REVISION";

    const expiryDate = decision.action === "APPROVE"
      ? fssaiExpiryAtEndOfDay(decision.fssaiExpiryDate)
      : null;
    if (decision.action === "APPROVE" && (!expiryDate || !fssaiExpiryDateIsFuture(decision.fssaiExpiryDate))) {
      throw new AppError("FSSAI certificate expiry must be a future date.", HTTP_STATUS.BAD_REQUEST);
    }

    if (decision.documentId) {
      const document = await tx.verificationDocument.findUnique({ where: { id: decision.documentId } });
      if (!document || document.userId !== cook.userId || document.documentType !== "FSSAI_LICENSE") {
        throw new AppError("FSSAI document not found for this cook.", HTTP_STATUS.NOT_FOUND);
      }
      const latestDocument = await tx.verificationDocument.findFirst({
        where: { userId: cook.userId, documentType: "FSSAI_LICENSE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (latestDocument?.id !== document.id || document.verificationStatus !== "PENDING") {
        throw new AppError("Only the latest pending FSSAI document can be reviewed.", HTTP_STATUS.CONFLICT);
      }
      if (decision.action === "APPROVE" && (
        !document.documentUrl || !document.cloudinaryPublicId ||
        !["application/pdf", "image/jpeg", "image/jpg", "image/png"].includes(document.mimeType)
      )) {
        throw new AppError("A valid uploaded FSSAI document is required for approval.", HTTP_STATUS.BAD_REQUEST);
      }
      const reviewedDocument = await tx.verificationDocument.updateMany({
        where: { id: document.id, verificationStatus: "PENDING" },
        data: {
          verificationStatus: nextStatus,
          rejectionReason: nextStatus === "APPROVED" ? null : decision.rejectionReason,
          ...(decision.action === "APPROVE" ? { expiryDate } : {}),
        },
      });
      if (reviewedDocument.count !== 1) {
        throw new AppError("This FSSAI document was reviewed by another administrator.", HTTP_STATUS.CONFLICT);
      }
    } else if (decision.action === "APPROVE") {
      throw new AppError("An FSSAI document is required for approval.", HTTP_STATUS.BAD_REQUEST);
    }

    const updateData = {
      fssaiStatus: nextStatus === "NEEDS_REVISION" ? "REJECTED" : nextStatus,
      isApprovedToSell: nextStatus === "APPROVED" ? cook.isApprovedToSell : false,
      fssaiRejectionReason: nextStatus === "APPROVED" ? null : decision.rejectionReason,
      ...(decision.fssaiStatusType && { fssaiStatusType: decision.fssaiStatusType }),
      ...(decision.action === "APPROVE" && decision.fssaiExpiryDate !== undefined
        ? { fssaiExpiryDate: expiryDate }
        : {}),
    };
    const updatedCook = await tx.cookProfile.update({ where: { id: cook.id }, data: updateData });

    const title = nextStatus === "APPROVED"
      ? "FSSAI verification approved"
      : nextStatus === "REJECTED"
        ? "FSSAI verification rejected"
        : "New FSSAI document requested";
    const message = nextStatus === "APPROVED"
      ? "Your FSSAI document has been approved."
      : `${nextStatus === "REJECTED" ? "Your FSSAI document was rejected" : "Please submit a new FSSAI document"}. Reason: ${decision.rejectionReason}`;

    const eventKey = fssaiReviewEventKey({ documentId: decision.documentId, status: nextStatus, cookUserId: cook.userId });

    await tx.cookNotification.create({
      data: {
        userId: cook.userId,
        type: "VERIFICATION_ALERT",
        title,
        message,
        metadata: {
          kind: "FSSAI_REVIEW",
          fssaiStatus: nextStatus === "NEEDS_REVISION" ? "REJECTED" : nextStatus,
          documentId: decision.documentId,
          eventKey,
        },
      },
    });
    await notifyCookFssaiReview(tx, {
      cookUserId: cook.userId,
      documentId: decision.documentId,
      status: nextStatus,
      title,
      message,
    });
    return updatedCook;
  });

export const persistDeliveryAgentVerificationTransition = (
  prismaClient,
  agent,
  verificationStatus
) =>
  prismaClient.$transaction(async (tx) => {
    const approved = verificationStatus === "APPROVED";

    await tx.user.update({
      where: { id: agent.userId },
      data: { role: approved ? "DELIVERY_AGENT" : "CUSTOMER" },
    });

    const updatedAgent = await tx.deliveryAgent.update({
      where: { id: agent.id },
      data: {
        verificationStatus,
        ...(!approved ? { isAvailable: false } : {}),
      },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, status: true } },
      },
    });

    if (approved) {
      await tx.verificationDocument.updateMany({
        where: { userId: agent.userId, verificationStatus: "PENDING", documentType: { not: "FSSAI_LICENSE" } },
        data: { verificationStatus: "APPROVED" },
      });
    }

    return updatedAgent;
  });

export const persistDeliveryAgentPayoutReview = async (database, deliveryAgentId, adminUserId, decision, now = new Date()) => {
  if (decision.action === "REJECT" && !decision.rejectionReason?.trim()) {
    throw new AppError("A rejection reason is required.", HTTP_STATUS.BAD_REQUEST);
  }
  try {
    return await database.$transaction(async (tx) => {
      const admin = await tx.user.findUnique({ where: { id: adminUserId }, select: { id: true, role: true, status: true } });
      if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
        throw new AppError("An active administrator is required to review payout details.", HTTP_STATUS.FORBIDDEN);
      }
      const existing = await tx.deliveryAgentPayoutDetails.findUnique({
        where: { deliveryAgentId },
        include: {
          deliveryAgent: {
            select: {
              userId: true,
              verificationStatus: true,
              user: { select: { role: true, status: true } },
            },
          },
        },
      });
      if (!existing) throw new AppError("Payout details not found.", HTTP_STATUS.NOT_FOUND);
      if (existing.deliveryAgent.userId === adminUserId) {
        throw new AppError("You cannot review your own payout details.", HTTP_STATUS.FORBIDDEN);
      }
      if (existing.deliveryAgent.verificationStatus !== "APPROVED"
        || existing.deliveryAgent.user.status !== "ACTIVE") {
        throw new AppError("The delivery-agent profile and account must remain approved and active during payout review.", HTTP_STATUS.CONFLICT);
      }
      if (existing.verificationStatus !== "PENDING") {
        throw new AppError("Only payout details awaiting review can be approved or rejected.", HTTP_STATUS.CONFLICT);
      }
      if (decision.action === "APPROVE" && !isValidDeliveryAgentPayoutDetails(existing)) {
        throw new AppError("A valid UPI ID and account holder name are required before approval.", HTTP_STATUS.CONFLICT);
      }

      const verificationStatus = decision.action === "APPROVE" ? "APPROVED" : "REJECTED";
      const changed = await tx.deliveryAgentPayoutDetails.updateMany({
        where: { id: existing.id, verificationStatus: "PENDING" },
        data: {
          verificationStatus,
          rejectionReason: verificationStatus === "REJECTED" ? decision.rejectionReason.trim() : null,
          reviewedAt: now,
          reviewedBy: adminUserId,
        },
      });
      if (changed.count !== 1) throw new AppError("Payout details were reviewed by another administrator.", HTTP_STATUS.CONFLICT);
      const reviewed = await tx.deliveryAgentPayoutDetails.findUnique({ where: { id: existing.id } });
      return reviewed;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") {
      throw new AppError("Payout details changed during review. Refresh and try again.", HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
};

export const persistMarkAllPlatformNotificationsAsRead = (database) =>
  database.platformNotification.updateMany({
    where: { isRead: false },
    data: { isRead: true },
  });

const orderStatusTransitions = Object.freeze({
  PENDING: new Set(["CONFIRMED", "CANCELLED"]),
  CONFIRMED: new Set(["PREPARING", "CANCELLED"]),
  PREPARING: new Set(["READY_FOR_PICKUP", "CANCELLED"]),
  READY_FOR_PICKUP: new Set(["OUT_FOR_DELIVERY"]),
  OUT_FOR_DELIVERY: new Set(["DELIVERED"]),
  DELIVERED: new Set(),
  CANCELLED: new Set(),
});

export const assertOrderStatusTransition = (currentStatus, nextStatus) => {
  if (!orderStatusTransitions[currentStatus]?.has(nextStatus)) {
    throw new AppError(`Order cannot transition from ${currentStatus} to ${nextStatus}.`, HTTP_STATUS.CONFLICT);
  }
};

export const cancelCheckoutOrders = async (tx, checkoutId, primaryOrderId, { actorCookId = null } = {}) => {
  const groupedOrders = await tx.order.findMany({
    where: { checkoutId },
    select: { id: true, customerId: true, cookId: true, orderNumber: true, status: true, paymentStatus: true, items: { select: { dishId: true, quantity: true } } },
  });
  if (!groupedOrders.length) throw new AppError("Checkout orders not found.", HTTP_STATUS.NOT_FOUND);
  // A checkout has one payment attempt for all cooks. Without a refund/reversal
  // operation, paid orders cannot be cancelled independently or as a group.
  if (groupedOrders.some((order) => order.paymentStatus === "PAID")) {
    throw new AppError("This paid mock checkout cannot be cancelled because refunds are not supported.", HTTP_STATUS.CONFLICT);
  }
  if (groupedOrders.every((order) => order.status === "CANCELLED")) {
    return tx.order.findUnique({ where: { id: primaryOrderId } });
  }
  // Reject partially cancelled or delivered groups instead of leaving sibling
  // orders and their shared checkout in contradictory states.
  if (groupedOrders.some((order) => order.status === "CANCELLED" || order.status === "DELIVERED" || !orderStatusTransitions[order.status]?.has("CANCELLED"))) {
    throw new AppError("All orders in this checkout must still be eligible for cancellation.", HTTP_STATUS.CONFLICT);
  }
  for (const groupedOrder of groupedOrders) {
    const changed = await tx.order.updateMany({
      where: { id: groupedOrder.id, status: groupedOrder.status },
      data: { status: "CANCELLED" },
    });
    if (changed.count !== 1) throw new AppError("The checkout changed while cancellation was being processed.", HTTP_STATUS.CONFLICT);
    await recordOrderStatus(tx, { orderId: groupedOrder.id, fromStatus: groupedOrder.status, toStatus: "CANCELLED" });
    await notifyOrderStatusChanged(tx, {
      order: groupedOrder,
      fromStatus: groupedOrder.status,
      toStatus: "CANCELLED",
      notifyCook: true,
      excludedCookId: actorCookId,
    });
    for (const item of groupedOrder.items) {
      if (item.dishId) await tx.dish.update({ where: { id: item.dishId }, data: { availableQuantity: { increment: item.quantity } } });
    }
  }
  return tx.order.findUnique({ where: { id: primaryOrderId } });
};

export const updateOrderStatusWithDatabase = async (database, id, { status, paymentStatus } = {}) => {
  if (paymentStatus !== undefined) {
    throw new AppError("Payment status cannot be changed through order status updates.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!status) throw new AppError("Order status is required.", HTTP_STATUS.BAD_REQUEST);
  return database.$transaction(async (tx) => {
    const current = await tx.order.findUnique({
      where: { id },
      select: { id: true, customerId: true, cookId: true, orderNumber: true, status: true, paymentStatus: true, checkoutId: true },
    });
    if (!current) throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
    if (current.status === "CANCELLED" && status === "CANCELLED") {
      return tx.order.findUnique({ where: { id } });
    }
    assertOrderStatusTransition(current.status, status);
    if (status === "READY_FOR_PICKUP") await assertReadyForPickupAvailable(tx);
    if (status === "CANCELLED" && current.paymentStatus === "PAID") {
      throw new AppError("Paid orders cannot be cancelled because refunds are not supported.", HTTP_STATUS.CONFLICT);
    }

    if (status === "CANCELLED" && current.checkoutId) {
      return cancelCheckoutOrders(tx, current.checkoutId, id);
    }

    const changed = await tx.order.updateMany({
      where: { id, status: current.status },
      data: { status },
    });
    if (changed.count !== 1) throw new AppError("The order changed while its status was being updated.", HTTP_STATUS.CONFLICT);
    await recordOrderStatus(tx, { orderId: id, fromStatus: current.status, toStatus: status });
    await notifyOrderStatusChanged(tx, { order: current, fromStatus: current.status, toStatus: status, actor: "ADMIN", notifyCook: true });
    return tx.order.findUnique({ where: { id } });
  }, { isolationLevel: "Serializable" });
};

export const adminService = {
  async listSocialReports(filters) {
    return createSocialReportingService(prisma).listReports(filters);
  },
  async moderateSocialReport(adminUserId, reportId, input) {
    return createSocialReportingService(prisma).moderateReport(adminUserId, reportId, input);
  },
  async getExperienceBookings(type, filters) {
    return createAdminExperienceBookingsService(prisma).list(type, filters);
  },
  // ==========================================
  // 1. DASHBOARD OVERVIEW
  // ==========================================
  async getDashboardStats() {
    const [
      customersCount,
      cooksCount,
      pendingCookVerificationsCount,
      deliveryAgentsCount,
      activeOrdersCount,
      completedOrdersCount,
      deliveredOrders,
      pendingIssuesCount,
      recentUsers,
      recentOrders,
      recentVerifications,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.user.count({ where: { role: "COOK" } }),
      prisma.cookProfile.count({ where: { verificationStatus: "PENDING" } }),
      prisma.user.count({ where: { role: "DELIVERY_AGENT" } }),
      prisma.order.count({
        where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"] } },
      }),
      prisma.order.count({ where: { status: "DELIVERED" } }),
      prisma.order.findMany({
        where: { status: "DELIVERED", paymentStatus: "PAID" },
        select: { totalAmount: true, platformFee: true, deliveryFee: true, cookEarning: true, deliveryEarning: true },
      }),
      prisma.review.count({ where: { isReported: true, status: "PUBLISHED" } }),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { name: true, email: true } },
          cook: { select: { businessName: true } },
          items: {
            orderBy: { createdAt: "asc" },
            select: { name: true, dishImage: true, dish: { select: { image: true } } },
          },
        },
      }),
      prisma.verificationDocument.findMany({
        where: { verificationStatus: "PENDING" },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true, role: true } } },
      }),
    ]);

    const totalRevenuePaise = deliveredOrders.reduce(
      (sum, order) => sum + toPaise(order.platformFee || 0) + toPaise(order.deliveryFee || 0),
      0n,
    );
    const totalGrossVolumePaise = sumPaise(deliveredOrders.map((order) => order.totalAmount || 0));

    return {
      stats: {
        customersCount,
        cooksCount,
        pendingCookVerificationsCount,
        deliveryAgentsCount,
        activeOrdersCount,
        completedOrdersCount,
        totalRevenue: currencyNumber(rupeesFromPaise(totalRevenuePaise)),
        totalGrossVolume: currencyNumber(rupeesFromPaise(totalGrossVolumePaise)),
        pendingIssuesCount,
      },
      recentActivity: {
        recentUsers,
        recentOrders,
        recentVerifications,
      },
    };
  },

  // ==========================================
  // 2. COOK MANAGEMENT
  // ==========================================
  async getAllCooks({ status, verificationStatus, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};

    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (status) where.user = { status };
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [cooks, total] = await Promise.all([
      prisma.cookProfile.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true } },
          _count: { select: { dishes: true, orders: true } },
        },
      }),
      prisma.cookProfile.count({ where }),
    ]);

    return {
      cooks: cooks.map((cook) => ({
        ...cook,
        fssaiStatus: effectiveFssaiStatus(cook.fssaiStatus, cook.fssaiExpiryDate),
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    };
  },

  async getCookById(id) {
    const cook = await prisma.cookProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
            verificationDocuments: true,
          },
        },
        dishes: true,
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { name: true, email: true } } },
        },
        reviews: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { name: true } } },
        },
      },
    });

    if (!cook) throw new AppError("Cook profile not found", HTTP_STATUS.NOT_FOUND);
    return { ...cook, fssaiStatus: effectiveFssaiStatus(cook.fssaiStatus, cook.fssaiExpiryDate) };
  },

  async updateCookVerificationStatus(
    id,
    { verificationStatus, rejectionReason, revisionReason, isApprovedToSell }
  ) {
    const cook = await prisma.cookProfile.findUnique({ where: { id } });
    if (!cook) throw new AppError("Cook profile not found", HTTP_STATUS.NOT_FOUND);

    const updateData = {
      verificationStatus,
      reviewedAt: new Date(),
    };

    if (verificationStatus === "APPROVED") {
      updateData.revisionReason = null;
      updateData.rejectionReason = null;

      // Profile approval never changes FSSAI state or grants selling approval.
      if (isApprovedToSell !== undefined) {
        const effectiveStatus = effectiveFssaiStatus(cook.fssaiStatus, cook.fssaiExpiryDate);
        updateData.isApprovedToSell = isApprovedToSell === true && effectiveStatus === "APPROVED";
      }

    } else if (verificationStatus === "NEEDS_REVISION") {
      updateData.revisionReason =
        revisionReason || rejectionReason || "Additional verification details required.";
      updateData.isApprovedToSell = false;

    } else if (verificationStatus === "REJECTED") {
      updateData.rejectionReason =
        rejectionReason || "Application did not meet platform verification guidelines.";
      updateData.isApprovedToSell = false;

    }

    return persistCookVerificationTransition(prisma, cook, verificationStatus, updateData);
  },

  async reviewCookFssai(id, decision) {
    const cook = await prisma.cookProfile.findUnique({ where: { id } });
    if (!cook) throw new AppError("Cook profile not found", HTTP_STATUS.NOT_FOUND);
    return persistCookFssaiTransition(prisma, cook, decision);
  },

  async updateCookAccountStatus(id, { status }) {
    const cook = await prisma.cookProfile.findUnique({ where: { id } });
    if (!cook) throw new AppError("Cook profile not found", HTTP_STATUS.NOT_FOUND);

    const updatedUser = await prisma.user.update({
      where: { id: cook.userId },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });

    return updatedUser;
  },

  // ==========================================
  // 3. DELIVERY AGENT MANAGEMENT
  // ==========================================
  async getAllDeliveryAgents({ status, verificationStatus, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};

    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (status) where.user = { status };
    if (search) {
      where.OR = [
        { licenseNumber: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { email: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [agents, total] = await Promise.all([
      prisma.deliveryAgent.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              status: true,
              createdAt: true,
              verificationDocuments: {
                where: { documentType: "OTHER", mimeType: { startsWith: "image/" }, verificationStatus: "APPROVED" },
                select: { id: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
          _count: { select: { orders: true } },
        },
      }),
      prisma.deliveryAgent.count({ where }),
    ]);

    return {
      agents: agents.map((agent) => {
        const profilePhotoDocumentId = agent.user?.verificationDocuments?.[0]?.id || null;
        const user = agent.user ? { ...agent.user } : null;
        if (user) delete user.verificationDocuments;
        return { ...agent, user, profilePhotoDocumentId };
      }),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    };
  },

  async getDeliveryAgentById(id) {
    const agent = await prisma.deliveryAgent.findUnique({
      where: { id },
      include: {
        payoutDetails: {
          select: {
            id: true,
            upiId: true,
            accountHolderName: true,
            verificationStatus: true,
            rejectionReason: true,
            submittedAt: true,
            reviewedAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
            verificationDocuments: true,
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { customer: { select: { name: true } }, cook: { select: { businessName: true } } },
        },
      },
    });

    if (!agent) throw new AppError("Delivery agent not found", HTTP_STATUS.NOT_FOUND);
    return agent;
  },

  async updateDeliveryAgentVerificationStatus(id, { verificationStatus }) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { id } });
    if (!agent) throw new AppError("Delivery agent not found", HTTP_STATUS.NOT_FOUND);

    return persistDeliveryAgentVerificationTransition(prisma, agent, verificationStatus);
  },

  async reviewDeliveryAgentPayoutDetails(id, adminUserId, decision) {
    return persistDeliveryAgentPayoutReview(prisma, id, adminUserId, decision);
  },

  async updateDeliveryAgentAccountStatus(id, { status }) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { id } });
    if (!agent) throw new AppError("Delivery agent not found", HTTP_STATUS.NOT_FOUND);

    const updatedUser = await prisma.user.update({
      where: { id: agent.userId },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });

    return updatedUser;
  },

  // ==========================================
  // 4. CUSTOMER MANAGEMENT
  // ==========================================
  async getAllCustomers({ status, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = { role: "CUSTOMER" };

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true, addresses: true, reviews: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      customers,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    };
  },

  async getCustomerById(id) {
    const customer = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        addresses: true,
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { cook: { select: { businessName: true } } },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!customer) throw new AppError("Customer not found", HTTP_STATUS.NOT_FOUND);
    return customer;
  },

  async updateCustomerStatus(id, { status }) {
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });

    return updatedUser;
  },

  // ==========================================
  // 5. DISH & FOOD CATEGORY MANAGEMENT
  // ==========================================
  async getAllDishes({ status, cuisine, categoryId, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};

    if (status) where.status = status;
    if (cuisine) where.cuisine = { contains: cuisine, mode: "insensitive" };
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { cuisine: { contains: search, mode: "insensitive" } },
      ];
    }

    const [dishes, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          cook: { select: { id: true, businessName: true, profileImage: true, user: { select: { name: true } } } },
          category: { select: { id: true, name: true } },
          story: { select: { whoTaught: true, storyText: true, culturalSignificance: true, occasion: true } },
        },
      }),
      prisma.dish.count({ where }),
    ]);

    return {
      dishes,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    };
  },

  async updateDishStatus(id, { status }) {
    const expectedStatus = status === "UNPUBLISHED" ? "PUBLISHED" : "PENDING_APPROVAL";
    const existing = await prisma.dish.findUnique({
      where: { id },
      include: { cook: { include: { user: true } }, story: true },
    });
    if (!existing) throw new AppError("Dish not found.", HTTP_STATUS.NOT_FOUND);
    assertAdminDishStatusTransition(existing.status, status);
    if (status === "PUBLISHED") assertDishReadyForAdminApproval(existing);

    const changed = await prisma.dish.updateMany({
      where: { id, status: expectedStatus, updatedAt: existing.updatedAt },
      data: { status },
    });
    if (changed.count !== 1) {
      throw new AppError("Dish status changed during review. Refresh and try again.", HTTP_STATUS.CONFLICT);
    }
    return prisma.dish.findUnique({
      where: { id },
      include: { cook: { select: { businessName: true } } },
    });
  },

  async getFoodCategories() {
    return await prisma.foodCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { dishes: true } } },
    });
  },

  async createFoodCategory({ name, description, image, isActive }) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    return await prisma.foodCategory.create({
      data: { name, slug, description, image, isActive: isActive ?? true },
    });
  },

  async updateFoodCategory(id, { name, description, image, isActive }) {
    const data = {};
    if (name) {
      data.name = name;
      data.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
    }
    if (description !== undefined) data.description = description;
    if (image !== undefined) data.image = image;
    if (isActive !== undefined) data.isActive = isActive;

    return await prisma.foodCategory.update({
      where: { id },
      data,
    });
  },

  // ==========================================
  // 6. ORDERS MANAGEMENT
  // ==========================================
  async getAllOrders({ status, paymentStatus, search, page = 1, limit = 20 }) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = {};

    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { cook: { businessName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          cook: { select: { id: true, businessName: true, profileImage: true, user: { select: { name: true } } } },
          deliveryAgent: { select: { id: true, user: { select: { name: true, phone: true } } } },
          items: {
            take: 1,
            orderBy: { createdAt: "asc" },
            select: { name: true, quantity: true, dishImage: true, dish: { select: { image: true } } },
          },
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / Number(limit)) },
    };
  },

  async getOrderById(id) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        cook: { select: { id: true, businessName: true, user: { select: { name: true, phone: true } } } },
        deliveryAgent: { select: { id: true, vehicleType: true, user: { select: { name: true, phone: true } } } },
        address: true,
        items: true,
        reviews: true,
      },
    });

    if (!order) throw new AppError("Order not found", HTTP_STATUS.NOT_FOUND);
    return order;
  },

  async updateOrderStatus(id, update) {
    return updateOrderStatusWithDatabase(prisma, id, update);
  },

  // ==========================================
  // 7. PAYMENTS & EARNINGS
  // ==========================================
  async getPaymentStats() {
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        cookEarning: true,
        deliveryEarning: true,
        platformFee: true,
        deliveryFee: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
        customer: { select: { name: true } },
        cook: { select: { businessName: true } },
        checkout: { select: { paymentMethod: true } },
        items: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { name: true, dishImage: true, dish: { select: { image: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const paidOrders = orders.filter((o) => o.paymentStatus === "PAID");
    const totalPlatformRevenuePaise = paidOrders.reduce((sum, order) => sum + toPaise(order.platformFee) + toPaise(order.deliveryFee), 0n);
    const totalCookEarningsPaise = sumPaise(paidOrders.map((order) => order.cookEarning));
    const totalDeliveryEarningsPaise = sumPaise(paidOrders.map((order) => order.deliveryEarning));
    const totalGrossVolumePaise = sumPaise(paidOrders.map((order) => order.totalAmount));

    return {
      summary: {
        totalGrossVolume: currencyNumber(rupeesFromPaise(totalGrossVolumePaise)),
        totalPlatformRevenue: currencyNumber(rupeesFromPaise(totalPlatformRevenuePaise)),
        totalCookEarnings: currencyNumber(rupeesFromPaise(totalCookEarningsPaise)),
        totalDeliveryEarnings: currencyNumber(rupeesFromPaise(totalDeliveryEarningsPaise)),
        paidOrdersCount: paidOrders.length,
        refundedOrdersCount: orders.filter((o) => o.paymentStatus === "REFUNDED").length,
      },
      orders: orders.slice(0, 50).map(({ checkout, ...order }) => ({
        ...order,
        paymentMethod: checkout?.paymentMethod ?? null,
      })),
    };
  },

  // ==========================================
  // 8. EXPERIENCES MANAGEMENT
  // ==========================================
  async getAllExperiences({ status, cuisine, search, type }) {
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (cuisine) where.cuisine = { contains: cuisine, mode: "insensitive" };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { cook: { businessName: { contains: search, mode: "insensitive" } } },
      ];
    }

    return await prisma.experience.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        cook: { select: { id: true, businessName: true, user: { select: { name: true } } } },
        menuItems: { orderBy: { sortOrder: "asc" }, include: { dish: { select: { id: true, name: true, image: true, cuisine: true } } } },
        slots: { orderBy: [{ startsAt: "asc" }, { id: "asc" }] },
        _count: { select: { bookings: true } },
      },
    });
  },

  async reviewWorkshop(id, decision) {
    return createAdminWorkshopReviewService(prisma).review(id, decision);
  },

  async updateExperienceStatus(id, { status }) {
    return await prisma.experience.update({
      where: { id },
      data: { status },
    });
  },

  // ==========================================
  // 9. REVIEWS & REPORTS MANAGEMENT
  // ==========================================
  async getAllReviews({ isReported, status, rating, search }) {
    const where = {};
    if (isReported === "true") where.isReported = true;
    if (status) where.status = status;
    if (rating) where.rating = Number(rating);
    if (search) {
      where.OR = [
        { comment: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { cook: { businessName: { contains: search, mode: "insensitive" } } },
      ];
    }

    return await prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, email: true } },
        cook: { select: { businessName: true } },
        dish: { select: { name: true } },
      },
    });
  },

  async updateReviewStatus(id, adminUserId, { status, reason }) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.review.findUnique({ where: { id }, select: { id: true, cookId: true } });
      if (!existing) throw new AppError("Review not found.", HTTP_STATUS.NOT_FOUND);
      const action = status === "HIDDEN" ? "HIDDEN" : status === "REMOVED" ? "REMOVED" : "KEPT";
      const updated = await tx.review.update({ where: { id }, data: { status, isReported: false, moderationReason: reason, moderatedAt: new Date() } });
      await tx.reviewReport.updateMany({
        where: { reviewId: id, status: "ACTIVE" },
        data: {
          status: status === "PUBLISHED" ? "KEPT" : "HIDDEN",
          resolvedAt: new Date(),
          resolvedByAdminId: adminUserId,
        },
      });
      await tx.reviewModerationLog.create({ data: { reviewId: id, adminUserId, action, reason } });
      if (status === "HIDDEN") {
        const cook = await tx.cookProfile.findUnique({ where: { id: existing.cookId }, select: { userId: true } });
        if (cook?.userId) {
          const { createNotificationsService } = await import("../notifications/notifications.service.js");
          await createNotificationsService(tx).create({
            userId: cook.userId, portal: "COOK", type: "SYSTEM_ALERT",
            title: "Review hidden by moderation", message: "An administrator hid a customer review after review.",
            metadata: { kind: "REVIEW_HIDDEN", reviewId: id, href: "/cook/reviews" },
            eventKey: `review:${id}:hidden:cook:${cook.userId}`,
          });
        }
      }
      return updated;
    }, { isolationLevel: "Serializable" });
  },

  // ==========================================
  // 10. VERIFICATION CENTER
  // ==========================================
  async getPendingVerifications() {
    const [cooks, agents, documents] = await Promise.all([
      prisma.cookProfile.findMany({
        where: { verificationStatus: "PENDING" },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, verificationDocuments: true },
          },
        },
      }),
      prisma.deliveryAgent.findMany({
        where: { verificationStatus: "PENDING" },
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true, verificationDocuments: true },
          },
        },
      }),
      prisma.verificationDocument.findMany({
        where: { verificationStatus: "PENDING" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              cookProfile: {
                select: {
                  id: true,
                  fssaiStatus: true,
                  fssaiStatusType: true,
                  fssaiExpiryDate: true,
                  fssaiRejectionReason: true,
                  fssaiApplicationReference: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      pendingCooks: cooks,
      pendingAgents: agents,
      pendingDocuments: documents.map((document) => ({
        ...document,
        user: document.user?.cookProfile ? {
          ...document.user,
          cookProfile: {
            ...document.user.cookProfile,
            fssaiStatus: effectiveFssaiStatus(document.user.cookProfile.fssaiStatus, document.user.cookProfile.fssaiExpiryDate),
          },
        } : document.user,
      })),
    };
  },

  async updateDocumentVerification(docId, { verificationStatus, rejectionReason }) {
    const existing = await prisma.verificationDocument.findUnique({ where: { id: docId }, select: { documentType: true } });
    if (!existing) throw new AppError("Verification document not found", HTTP_STATUS.NOT_FOUND);
    if (existing.documentType === "FSSAI_LICENSE") {
      throw new AppError("FSSAI documents must be reviewed through the cook FSSAI review workflow.", HTTP_STATUS.BAD_REQUEST);
    }
    return await prisma.verificationDocument.update({
      where: { id: docId },
      data: {
        verificationStatus,
        rejectionReason: rejectionReason || null,
      },
    });
  },

  // ==========================================
  // 11. NOTIFICATIONS
  // ==========================================
  async getNotifications() {
    return await prisma.platformNotification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async markNotificationAsRead(id) {
    return await prisma.platformNotification.update({
      where: { id },
      data: { isRead: true },
    });
  },

  async markAllNotificationsAsRead() {
    const result = await persistMarkAllPlatformNotificationsAsRead(prisma);
    return { updatedCount: result.count };
  },

  // ==========================================
  // 12. PLATFORM SETTINGS
  // ==========================================
  async getPlatformSettings() {
    let settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: { id: "default", platformFeePercent: 10.0, deliveryFeeBase: 30.0 },
      });
    }

    return settings;
  },

  async updatePlatformSettings({
    platformFeePercent, deliveryFeeBase, experienceCancellationWindowHours,
    experienceCookResponseWindowHours, experienceBookingCutoffHours, experiencePaymentHoldMinutes,
  }) {
    return await prisma.platformSettings.upsert({
      where: { id: "default" },
      update: {
        ...(platformFeePercent !== undefined && { platformFeePercent: normalizeRate(platformFeePercent) }),
        ...(deliveryFeeBase !== undefined && { deliveryFeeBase: normalizeCurrency(deliveryFeeBase) }),
        ...(experienceCancellationWindowHours !== undefined && { experienceCancellationWindowHours }),
        ...(experienceCookResponseWindowHours !== undefined && { experienceCookResponseWindowHours }),
        ...(experienceBookingCutoffHours !== undefined && { experienceBookingCutoffHours }),
        ...(experiencePaymentHoldMinutes !== undefined && { experiencePaymentHoldMinutes }),
      },
      create: {
        id: "default",
        platformFeePercent: normalizeRate(platformFeePercent ?? 10),
        deliveryFeeBase: normalizeCurrency(deliveryFeeBase ?? 30),
        experienceCancellationWindowHours: experienceCancellationWindowHours ?? 48,
        experienceCookResponseWindowHours: experienceCookResponseWindowHours ?? 24,
        experienceBookingCutoffHours: experienceBookingCutoffHours ?? 6,
        experiencePaymentHoldMinutes: experiencePaymentHoldMinutes ?? 15,
      },
    });
  },
};
