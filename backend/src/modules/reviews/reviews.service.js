import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { createNotificationsService } from "../notifications/notifications.service.js";
import { currencyNumber } from "../../utils/money.js";

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const notFound = () => new AppError("Review or eligible purchase not found.", HTTP_STATUS.NOT_FOUND);
const expired = () => conflict("The review window has ended.");
const eventCompletionUnavailable = () => new AppError(
  "Event reviews are unavailable because completed bookings do not record an authoritative completion time.",
  HTTP_STATUS.SERVICE_UNAVAILABLE
);
const inWindow = (timestamp, now, duration = WINDOW_MS) => {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const time = date.getTime();
  return Number.isFinite(time) && time <= now.getTime() && now.getTime() <= time + duration;
};
const pageResult = (items, page, limit, total) => ({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
const publicName = (name) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "TasteBridge customer";
  return words.length > 1 ? `${words[0]} ${words.at(-1)[0].toUpperCase()}.` : words[0];
};
const publicReview = (review) => ({
  id: review.id,
  reviewType: review.reviewType,
  rating: review.rating,
  comment: review.comment,
  subjectName: review.subjectNameSnapshot || review.dish?.name || "TasteBridge experience",
  cookName: review.cookNameSnapshot || review.cook?.businessName || "TasteBridge cook",
  customerName: publicName(review.customer?.name),
  verified: review.reviewType === "FOOD" ? "VERIFIED_ORDER" : "ATTENDED_EVENT",
  cookReply: review.cookReply,
  cookRepliedAt: review.cookRepliedAt,
  createdAt: review.createdAt,
});
const cookReviewSelect = {
  id: true, reviewType: true, rating: true, comment: true, status: true,
  isReported: true, reportReason: true, createdAt: true, cookReply: true,
  cookRepliedAt: true, subjectNameSnapshot: true, cookNameSnapshot: true,
  customer: { select: { name: true } },
  dish: { select: { name: true } },
  order: { select: { orderNumber: true, status: true } },
  experienceBooking: { select: { id: true, status: true, bookingDate: true, completedAt: true } },
};

const checkFoodEligibility = async (database, customerId, orderItemId, now) => {
  const item = await database.orderItem.findFirst({
    where: { id: orderItemId, order: { customerId } },
    include: {
      dish: { select: { id: true, name: true } },
      order: {
        select: {
          id: true, orderNumber: true, customerId: true, cookId: true, cookName: true,
          status: true, paymentStatus: true, checkoutId: true,
          cook: { select: { id: true, businessName: true, userId: true } },
          customer: { select: { name: true } },
          statusHistory: { where: { toStatus: "DELIVERED" }, orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 1, select: { changedAt: true } },
        },
      },
      review: { select: { id: true } },
    },
  });
  if (!item?.order || item.order.customerId !== customerId) throw notFound();
  if (item.review) throw conflict("This purchased dish has already been reviewed.");
  if (item.order.status !== "DELIVERED" || ["FAILED", "REFUNDED"].includes(item.order.paymentStatus)) {
    throw conflict("You can review a dish after its order is delivered and eligible.");
  }
  const deliveredAt = item.order.statusHistory?.[0]?.changedAt;
  if (!deliveredAt) throw conflict("A verified delivery time is unavailable for this order, so it cannot be reviewed.");
  if (!inWindow(deliveredAt, now)) throw expired();
  return { item, order: item.order, completedAt: deliveredAt };
};

const checkExperienceEligibility = async (database, customerId, bookingId, now) => {
  const booking = await database.experienceBooking.findFirst({
    where: { id: bookingId, customerId },
    include: {
      review: { select: { id: true } },
      customer: { select: { name: true } },
      experience: { select: { id: true, title: true, cookId: true, cook: { select: { businessName: true, userId: true } } } },
    },
  });
  if (!booking) throw notFound();
  if (booking.review) throw conflict("This event booking has already been reviewed.");
  if (booking.status !== "COMPLETED") throw conflict("You can review an event after its booking is completed.");
  // Must have an authoritative completion timestamp; do not derive from bookingDate or updatedAt
  if (!booking.completedAt) throw eventCompletionUnavailable();
  // Enforce the 14-day review window
  if (!inWindow(booking.completedAt, now)) throw expired();
  return { booking, completedAt: booking.completedAt };
};

const createReviewNotification = async (tx, { userId, portal, eventKey, title, message, metadata }) => {
  await createNotificationsService(tx).create({ userId, portal, type: "SYSTEM_ALERT", eventKey, title, message, metadata });
};

export const createReviewsService = (database, { now = () => new Date() } = {}) => ({
  async listPending(customerId, { page, limit }) {
    const current = now();
    const [foodItems, eventBookings] = await Promise.all([
      database.orderItem.findMany({
        where: {
          order: {
            customerId,
            status: "DELIVERED",
            paymentStatus: { notIn: ["FAILED", "REFUNDED"] },
            statusHistory: {
              some: {
                toStatus: "DELIVERED",
                changedAt: { gte: new Date(current.getTime() - WINDOW_MS), lte: current },
              },
            },
          },
          review: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: {
          dish: { select: { name: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              checkoutId: true,
              statusHistory: {
                where: { toStatus: "DELIVERED" },
                orderBy: [{ changedAt: "desc" }, { id: "desc" }],
                take: 1,
                select: { changedAt: true },
              },
            },
          },
          review: { select: { id: true } },
        },
      }),
      database.experienceBooking.findMany({
        where: {
          customerId,
          status: "COMPLETED",
          completedAt: { gte: new Date(current.getTime() - WINDOW_MS), lte: current },
          review: null,
        },
        orderBy: [{ completedAt: "desc" }, { id: "asc" }],
        include: {
          experience: { select: { title: true } },
          review: { select: { id: true } },
        },
      }),
    ]);

    const eligibleFood = foodItems.flatMap((item) => {
      const deliveredAt = item.order?.statusHistory?.[0]?.changedAt;
      if (!deliveredAt || !inWindow(deliveredAt, current)) return [];
      return [{
        id: item.id,
        reviewType: "FOOD",
        orderItemId: item.id,
        orderId: item.order.id,
        checkoutId: item.order.checkoutId,
        dishId: item.dishId,
        orderReference: item.order.orderNumber,
        subjectName: item.dish?.name || item.name,
        deliveredAt,
        completedAt: deliveredAt,
      }];
    });

    const eligibleEvents = eventBookings.flatMap((booking) => {
      if (!booking.completedAt || !inWindow(booking.completedAt, current)) return [];
      return [{
        id: booking.id,
        reviewType: "EXPERIENCE",
        bookingId: booking.id,
        experienceId: booking.experienceId,
        orderReference: booking.id,
        subjectName: booking.experience?.title || "TasteBridge dining event",
        completedAt: booking.completedAt,
      }];
    });

    const all = [...eligibleFood, ...eligibleEvents].sort(
      (a, b) => new Date(b.completedAt) - new Date(a.completedAt) || a.id.localeCompare(b.id)
    );
    const total = all.length;
    return pageResult(all.slice((page - 1) * limit, page * limit), page, limit, total);
  },

  async listMine(customerId, { page, limit }) {
    const where = { customerId };
    const [items, total] = await Promise.all([
      database.review.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, select: cookReviewSelect }),
      database.review.count({ where }),
    ]);
    const current = now();
    return pageResult(items.map((item) => ({
      id: item.id, reviewType: item.reviewType, rating: item.rating, comment: item.comment,
      status: item.status, subjectName: item.subjectNameSnapshot || item.dish?.name || "TasteBridge experience",
      cookName: item.cookNameSnapshot, cookReply: item.cookReply, cookRepliedAt: item.cookRepliedAt,
      createdAt: item.createdAt, editable: item.status === "PUBLISHED" && inWindow(item.createdAt, current, EDIT_WINDOW_MS),
    })), page, limit, total);
  },

  async create(customerId, input) {
    const current = now();
    try {
      return await database.$transaction(async (tx) => {
        let data;
        if (input.reviewType === "FOOD") {
          const { item, order } = await checkFoodEligibility(tx, customerId, input.orderItemId, current);
          data = {
            reviewType: "FOOD", orderId: order.id, orderItemId: item.id,
            customerId, cookId: order.cookId, dishId: item.dishId,
            subjectNameSnapshot: item.dish?.name || item.name,
            cookNameSnapshot: order.cook?.businessName || order.cookName,
          };
        } else {
          const { booking } = await checkExperienceEligibility(tx, customerId, input.bookingId, current);
          data = {
            reviewType: "EXPERIENCE", experienceBookingId: booking.id, customerId,
            cookId: booking.experience.cookId, subjectNameSnapshot: booking.experience.title,
            cookNameSnapshot: booking.experience.cook.businessName,
          };
        }
        const review = await tx.review.create({ data: { ...data, rating: input.rating, comment: input.comment || null } });
        const cookUserId = input.reviewType === "FOOD"
          ? (await tx.cookProfile.findUnique({ where: { id: data.cookId }, select: { userId: true } }))?.userId
          : (await tx.cookProfile.findUnique({ where: { id: data.cookId }, select: { userId: true } }))?.userId;
        if (cookUserId) await createReviewNotification(tx, {
          userId: cookUserId, portal: "COOK", eventKey: `review:${review.id}:created:cook:${cookUserId}`,
          title: "New customer review", message: `${data.subjectNameSnapshot} received a new review.`,
          metadata: { kind: "REVIEW_CREATED", reviewId: review.id, href: "/cook/reviews" },
        });
        return review;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error?.code === "P2002") throw conflict("This purchase has already been reviewed.");
      if (error?.code === "P2034") throw conflict("This purchase changed while the review was being saved. Refresh and try again.");
      throw error;
    }
  },

  async update(customerId, reviewId, { rating, comment }) {
    return database.$transaction(async (tx) => {
      const review = await tx.review.findFirst({ where: { id: reviewId, customerId }, select: { id: true, createdAt: true, status: true } });
      if (!review) throw notFound();
      if (review.status !== "PUBLISHED") throw conflict("This review cannot be edited while it is under moderation.");
      if (!inWindow(review.createdAt, now(), EDIT_WINDOW_MS)) throw conflict("Reviews can only be edited within 24 hours of submission.");
      const updated = await tx.review.updateMany({ where: { id: reviewId, customerId, status: "PUBLISHED", createdAt: review.createdAt }, data: { rating, comment: comment || null } });
      if (updated.count !== 1) throw conflict("The review changed while it was being edited. Refresh and try again.");
      return tx.review.findUnique({ where: { id: reviewId } });
    }, { isolationLevel: "Serializable" });
  },

  async publicDishReviews(dishId, { page = 1, limit = 20 } = {}) {
    const dish = await database.dish.findFirst({ where: { id: dishId, status: "PUBLISHED", cook: { verificationStatus: "APPROVED", user: { status: "ACTIVE" } } }, select: { id: true } });
    if (!dish) throw notFound();
    return this.publicList({ dishId }, page, limit);
  },

  async publicCookReviews(cookId, { page = 1, limit = 20 } = {}) {
    const cook = await database.cookProfile.findFirst({ where: { id: cookId, verificationStatus: "APPROVED", user: { status: "ACTIVE" } }, select: { id: true } });
    if (!cook) throw notFound();
    return this.publicList({ cookId }, page, limit);
  },

  async publicCookProfile(cookId) {
    const cook = await database.cookProfile.findFirst({
      where: { id: cookId, verificationStatus: "APPROVED", user: { status: "ACTIVE" } },
      select: {
        id: true,
        businessName: true,
        profileImage: true,
        bio: true,
        specialization: true,
        experienceYears: true,
        cuisines: true,
        city: true,
        locality: true,
        createdAt: true,
        dishes: {
          where: { status: "PUBLISHED" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            cuisine: true,
            price: true,
            image: true,
            isVegetarian: true,
            dietaryTags: true,
            prepTimeMinutes: true,
            category: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!cook) throw notFound();

    const summary = await database.review.aggregate({
      where: { cookId, status: "PUBLISHED" },
      _avg: { rating: true },
      _count: { _all: true },
    });

    const dishIds = cook.dishes.map((dish) => dish.id);
    const dishSummaries = new Map();
    if (dishIds.length && typeof database.review?.groupBy === "function") {
      const groups = await database.review.groupBy({
        by: ["dishId", "rating"],
        where: { dishId: { in: dishIds }, status: "PUBLISHED" },
        _count: { _all: true },
      });
      for (const group of groups) {
        const item = dishSummaries.get(group.dishId) || { count: 0, weighted: 0 };
        item.count += group._count._all;
        item.weighted += group.rating * group._count._all;
        dishSummaries.set(group.dishId, item);
      }
    }

    return {
      id: cook.id,
      businessName: cook.businessName,
      profileImage: cook.profileImage,
      bio: cook.bio,
      specialization: cook.specialization,
      experienceYears: cook.experienceYears,
      cuisines: cook.cuisines,
      city: cook.city,
      locality: cook.locality,
      createdAt: cook.createdAt,
      ratingSummary: {
        average: summary._avg.rating || 0,
        count: summary._count._all,
      },
      dishes: cook.dishes.map((dish) => {
        const ds = dishSummaries.get(dish.id);
        const ratingSummary = ds?.count >= 3 ? { count: ds.count, average: ds.weighted / ds.count } : null;
        let formattedPrice = dish.price;
        try {
          formattedPrice = typeof dish.price === "number" ? dish.price : currencyNumber(dish.price);
        } catch {
          formattedPrice = Number(dish.price) || 0;
        }
        return {
          ...dish,
          price: formattedPrice,
          ratingSummary,
        };
      }),
    };
  },

  async publicList(scope, page = 1, limit = 20) {
    const where = { ...scope, status: "PUBLISHED" };
    return database.$transaction(async (tx) => {
      const items = await tx.review.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, include: { customer: { select: { name: true } }, dish: { select: { name: true } }, cook: { select: { businessName: true } } } });
      const total = await tx.review.count({ where });
      const summary = await tx.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } });
      return { ...pageResult(items.map(publicReview), page, limit, total), ratingSummary: { average: summary._avg.rating || 0, count: summary._count._all } };
    }, { isolationLevel: "RepeatableRead" });
  },

  async listForCook(cookId, { page = 1, limit = 20, type, needsReply } = {}) {
    const where = {
      cookId,
      ...(type ? { reviewType: type } : {}),
      ...(needsReply === undefined ? {} : needsReply === "true" ? { cookReply: null } : { cookReply: { not: null } }),
    };
    const [items, total] = await Promise.all([
      database.review.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: cookReviewSelect,
      }),
      database.review.count({ where }),
    ]);
    return pageResult(
      items.map((item) => ({
        ...item,
        subjectName: item.subjectNameSnapshot || item.dish?.name || "TasteBridge experience",
        customerName: publicName(item.customer?.name),
        verified: item.reviewType === "FOOD" ? item.order?.status === "DELIVERED" : item.experienceBooking?.status === "COMPLETED",
        verifiedBadge: item.reviewType === "FOOD" ? "VERIFIED_ORDER" : "ATTENDED_EVENT",
      })),
      page,
      limit,
      total
    );
  },

  async reply(cookId, reviewId, reply) {
    return database.$transaction(async (tx) => {
      const review = await tx.review.findFirst({ where: { id: reviewId, cookId }, select: { id: true, customerId: true, cookReply: true, status: true, reviewType: true } });
      if (!review) throw notFound();
      if (review.status !== "PUBLISHED") throw conflict("You can reply only to a visible review.");
      if (review.cookReply) throw conflict("A reply has already been submitted for this review.");
      const repliedAt = now();
      const changed = await tx.review.updateMany({ where: { id: reviewId, cookId, cookReply: null, status: "PUBLISHED" }, data: { cookReply: reply, cookRepliedAt: repliedAt } });
      if (changed.count !== 1) throw conflict("A reply has already been submitted for this review.");
      await createReviewNotification(tx, {
        userId: review.customerId, portal: "CUSTOMER", eventKey: `review:${reviewId}:replied:customer:${review.customerId}`,
        title: "The cook replied to your review", message: "Open your review to see the cook's response.",
        metadata: { kind: "REVIEW_REPLIED", reviewId, href: "/orders" },
      });
      return tx.review.findUnique({ where: { id: reviewId }, select: { id: true, cookReply: true, cookRepliedAt: true } });
    }, { isolationLevel: "Serializable" });
  },

  async report(cookId, reviewId, reason) {
    try { return await database.$transaction(async (tx) => {
      const review = await tx.review.findFirst({ where: { id: reviewId, cookId }, select: { id: true, cookId: true, status: true, isReported: true, reportReason: true } });
      if (!review) throw notFound();
      if (review.status !== "PUBLISHED") throw conflict("Only visible reviews can be reported.");
      if (review.isReported) throw conflict("This review already has an active report.");
      if (review.reportReason) throw conflict("This review already has a recorded moderation report.");
      const changed = await tx.review.updateMany({ where: { id: reviewId, cookId, status: "PUBLISHED", isReported: false, reportReason: null }, data: { isReported: true, reportReason: reason, reportedAt: now() } });
      if (changed.count !== 1) throw conflict("The review changed while the report was being submitted.");
      const report = await tx.reviewReport.create({ data: { reviewId, cookId, reason } });
      const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
      for (const admin of admins) {
        const eventKey = `review:${reviewId}:reported:${report.id}:admin:${admin.id}`;
        await tx.platformNotification.upsert({
          where: { eventKey },
          create: { eventKey, type: "SYSTEM_ALERT", title: "Customer review reported", message: "A cook reported a review for moderation.", metadata: { kind: "REVIEW_REPORTED", reviewId, reportId: report.id, href: "/admin/reviews" } },
          update: {},
        });
      }
      return report;
    }, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (["P2002", "P2034"].includes(error?.code)) throw conflict("This review has already been reported or changed during reporting.");
      throw error;
    }
  },

  async listReported({ page = 1, limit = 20, status = "ACTIVE", type } = {}) {
    const reportWhere = {};
    if (status && status !== "ALL") {
      reportWhere.status = status;
    }
    const reviewWhere = {};
    if (type && type !== "ALL") {
      reviewWhere.reviewType = type;
    }
    if (status === "ACTIVE") {
      reviewWhere.isReported = true;
      reviewWhere.status = "PUBLISHED";
    }
    const where = {
      ...reportWhere,
      ...(Object.keys(reviewWhere).length > 0 ? { review: reviewWhere } : {}),
    };

    const [items, total] = await Promise.all([
      database.reviewReport.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          review: {
            include: {
              customer: { select: { name: true } },
              cook: { select: { businessName: true } },
              dish: { select: { name: true } },
              order: { select: { orderNumber: true } },
            },
          },
        },
      }),
      database.reviewReport.count({ where }),
    ]);

    const formatted = items.map((report) => ({
      id: report.id,
      reviewId: report.reviewId,
      cookId: report.cookId,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      resolvedByAdminId: report.resolvedByAdminId,
      review: report.review ? {
        id: report.review.id,
        reviewType: report.review.reviewType,
        rating: report.review.rating,
        comment: report.review.comment,
        status: report.review.status,
        subjectName: report.review.subjectNameSnapshot || report.review.dish?.name || (report.review.reviewType === "FOOD" ? "Dish" : "Experience"),
        cookName: report.review.cookNameSnapshot || report.review.cook?.businessName || "TasteBridge cook",
        customerName: publicName(report.review.customer?.name),
        orderNumber: report.review.order?.orderNumber || null,
        cookReply: report.review.cookReply,
        cookRepliedAt: report.review.cookRepliedAt,
        isReported: report.review.isReported,
        reportReason: report.review.reportReason,
        reportedAt: report.review.reportedAt,
        moderationReason: report.review.moderationReason,
        moderatedAt: report.review.moderatedAt,
        createdAt: report.review.createdAt,
        verifiedBadge: report.review.reviewType === "FOOD" ? "VERIFIED_ORDER" : "ATTENDED_EVENT",
      } : null,
    }));

    return pageResult(formatted, page, limit, total);
  },

  async moderate(adminUserId, reviewId, { action, reason }) {
    if (!["KEEP", "HIDE"].includes(action)) {
      throw new AppError("Invalid moderation action. Must be KEEP or HIDE.", HTTP_STATUS.BAD_REQUEST);
    }
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    if (action === "HIDE" && (!trimmedReason || trimmedReason.length < 5 || trimmedReason.length > 500)) {
      throw new AppError("A reason between 5 and 500 characters is required when hiding a review.", HTTP_STATUS.BAD_REQUEST);
    }
    const logReason = trimmedReason || (action === "KEEP" ? "Report reviewed and dismissed - review kept published." : "Hidden by administrator.");

    return database.$transaction(async (tx) => {
      const review = await tx.review.findUnique({
        where: { id: reviewId },
        select: { id: true, cookId: true, status: true, isReported: true },
      });
      if (!review) throw notFound();

      const activeReports = await tx.reviewReport.findMany({
        where: { reviewId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!activeReports.length && !review.isReported) {
        throw conflict("This review has no active reports waiting for moderation.");
      }

      const moderatedAt = now();
      const newStatus = action === "HIDE" ? "HIDDEN" : "PUBLISHED";

      const updatedReview = await tx.review.update({
        where: { id: reviewId },
        data: {
          status: newStatus,
          isReported: false,
          moderationReason: logReason,
          moderatedAt,
        },
        select: {
          id: true,
          status: true,
          isReported: true,
          moderationReason: true,
          moderatedAt: true,
          cookId: true,
        },
      });

      await tx.reviewReport.updateMany({
        where: { reviewId, status: "ACTIVE" },
        data: {
          status: action === "HIDE" ? "HIDDEN" : "KEPT",
          resolvedAt: moderatedAt,
          resolvedByAdminId: adminUserId,
        },
      });

      await tx.reviewModerationLog.create({
        data: {
          reviewId,
          adminUserId,
          action: action === "HIDE" ? "HIDDEN" : "KEPT",
          reason: logReason.slice(0, 500),
        },
      });

      if (action === "HIDE") {
        const cook = await tx.cookProfile.findUnique({
          where: { id: review.cookId },
          select: { userId: true },
        });
        if (cook?.userId) {
          await createReviewNotification(tx, {
            userId: cook.userId,
            portal: "COOK",
            eventKey: `review:${reviewId}:hidden:cook:${cook.userId}`,
            title: "Review hidden by moderation",
            message: "An administrator hid a customer review after review.",
            metadata: { kind: "REVIEW_HIDDEN", reviewId, href: "/cook/reviews" },
          });
        }
      }

      return updatedReview;
    }, { isolationLevel: "Serializable" });
  },
});

