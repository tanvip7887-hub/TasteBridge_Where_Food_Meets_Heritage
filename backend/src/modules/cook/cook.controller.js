import path from "path";
import fs from "fs";
import { cookService } from "./cook.service.js";
import { UPLOAD_DIRECTORY } from "../../utils/fileUpload.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { getPrivateDocumentFormat } from "../../utils/privateDocumentFormat.js";
import { cookOrdersService } from "./cook-orders.service.js";
import { createCookEarningsService } from "./cook-earnings.service.js";
import prisma from "../../config/prisma.js";
import { createReviewsService } from "../reviews/reviews.service.js";
import { createExperienceBookingsService } from "../events/experience-bookings.service.js";
import { createDineCookDecisionsService } from "../events/dine-cook-decisions.service.js";
import { createDineCancellationsService } from "../events/dine-cancellations.service.js";

const cookEarningsService = createCookEarningsService(prisma);
const cookReviewsService = createReviewsService(prisma);
const cookExperienceBookingsService = createExperienceBookingsService(prisma);
const dineCookDecisionsService = createDineCookDecisionsService(prisma);
const dineCancellationsService = createDineCancellationsService(prisma);

/**
 * GET /api/v1/cooks/application
 * Get authenticated user's cook application status and details
 */
export const getMyCookApplication = async (req, res, next) => {
  try {
    const data = await cookService.getCookApplication(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook application details retrieved", data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/cooks/application
 * Submit or resubmit cook application with multipart documents
 */
export const submitCookApplication = async (req, res, next) => {
  try {
    const data = await cookService.submitCookApplication(
      req.user.id,
      req.body,
      req.files
    );
    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      "Cook application submitted successfully. Our team will review your application.",
      data
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/cooks/documents/:id
 * Securely stream a private verification document to owner or admin
 */
export const getSecureDocument = async (req, res, next) => {
  try {
    const doc = await cookService.getDocumentById(req.params.id, req.user);

    // 1. Cloudinary Private Document Streaming
    if (doc.cloudinaryPublicId) {
      const format = getPrivateDocumentFormat(doc);
      if (!format) {
        throw new AppError("This verification document format cannot be previewed.", HTTP_STATUS.UNPROCESSABLE_ENTITY);
      }
      const resourceType = doc.resourceType || (format === "pdf" ? "raw" : "image");

      const downloadUrl = cloudinaryService.generatePrivateDocumentDownloadUrl(
        doc.cloudinaryPublicId,
        resourceType,
        format,
        900 // 15 minute token validity
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new AppError("Failed to retrieve document from cloud storage.", HTTP_STATUS.BAD_GATEWAY);
      }

      let mimeType = doc.mimeType;
      if (!mimeType) {
        const ext = (doc.fileName || "").toLowerCase().split(".").pop();
        if (ext === "pdf") mimeType = "application/pdf";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "webp") mimeType = "image/webp";
      }

      if (mimeType) {
        res.setHeader("Content-Type", mimeType);
      }
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName || "document")}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    // 2. Legacy Local File Fallback (Ensures backward compatibility)
    let filePath = path.isAbsolute(doc.documentUrl)
      ? doc.documentUrl
      : path.resolve(UPLOAD_DIRECTORY, path.basename(doc.documentUrl));

    if (!fs.existsSync(filePath)) {
      filePath = path.resolve(process.cwd(), doc.documentUrl);
    }

    if (!fs.existsSync(filePath)) {
      throw new AppError("Document file not found on server storage.", HTTP_STATUS.NOT_FOUND);
    }

    if (doc.mimeType) {
      res.setHeader("Content-Type", doc.mimeType);
    }
    res.setHeader("Content-Disposition", `inline; filename="${doc.fileName || "document"}"`);
    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/cooks/kitchen
 * Get authenticated cook's kitchen profile
 */
export const getMyKitchen = async (req, res, next) => {
  try {
    const data = await cookService.getKitchenProfile(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Kitchen profile retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const submitMyFssaiDocument = async (req, res, next) => {
  try {
    const data = await cookService.submitFssaiDocument(req.user.id, req.file);
    return sendSuccess(res, HTTP_STATUS.CREATED, "FSSAI document submitted for review", data);
  } catch (err) { next(err); }
};

export const getMyNotifications = async (req, res, next) => {
  try {
    const data = await cookService.getCookNotifications(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook notifications retrieved", data);
  } catch (err) { next(err); }
};

export const markMyNotificationRead = async (req, res, next) => {
  try {
    const data = await cookService.markCookNotificationRead(req.user.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Notification marked as read", data);
  } catch (err) { next(err); }
};

export const markAllMyNotificationsRead = async (req, res, next) => {
  try {
    const data = await cookService.markAllCookNotificationsRead(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook notifications marked as read", data);
  } catch (err) { next(err); }
};

export const getMyCookOrders = async (req, res, next) => {
  try {
    const items = await cookOrdersService.listOrders(req.user.cookProfile.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook orders retrieved successfully", { items });
  } catch (err) { next(err); }
};

export const acceptMyCookOrder = async (req, res, next) => {
  try {
    const data = await cookOrdersService.acceptOrder(req.user.cookProfile.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Order accepted successfully", data);
  } catch (err) { next(err); }
};

export const prepareMyCookOrder = async (req, res, next) => {
  try {
    const data = await cookOrdersService.prepareOrder(req.user.cookProfile.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Order preparation started", data);
  } catch (err) { next(err); }
};

export const markMyCookOrderReady = async (req, res, next) => {
  try {
    const data = await cookOrdersService.markReadyForPickup(req.user.cookProfile.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Order marked ready for pickup", data);
  } catch (err) { next(err); }
};

export const rejectMyCookOrder = async (req, res, next) => {
  try {
    const data = await cookOrdersService.rejectOrder(req.user.cookProfile.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "COD checkout rejected and cancelled", data);
  } catch (err) { next(err); }
};

export const getMyExperienceBookings = async (req, res, next) => {
  try {
    const data = await cookExperienceBookingsService.listForCook(req.user.cookProfile.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook event bookings retrieved", data);
  } catch (err) { next(err); }
};

export const getMyDineBookings = async (req, res, next) => {
  try {
    const data = await cookExperienceBookingsService.listForCook(req.user.cookProfile.id, "HOME_DINING");
    return sendSuccess(res, HTTP_STATUS.OK, "Cook Dine bookings retrieved", data);
  } catch (err) { next(err); }
};

export const getMyWorkshopBookings = async (req, res, next) => {
  try {
    const data = await cookExperienceBookingsService.listForCook(req.user.cookProfile.id, "WORKSHOP");
    return sendSuccess(res, HTTP_STATUS.OK, "Cook Workshop bookings retrieved", data);
  } catch (err) { next(err); }
};

export const acceptMyExperienceBooking = async (req, res, next) => {
  try {
    const data = await dineCookDecisionsService.acceptBooking({
      bookingId: req.params.id,
      cookId: req.user.cookProfile.id,
    });
    return sendSuccess(res, HTTP_STATUS.OK, "Experience booking accepted; customer payment is pending", data);
  } catch (err) { next(err); }
};

export const rejectMyExperienceBooking = async (req, res, next) => {
  try {
    const data = await dineCookDecisionsService.rejectBooking({
      bookingId: req.params.id,
      cookId: req.user.cookProfile.id,
    });
    return sendSuccess(res, HTTP_STATUS.OK, "Experience booking rejected and reserved seats released", data);
  } catch (err) { next(err); }
};

export const completeMyExperienceBooking = async (req, res, next) => {
  try {
    const data = await cookExperienceBookingsService.completeBooking({
      bookingId: req.params.id,
      cookId: req.user.cookProfile.id,
    });
    return sendSuccess(res, HTTP_STATUS.OK, "Event booking marked completed", data);
  } catch (err) { next(err); }
};

export const approveMyExperienceCancellation = async (req, res, next) => {
  try {
    const data = await dineCancellationsService.approveCancellation(req.user.cookProfile.id, req.params.id);
    const message = data.refund
      ? "Cancellation approved. Booking cancelled and simulated refund recorded."
      : "Cancellation approved. Booking cancelled and reserved seats released.";
    return sendSuccess(res, HTTP_STATUS.OK, message, data);
  } catch (err) { next(err); }
};

export const rejectMyExperienceCancellation = async (req, res, next) => {
  try {
    const data = await dineCancellationsService.rejectCancellation(
      req.user.cookProfile.id,
      req.params.id,
      req.body?.rejectionReason,
    );
    return sendSuccess(res, HTTP_STATUS.OK, "Cancellation request rejected. Booking remains confirmed.", data);
  } catch (err) { next(err); }
};

/**
 * PUT /api/v1/cooks/kitchen
 * Update authenticated cook's kitchen profile
 */
export const updateMyKitchen = async (req, res, next) => {
  try {
    const data = await cookService.updateKitchenProfile(req.user.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Kitchen profile updated successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/cooks/kitchen/photo
 * Upload or update kitchen profile photo through Cloudinary
 */
export const uploadMyKitchenPhoto = async (req, res, next) => {
  try {
    const file = req.file;
    const data = await cookService.updateKitchenPhoto(req.user.id, file);
    return sendSuccess(res, HTTP_STATUS.OK, "Kitchen photo updated successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/cooks/dashboard
 * Get authenticated cook's real dashboard metrics and feeds
 */
export const getMyCookDashboard = async (req, res, next) => {
  try {
    const data = await cookService.getCookDashboard(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook dashboard data retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

export const getMyCookEarnings = async (req, res, next) => {
  try {
    const data = await cookEarningsService.getEarnings(req.user.id, req.validatedQuery);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook earnings retrieved", data);
  } catch (err) { next(err); }
};

export const getMyCookReviews = async (req, res, next) => {
  try {
    const data = await cookReviewsService.listForCook(req.user.cookProfile.id, req.validatedQuery);
    return sendSuccess(res, HTTP_STATUS.OK, "Cook reviews retrieved", data);
  } catch (err) { next(err); }
};

export const replyToCookReview = async (req, res, next) => {
  try {
    const data = await cookReviewsService.reply(req.user.cookProfile.id, req.params.id, req.body.reply);
    return sendSuccess(res, HTTP_STATUS.OK, "Review reply saved", data);
  } catch (err) { next(err); }
};

export const reportCookReview = async (req, res, next) => {
  try {
    const data = await cookReviewsService.report(req.user.cookProfile.id, req.params.id, req.body.reason);
    return sendSuccess(res, HTTP_STATUS.CREATED, "Review reported for moderation", data);
  } catch (err) { next(err); }
};

// =========================================================================
// DISH CONTROLLERS (COOK ONLY)
// =========================================================================

/**
 * GET /api/v1/cooks/dishes
 * List authenticated cook's own dishes
 */
export const getMyDishes = async (req, res, next) => {
  try {
    const data = await cookService.getCookDishes(req.user.id, req.query);
    return sendSuccess(res, HTTP_STATUS.OK, "Dishes retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/cooks/dishes/:id
 * Get single dish details
 */
export const getMyDishById = async (req, res, next) => {
  try {
    const data = await cookService.getCookDishById(req.user.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish details retrieved successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/cooks/dishes
 * Create a new dish
 */
export const createMyDish = async (req, res, next) => {
  try {
    const file = req.file;
    const data = await cookService.createCookDish(req.user.id, req.body, file);
    return sendSuccess(res, HTTP_STATUS.CREATED, "Dish created successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/cooks/dishes/:id
 * Update an existing dish
 */
export const updateMyDish = async (req, res, next) => {
  try {
    const data = await cookService.updateCookDish(req.user.id, req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish updated successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/cooks/dishes/:id/photo
 * Upload or replace dish photo
 */
export const uploadMyDishPhoto = async (req, res, next) => {
  try {
    const file = req.file;
    const data = await cookService.uploadCookDishPhoto(req.user.id, req.params.id, file);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish photo uploaded successfully", data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/cooks/dishes/:id/publish
 * Publish a dish with cultural story check
 */
export const publishMyDish = async (req, res, next) => {
  try {
    const storyData = req.body?.story || req.body;
    const data = await cookService.publishCookDish(req.user.id, req.params.id, storyData);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish published successfully to kitchen menu", data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/cooks/dishes/:id/unpublish
 * Unpublish dish
 */
export const unpublishMyDish = async (req, res, next) => {
  try {
    const data = await cookService.unpublishCookDish(req.user.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish unpublished from active menu", data);
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/cooks/dishes/:id/availability
 * Toggle available-for-ordering status
 */
export const updateMyDishAvailability = async (req, res, next) => {
  try {
    const { isAvailable } = req.body;
    const data = await cookService.updateCookDishAvailability(req.user.id, req.params.id, isAvailable);
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      isAvailable ? "Dish marked as available for orders" : "Dish marked as unavailable for orders",
      data
    );
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/cooks/dishes/:id/stock
 * Update dish stock quantities
 */
export const updateMyDishStock = async (req, res, next) => {
  try {
    const data = await cookService.updateCookDishStock(req.user.id, req.params.id, req.body);
    return sendSuccess(res, HTTP_STATUS.OK, "Dish inventory and stock limits updated", data);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/cooks/dishes/:id
 * Remove draft or unpublished dish
 */
export const deleteMyDish = async (req, res, next) => {
  try {
    const data = await cookService.deleteCookDish(req.user.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, data.message, data);
  } catch (err) {
    next(err);
  }
};

export default {
  getMyCookApplication,
  submitCookApplication,
  getSecureDocument,
  getMyCookOrders,
  acceptMyCookOrder,
  rejectMyCookOrder,
  getMyKitchen,
  updateMyKitchen,
  uploadMyKitchenPhoto,
  getMyCookDashboard,
  getMyCookEarnings,
  getMyDishes,
  getMyDishById,
  createMyDish,
  updateMyDish,
  uploadMyDishPhoto,
  publishMyDish,
  unpublishMyDish,
  updateMyDishAvailability,
  updateMyDishStock,
  deleteMyDish,
  approveMyExperienceCancellation,
  rejectMyExperienceCancellation,
};
