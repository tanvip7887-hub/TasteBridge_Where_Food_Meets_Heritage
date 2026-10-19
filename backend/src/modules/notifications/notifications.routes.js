import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireNotificationPortal } from "./notifications.auth.js";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./notifications.controller.js";
import { notificationIdSchema, notificationListSchema } from "./notifications.validation.js";

const router = Router();
router.use(authenticate, requireNotificationPortal);
router.get("/", validate(notificationListSchema), listNotifications);
router.patch("/read-all", markAllNotificationsRead);
router.patch("/:id/read", validate(notificationIdSchema), markNotificationRead);

export default router;
