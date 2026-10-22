import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { currencyNumber } from "../../utils/money.js";

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const monthBounds = (now) => {
  // Determine the calendar month in IST, then convert its midnight boundaries
  // to UTC instants for PostgreSQL timestamp comparisons.
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const istMonthStartAsUtc = (monthOffset) => new Date(Date.UTC(year, month + monthOffset, 1) - IST_OFFSET_MS);
  const currentStart = istMonthStartAsUtc(0);
  const nextMonthStart = istMonthStartAsUtc(1);
  const previousStart = istMonthStartAsUtc(-1);
  return { currentStart, nextMonthStart, previousStart };
};

const paidDeliveredWhere = (cookId, start, end) => ({
  cookId,
  status: "DELIVERED",
  // COD reaches this set only after the assigned agent confirms collection
  // and the order's persisted paymentStatus becomes PAID; each order is summed once.
  paymentStatus: "PAID",
  ...(start && end ? {
    statusHistory: {
      some: { toStatus: "DELIVERED", changedAt: { gte: start, lt: end } },
    },
  } : {}),
});

const earningTotals = (aggregate) => ({
  grossAmount: currencyNumber(aggregate?._sum?.subtotal ?? 0),
  platformCommission: currencyNumber(aggregate?._sum?.platformFee ?? 0),
  netCookEarnings: currencyNumber(aggregate?._sum?.cookEarning ?? 0),
});

const earningStatus = (order) => {
  if (order.status === "DELIVERED" && order.paymentStatus === "PAID") return "EARNED";
  if (order.status === "DELIVERED" && order.paymentStatus === "PENDING" && order.checkout?.paymentMethod === "COD") {
    return "AWAITING_COD_COLLECTION";
  }
  if (order.paymentStatus === "REFUNDED") return "REFUNDED_NOT_EARNED";
  if (order.status === "CANCELLED") return "CANCELLED_NOT_EARNED";
  return "NOT_YET_EARNED";
};

/** Earnings are per-cook persisted order snapshots; payout settlement is not modeled. */
export const createCookEarningsService = (database, now = () => new Date()) => ({
  async getEarnings(userId, { page = 1, pageSize = 20, search = "", status, paymentStatus, period = "ALL" } = {}) {
    const cook = await database.cookProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!cook) throw new AppError("Cook profile not found.", HTTP_STATUS.NOT_FOUND);

    const { currentStart, nextMonthStart, previousStart } = monthBounds(now());
    const paidDelivered = paidDeliveredWhere(cook.id);
    const awaitingCodCollection = {
      cookId: cook.id,
      status: "DELIVERED",
      paymentStatus: "PENDING",
      checkout: { is: { paymentMethod: "COD" } },
    };
    const currentMonthWhere = paidDeliveredWhere(cook.id, currentStart, nextMonthStart);
    const previousMonthWhere = paidDeliveredWhere(cook.id, previousStart, currentStart);

    const where = { cookId: cook.id };
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) where.orderNumber = { contains: search, mode: "insensitive" };
    if (period === "THIS_MONTH") {
      where.statusHistory = { some: { toStatus: "DELIVERED", changedAt: { gte: currentStart, lt: nextMonthStart } } };
    } else if (period === "LAST_MONTH") {
      where.statusHistory = { some: { toStatus: "DELIVERED", changedAt: { gte: previousStart, lt: currentStart } } };
    }

    const [earned, currentMonth, previousMonth, awaitingCollectionTotal, totalCount, orders] = await Promise.all([
      database.order.aggregate({ where: paidDelivered, _sum: { cookEarning: true, subtotal: true, platformFee: true } }),
      database.order.aggregate({ where: currentMonthWhere, _sum: { cookEarning: true, subtotal: true, platformFee: true } }),
      database.order.aggregate({ where: previousMonthWhere, _sum: { cookEarning: true, subtotal: true, platformFee: true } }),
      database.order.aggregate({ where: awaitingCodCollection, _sum: { cookEarning: true } }),
      database.order.count({ where }),
      database.order.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          subtotal: true,
          platformFee: true,
          cookEarning: true,
          paymentStatus: true,
          createdAt: true,
          updatedAt: true,
          checkout: { select: { paymentMethod: true } },
          statusHistory: {
            where: { toStatus: "DELIVERED" },
            select: { changedAt: true },
            take: 1,
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);
    return {
      totals: {
        allTime: earningTotals(earned),
        currentMonth: earningTotals(currentMonth),
        previousMonth: earningTotals(previousMonth),
        awaitingCodCollection: currencyNumber(awaitingCollectionTotal?._sum?.cookEarning ?? 0),
      },
      // Retain the original response fields for existing Cook Panel consumers.
      totalEarned: currencyNumber(earned?._sum?.cookEarning ?? 0),
      awaitingCodCollection: currencyNumber(awaitingCollectionTotal?._sum?.cookEarning ?? 0),
      payoutSettlementTracked: false,
      orders: orders.map((order) => ({
        id: order.id,
        // This endpoint currently reports persisted food-order earnings only.
        source: "food_order",
        orderNumber: order.orderNumber,
        status: order.status,
        grossAmount: currencyNumber(order.subtotal),
        platformCommission: currencyNumber(order.platformFee),
        amount: currencyNumber(order.cookEarning),
        paymentMethod: order.checkout?.paymentMethod || null,
        paymentStatus: order.paymentStatus,
        earningStatus: earningStatus(order),
        placedAt: order.createdAt,
        deliveredAt: order.statusHistory[0]?.changedAt || null,
        updatedAt: order.updatedAt,
      })),
      pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 },
      filters: { search, status: status || null, paymentStatus: paymentStatus || null, period },
      note: "Earned totals include each delivered order's saved cook-earning snapshot only when customer payment is recorded as PAID. Delivered COD orders awaiting collection are shown separately; cancelled and refunded orders are excluded. TasteBridge does not record cook payout settlement.",
    };
  },
});

export default createCookEarningsService;
