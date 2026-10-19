import prisma from "../../config/prisma.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { createNotificationsService } from "./notifications.service.js";

const service = createNotificationsService(prisma);

export const listNotifications = async (req, res, next) => {
  try {
    const data = await service.list(req.user.id, req.notificationPortal, req.validatedQuery);
    return sendSuccess(res, HTTP_STATUS.OK, "Notifications retrieved successfully", data);
  } catch (error) { next(error); }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    const data = await service.markRead(req.user.id, req.notificationPortal, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Notification marked as read", data);
  } catch (error) { next(error); }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const data = await service.markAllRead(req.user.id, req.notificationPortal);
    return sendSuccess(res, HTTP_STATUS.OK, "Notifications marked as read", data);
  } catch (error) { next(error); }
};
