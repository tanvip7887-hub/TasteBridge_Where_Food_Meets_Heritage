import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

const notificationSelect = {
  id: true,
  portal: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  metadata: true,
  createdAt: true,
};

export const createNotificationsService = (database) => ({
  async list(userId, portal, { page, limit }) {
    const where = { userId, portal };
    const [items, total, unreadCount] = await Promise.all([
      database.userNotification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: notificationSelect,
      }),
      database.userNotification.count({ where }),
      database.userNotification.count({ where: { ...where, isRead: false } }),
    ]);
    return { items, page, limit, total, unreadCount };
  },

  async markRead(userId, portal, id) {
    const where = { id, userId, portal };
    const updated = await database.userNotification.updateMany({
      where: { ...where, isRead: false },
      data: { isRead: true },
    });
    if (updated.count) return { id, isRead: true };

    // Treat repeated requests as successful only when the row is already read
    // by this same recipient in this same portal. Other rows remain concealed.
    const existing = await database.userNotification.findFirst({ where, select: { id: true } });
    if (!existing) throw new AppError("Notification not found.", HTTP_STATUS.NOT_FOUND);
    return { id, isRead: true };
  },

  async markAllRead(userId, portal) {
    const result = await database.userNotification.updateMany({
      where: { userId, portal, isRead: false },
      data: { isRead: true },
    });
    return { updatedCount: result.count, unreadCount: 0 };
  },

  async create({ userId, portal, type = "SYSTEM_ALERT", title, message, metadata = undefined, eventKey = null }) {
    const data = { userId, portal, type, title, message, ...(metadata === undefined ? {} : { metadata }) };
    if (eventKey === null || eventKey === undefined) {
      return database.userNotification.create({ data: { ...data, eventKey: null } });
    }

    // Scope idempotency to recipient + portal so one event can notify several
    // users (or portals). PostgreSQL permits multiple NULL values in this
    // composite unique index, so unkeyed notifications remain unrestricted.
    return database.userNotification.upsert({
      where: { userId_portal_eventKey: { userId, portal, eventKey } },
      create: { ...data, eventKey },
      update: {},
    });
  },
});
