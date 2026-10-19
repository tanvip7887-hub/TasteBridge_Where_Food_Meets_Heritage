import express from "express";
import { authenticate, requireRole } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import {
  updateVerificationStatusSchema,
  reviewDeliveryAgentPayoutDetailsSchema,
  cookFssaiReviewSchema,
  updateAccountStatusSchema,
  updateDishStatusSchema,
  createCategorySchema,
  updateCategorySchema,
  updateOrderStatusSchema,
  updateExperienceStatusSchema,
  adminExperiencesQuerySchema,
  adminExperienceBookingsQuerySchema,
  reviewWorkshopSchema,
  updateReviewStatusSchema,
  updateDocumentVerificationSchema,
  updatePlatformSettingsSchema,
  socialReportsQuerySchema,
  moderateSocialReportSchema,
} from "./admin.validation.js";
import {
  getDashboardStats,
  getAllCooks,
  getCookById,
  updateCookVerificationStatus,
  reviewCookFssai,
  updateCookAccountStatus,
  getAllDeliveryAgents,
  getDeliveryAgentById,
  updateDeliveryAgentVerificationStatus,
  reviewDeliveryAgentPayoutDetails,
  updateDeliveryAgentAccountStatus,
  getAllCustomers,
  getCustomerById,
  updateCustomerStatus,
  getAllDishes,
  updateDishStatus,
  getFoodCategories,
  createFoodCategory,
  updateFoodCategory,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getPaymentStats,
  getAllExperiences,
  getAdminDineBookings,
  getAdminWorkshopBookings,
  updateExperienceStatus,
  reviewWorkshop,
  getAllReviews,
  updateReviewStatus,
  getReportedReviews,
  moderateReportedReview,
  getPendingVerifications,
  updateDocumentVerification,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getPlatformSettings,
  updatePlatformSettings,
  getSocialReports,
  moderateSocialReport,
} from "./admin.controller.js";
import { adminReportedReviewsSchema, moderateReviewSchema } from "../reviews/reviews.validation.js";

const router = express.Router();

// Enforce authentication & ADMIN role on ALL admin routes
router.use(authenticate, requireRole("ADMIN"));

// 1. Dashboard
router.get("/dashboard", getDashboardStats);

// 2. Cook Management
router.get("/cooks", getAllCooks);
router.get("/cooks/:id", getCookById);
router.patch("/cooks/:id/verification", validate(updateVerificationStatusSchema), updateCookVerificationStatus);
router.patch("/cooks/:id/fssai-review", validate(cookFssaiReviewSchema), reviewCookFssai);
router.patch("/cooks/:id/status", validate(updateAccountStatusSchema), updateCookAccountStatus);

// 3. Delivery Agent Management
router.get("/delivery-agents", getAllDeliveryAgents);
router.get("/delivery-agents/:id", getDeliveryAgentById);
router.patch("/delivery-agents/:id/verification", validate(updateVerificationStatusSchema), updateDeliveryAgentVerificationStatus);
router.patch("/delivery-agents/:id/payout-details", validate(reviewDeliveryAgentPayoutDetailsSchema), reviewDeliveryAgentPayoutDetails);
router.patch("/delivery-agents/:id/status", validate(updateAccountStatusSchema), updateDeliveryAgentAccountStatus);

// 4. Customer Management
router.get("/customers", getAllCustomers);
router.get("/customers/:id", getCustomerById);
router.patch("/customers/:id/status", validate(updateAccountStatusSchema), updateCustomerStatus);

// 5. Dish & Category Management
router.get("/dishes", getAllDishes);
router.patch("/dishes/:id/status", validate(updateDishStatusSchema), updateDishStatus);
router.get("/categories", getFoodCategories);
router.post("/categories", validate(createCategorySchema), createFoodCategory);
router.patch("/categories/:id", validate(updateCategorySchema), updateFoodCategory);

// 6. Orders Management
router.get("/orders", getAllOrders);
router.get("/orders/:id", getOrderById);
router.patch("/orders/:id/status", validate(updateOrderStatusSchema), updateOrderStatus);

// 7. Payments & Earnings
router.get("/payments", getPaymentStats);

// 8. Experiences Management
router.get("/experiences", validate(adminExperiencesQuerySchema), getAllExperiences);
router.get("/dine-bookings", validate(adminExperienceBookingsQuerySchema), getAdminDineBookings);
router.get("/workshop-bookings", validate(adminExperienceBookingsQuerySchema), getAdminWorkshopBookings);
router.patch("/experiences/:id/status", validate(updateExperienceStatusSchema), updateExperienceStatus);
router.patch("/workshops/:id/review", validate(reviewWorkshopSchema), reviewWorkshop);

// 9. Reviews & Reports Management
router.get("/reviews", getAllReviews);
router.get("/reviews/reported", validate(adminReportedReviewsSchema), getReportedReviews);
router.patch("/reviews/:id", validate(moderateReviewSchema), moderateReportedReview);
router.patch("/reviews/:id/status", validate(updateReviewStatusSchema), updateReviewStatus);
router.get("/social-reports", validate(socialReportsQuerySchema), getSocialReports);
router.patch("/social-reports/:id", validate(moderateSocialReportSchema), moderateSocialReport);

// 10. Verification Center
router.get("/verifications", getPendingVerifications);
router.patch("/verifications/documents/:docId", validate(updateDocumentVerificationSchema), updateDocumentVerification);

// 11. Notifications
router.get("/notifications", getNotifications);
router.patch("/notifications/read-all", markAllNotificationsAsRead);
router.patch("/notifications/:id/read", markNotificationAsRead);

// 12. Platform Settings
router.get("/settings", getPlatformSettings);
router.patch("/settings", validate(updatePlatformSettingsSchema), updatePlatformSettings);

export default router;
