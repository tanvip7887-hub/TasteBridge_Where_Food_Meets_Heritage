import { adminService } from "./admin.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import prisma from "../../config/prisma.js";
import { createReviewsService } from "../reviews/reviews.service.js";

const reviewService = createReviewsService(prisma);

// ==========================================
// 1. DASHBOARD OVERVIEW
// ==========================================
export const getDashboardStats = async (req, res, next) => {
  try {
    const data = await adminService.getDashboardStats();
    return sendSuccess(res, HTTP_STATUS.OK, "Admin dashboard stats retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 2. COOK MANAGEMENT
// ==========================================
export const getAllCooks = async (req, res, next) => {
  try {
    const data = await adminService.getAllCooks(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Cooks retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getCookById = async (req, res, next) => {
  try {
    const data = await adminService.getCookById(req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook details retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateCookVerificationStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateCookVerificationStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Cook verification updated to ${req.body.verificationStatus}`, data);
  } catch (error) {
    next(error);
  }
};

export const reviewCookFssai = async (req, res, next) => {
  try {
    const data = await adminService.reviewCookFssai(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "FSSAI review saved", data);
  } catch (error) { next(error); }
};

export const updateCookAccountStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateCookAccountStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Cook account status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 3. DELIVERY AGENT MANAGEMENT
// ==========================================
export const getAllDeliveryAgents = async (req, res, next) => {
  try {
    const data = await adminService.getAllDeliveryAgents(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery agents retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getDeliveryAgentById = async (req, res, next) => {
  try {
    const data = await adminService.getDeliveryAgentById(req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery agent details retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryAgentVerificationStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateDeliveryAgentVerificationStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Delivery agent verification updated to ${req.body.verificationStatus}`, data);
  } catch (error) {
    next(error);
  }
};

export const reviewDeliveryAgentPayoutDetails = async (req, res, next) => {
  try {
    const data = await adminService.reviewDeliveryAgentPayoutDetails(req.params.id, req.user.id, req.body);
    const resultWord = req.body.action === "APPROVE" ? "approved" : "rejected";
    return sendSuccess(res, HTTP_STATUS.OK, `Delivery-agent payout details ${resultWord}.`, data);
  } catch (error) {
    next(error);
  }
};

export const updateDeliveryAgentAccountStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateDeliveryAgentAccountStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Agent account status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 4. CUSTOMER MANAGEMENT
// ==========================================
export const getAllCustomers = async (req, res, next) => {
  try {
    const data = await adminService.getAllCustomers(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Customers retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getCustomerById = async (req, res, next) => {
  try {
    const data = await adminService.getCustomerById(req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Customer details retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateCustomerStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateCustomerStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Customer account status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 5. DISH & FOOD CATEGORY MANAGEMENT
// ==========================================
export const getAllDishes = async (req, res, next) => {
  try {
    const data = await adminService.getAllDishes(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Dishes retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateDishStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateDishStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Dish status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

export const getFoodCategories = async (req, res, next) => {
  try {
    const data = await adminService.getFoodCategories();
    return sendSuccess(res, HTTP_STATUS.OK, "Food categories retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const createFoodCategory = async (req, res, next) => {
  try {
    const data = await adminService.createFoodCategory(req.body);
    return sendSuccess(res, HTTP_STATUS.CREATED, "Food category created successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateFoodCategory = async (req, res, next) => {
  try {
    const data = await adminService.updateFoodCategory(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Food category updated successfully", data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 6. ORDERS MANAGEMENT
// ==========================================
export const getAllOrders = async (req, res, next) => {
  try {
    const data = await adminService.getAllOrders(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Orders retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req, res, next) => {
  try {
    const data = await adminService.getOrderById(req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Order details retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateOrderStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Order status updated successfully", data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 7. PAYMENTS & EARNINGS
// ==========================================
export const getPaymentStats = async (req, res, next) => {
  try {
    const data = await adminService.getPaymentStats();
    return sendSuccess(res, HTTP_STATUS.OK, "Payment statistics retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 8. EXPERIENCES MANAGEMENT
// ==========================================
export const getAllExperiences = async (req, res, next) => {
  try {
    const data = await adminService.getAllExperiences(req.validatedQuery || req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Experiences retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

const getExperienceBookings = async (req, res, next, type) => {
  try {
    const data = await adminService.getExperienceBookings(type, req.validatedQuery || req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Experience bookings retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const getAdminDineBookings = (req, res, next) => getExperienceBookings(req, res, next, "HOME_DINING");
export const getAdminWorkshopBookings = (req, res, next) => getExperienceBookings(req, res, next, "WORKSHOP");

export const reviewWorkshop = async (req, res, next) => {
  try {
    const data = await adminService.reviewWorkshop(req.params.id, req.body);
    const message = req.body.action === "APPROVE" ? "Workshop approved and published" : "Workshop rejected";
    return sendSuccess(res, HTTP_STATUS.OK, message, data);
  } catch (error) {
    next(error);
  }
};

export const updateExperienceStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateExperienceStatus(req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Experience status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 9. REVIEWS & REPORTS MANAGEMENT
// ==========================================
export const getAllReviews = async (req, res, next) => {
  try {
    const data = await adminService.getAllReviews(req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Reviews retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateReviewStatus = async (req, res, next) => {
  try {
    const data = await adminService.updateReviewStatus(req.params.id, req.user.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Review status updated to ${req.body.status}`, data);
  } catch (error) {
    next(error);
  }
};

export const getReportedReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Reported reviews retrieved", await reviewService.listReported(req.validatedQuery)); }
  catch (error) { next(error); }
};

export const moderateReportedReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Review moderation saved", await reviewService.moderate(req.user.id, req.params.id, req.body)); }
  catch (error) { next(error); }
};

export const getSocialReports = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Social content reports retrieved.", await adminService.listSocialReports(req.validatedQuery)); }
  catch (error) { next(error); }
};

export const moderateSocialReport = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Social content moderation saved.", await adminService.moderateSocialReport(req.user.id, req.params.id, req.body)); }
  catch (error) { next(error); }
};

// ==========================================
// 10. VERIFICATION CENTER
// ==========================================
export const getPendingVerifications = async (req, res, next) => {
  try {
    const data = await adminService.getPendingVerifications();
    return sendSuccess(res, HTTP_STATUS.OK, "Pending verifications retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updateDocumentVerification = async (req, res, next) => {
  try {
    const data = await adminService.updateDocumentVerification(req.params.docId, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, `Document status updated to ${req.body.verificationStatus}`, data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 11. NOTIFICATIONS
// ==========================================
export const getNotifications = async (req, res, next) => {
  try {
    const data = await adminService.getNotifications();
    return sendSuccess(res, HTTP_STATUS.OK, "Platform notifications retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const data = await adminService.markNotificationAsRead(req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Notification marked as read", data);
  } catch (error) {
    next(error);
  }
};

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const data = await adminService.markAllNotificationsAsRead();
    return sendSuccess(res, HTTP_STATUS.OK, "All notifications marked as read", data);
  } catch (error) {
    next(error);
  }
};

// ==========================================
// 12. PLATFORM SETTINGS
// ==========================================
export const getPlatformSettings = async (req, res, next) => {
  try {
    const data = await adminService.getPlatformSettings();
    return sendSuccess(res, HTTP_STATUS.OK, "Platform settings retrieved successfully", data);
  } catch (error) {
    next(error);
  }
};

export const updatePlatformSettings = async (req, res, next) => {
  try {
    const data = await adminService.updatePlatformSettings(req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Platform settings updated successfully", data);
  } catch (error) {
    next(error);
  }
};
