import express from "express";
import {
  getMyCookApplication,
  submitCookApplication,
  getSecureDocument,
  getMyCookOrders,
  acceptMyCookOrder,
  prepareMyCookOrder,
  markMyCookOrderReady,
  rejectMyCookOrder,
  getMyExperienceBookings,
  getMyDineBookings,
  getMyWorkshopBookings,
  acceptMyExperienceBooking,
  rejectMyExperienceBooking,
  completeMyExperienceBooking,
  approveMyExperienceCancellation,
  rejectMyExperienceCancellation,
  getMyKitchen,
  submitMyFssaiDocument,
  getMyNotifications,
  markMyNotificationRead,
  markAllMyNotificationsRead,
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
  getMyCookReviews,
  replyToCookReview,
  reportCookReview,
} from "./cook.controller.js";
import { authenticate, requireApprovedCook } from "../../middlewares/auth.js";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { documentUpload, imageUpload, validateUploadedFileContent } from "../../utils/fileUpload.js";
import { validate } from "../../middlewares/validate.js";
import { orderIdSchema } from "../orders/orders.validation.js";
import { cookRejectCancellationSchema } from "../events/dine-bookings.validation.js";
import {
  cookApplicationSchema,
  kitchenUpdateSchema,
  createDishSchema,
  updateDishSchema,
  updateDishStockSchema,
  updateDishAvailabilitySchema,
  cookEarningsQuerySchema,
} from "./cook.validation.js";
import { cookReviewsSchema, replySchema, reportSchema } from "../reviews/reviews.validation.js";
import {
  listMyExperiences, createMyExperience, publishNewMyExperience, updateMyExperience, publishMyExperience, pauseMyExperience,
  uploadMyExperiencePhoto, listMyExperienceSlots, createMyExperienceSlot, updateMyExperienceSlot,
  cancelMyExperienceSlot, replaceMyWorkshopPhoto, removeMyWorkshopPhoto,
} from "./cook-experiences.controller.js";
import {
  createExperienceDraftSchema, publishExperienceSchema, updateExperienceDraftSchema, cookExperienceIdSchema,
  createExperienceSlotSchema, updateExperienceSlotSchema, experienceSlotIdSchema,
} from "./experience.validation.js";
import {
  listMySocialStories, createMySocialStoryPhoto, createMySocialStoryVideo, deleteMySocialStory,
  listMySocialPosts, createMySocialPostDraft, createMySocialPostPhotos, createMySocialPostVideo,
  updateMySocialPost, replaceMySocialPostPhotos, replaceMySocialPostVideo, deleteMySocialPost,
} from "./social-content.controller.js";
import {
  listSocialPostsSchema, createSocialStorySchema, createSocialPostDraftSchema,
  createSocialPostWithPhotosSchema, createSocialPostWithVideoSchema, updateSocialPostSchema,
  socialContentIdSchema,
} from "./social-content.validation.js";
import { videoUpload, validateSocialVideoContent } from "../../utils/socialMediaUpload.js";
import { listMyPostComments } from "./post-interactions.controller.js";
import { listCookPostCommentsSchema } from "./post-interactions.validation.js";

const router = express.Router();

// All cook routes require user authentication
router.use(authenticate);

// 1. Get current applicant's cook profile and application status
router.get("/application", getMyCookApplication);

// 2. Submit or resubmit cook application with uploaded documents
router.post(
  "/application",
  documentUpload.fields([
    { name: "identityProof", maxCount: 1 },
    { name: "fssaiProof", maxCount: 1 },
    { name: "addressProof", maxCount: 1 },
  ]),
  validateUploadedFileContent,
  validate(cookApplicationSchema),
  submitCookApplication
);

// 3. Secure document download/viewing (accessible only by document owner or admin)
router.get("/documents/:id", getSecureDocument);

// =========================================================================
// APPROVED COOK PANEL ENDPOINTS (Protected by requireApprovedCook)
// =========================================================================

// 4. Get authenticated cook's kitchen profile
router.get("/kitchen", requireApprovedCook, getMyKitchen);
router.post("/fssai-document", requireApprovedCook, documentUpload.single("fssaiProof"), validateUploadedFileContent, submitMyFssaiDocument);
router.get("/notifications", requireApprovedCook, getMyNotifications);
router.patch("/notifications/read-all", requireApprovedCook, markAllMyNotificationsRead);
router.patch("/notifications/:id/read", requireApprovedCook, markMyNotificationRead);
router.get("/orders", requireApprovedCook, getMyCookOrders);
router.patch("/orders/:id/accept", requireApprovedCook, validate(orderIdSchema), acceptMyCookOrder);
router.patch("/orders/:id/prepare", requireApprovedCook, validate(orderIdSchema), prepareMyCookOrder);
router.patch("/orders/:id/ready", requireApprovedCook, validate(orderIdSchema), markMyCookOrderReady);
router.patch("/orders/:id/reject", requireApprovedCook, validate(orderIdSchema), rejectMyCookOrder);
router.get("/experience-bookings/dine", requireApprovedCook, getMyDineBookings);
router.get("/experience-bookings/workshops", requireApprovedCook, getMyWorkshopBookings);
router.get("/experience-bookings", requireApprovedCook, getMyExperienceBookings);
router.patch("/experience-bookings/:id/accept", requireApprovedCook, validate(orderIdSchema), acceptMyExperienceBooking);
router.patch("/experience-bookings/:id/reject", requireApprovedCook, validate(orderIdSchema), rejectMyExperienceBooking);
router.patch("/experience-bookings/:id/complete", requireApprovedCook, validate(orderIdSchema), completeMyExperienceBooking);
router.patch("/experience-bookings/:id/cancellation/approve", requireApprovedCook, validate(orderIdSchema), approveMyExperienceCancellation);
router.patch("/experience-bookings/:id/cancellation/reject", requireApprovedCook, validate(cookRejectCancellationSchema), rejectMyExperienceCancellation);

// Cook-owned social Stories and Posts. Identity always comes from req.user.
router.get("/social/stories", requireApprovedCook, listMySocialStories);
router.post("/social/stories/photos", requireApprovedCook, imageUpload.single("photo"), validateUploadedFileContent, validate(createSocialStorySchema), createMySocialStoryPhoto);
router.post("/social/stories/videos", requireApprovedCook, videoUpload.single("video"), validateSocialVideoContent, validate(createSocialStorySchema), createMySocialStoryVideo);
router.delete("/social/stories/:id", requireApprovedCook, validate(socialContentIdSchema), deleteMySocialStory);
router.get("/social/posts", requireApprovedCook, validate(listSocialPostsSchema), listMySocialPosts);
router.get("/social/comments", requireApprovedCook, validate(listCookPostCommentsSchema), listMyPostComments);
router.post("/social/posts", requireApprovedCook, validate(createSocialPostDraftSchema), createMySocialPostDraft);
router.post("/social/posts/photos", requireApprovedCook, imageUpload.array("photos", 5), validateUploadedFileContent, validate(createSocialPostWithPhotosSchema), createMySocialPostPhotos);
router.post("/social/posts/videos", requireApprovedCook, videoUpload.single("video"), validateSocialVideoContent, validate(createSocialPostWithVideoSchema), createMySocialPostVideo);
router.patch("/social/posts/:id", requireApprovedCook, validate(updateSocialPostSchema), updateMySocialPost);
router.put("/social/posts/:id/photos", requireApprovedCook, validate(socialContentIdSchema), imageUpload.array("photos", 5), validateUploadedFileContent, replaceMySocialPostPhotos);
router.put("/social/posts/:id/videos", requireApprovedCook, validate(socialContentIdSchema), videoUpload.single("video"), validateSocialVideoContent, replaceMySocialPostVideo);
router.delete("/social/posts/:id", requireApprovedCook, validate(socialContentIdSchema), deleteMySocialPost);

// Cook-managed Dine experiences and their availability slots.
router.get("/experiences", requireApprovedCook, listMyExperiences);
router.post(
  "/experiences/publish",
  requireApprovedCook,
  imageUpload.single("workshopImage"),
  validateUploadedFileContent,
  (req, _res, next) => {
    if (!req.is("multipart/form-data")) return next();
    try {
      if (typeof req.body?.payload !== "string") throw new Error("Missing workshop details.");
      req.body = JSON.parse(req.body.payload);
      return next();
    } catch {
      return next(new AppError("Workshop details could not be read. Please review the form and try again.", HTTP_STATUS.BAD_REQUEST));
    }
  },
  validate(publishExperienceSchema),
  publishNewMyExperience,
);
router.post("/experiences", requireApprovedCook, validate(createExperienceDraftSchema), createMyExperience);
router.patch("/experiences/:id", requireApprovedCook, validate(updateExperienceDraftSchema), updateMyExperience);
router.patch("/experiences/:id/publish", requireApprovedCook, validate(cookExperienceIdSchema), publishMyExperience);
router.patch("/experiences/:id/pause", requireApprovedCook, validate(cookExperienceIdSchema), pauseMyExperience);
router.post(
  "/experiences/:id/photos",
  requireApprovedCook,
  validate(cookExperienceIdSchema),
  imageUpload.single("photo"),
  validateUploadedFileContent,
  uploadMyExperiencePhoto,
);
router.put(
  "/experiences/:id/workshop-image",
  requireApprovedCook,
  validate(cookExperienceIdSchema),
  imageUpload.single("photo"),
  validateUploadedFileContent,
  replaceMyWorkshopPhoto,
);
router.delete("/experiences/:id/workshop-image", requireApprovedCook, validate(cookExperienceIdSchema), removeMyWorkshopPhoto);
router.get("/experiences/:id/slots", requireApprovedCook, validate(cookExperienceIdSchema), listMyExperienceSlots);
router.post("/experiences/:id/slots", requireApprovedCook, validate(createExperienceSlotSchema), createMyExperienceSlot);
router.patch("/experiences/:id/slots/:slotId", requireApprovedCook, validate(updateExperienceSlotSchema), updateMyExperienceSlot);
router.patch("/experiences/:id/slots/:slotId/cancel", requireApprovedCook, validate(experienceSlotIdSchema), cancelMyExperienceSlot);

// 5. Update authenticated cook's kitchen profile
router.put(
  "/kitchen",
  requireApprovedCook,
  validate(kitchenUpdateSchema),
  updateMyKitchen
);

// 6. Upload or update kitchen profile photo via Cloudinary
router.post(
  "/kitchen/photo",
  requireApprovedCook,
  imageUpload.single("photo"),
  validateUploadedFileContent,
  uploadMyKitchenPhoto
);

// 7. Get authenticated cook's real dashboard metrics and feeds
router.get("/dashboard", requireApprovedCook, getMyCookDashboard);
router.get("/earnings", requireApprovedCook, validate(cookEarningsQuerySchema), getMyCookEarnings);
router.get("/reviews", requireApprovedCook, validate(cookReviewsSchema), getMyCookReviews);
router.post("/reviews/:id/reply", requireApprovedCook, validate(replySchema), replyToCookReview);
router.post("/reviews/:id/report", requireApprovedCook, validate(reportSchema), reportCookReview);

// =========================================================================
// APPROVED COOK DISH ENDPOINTS
// =========================================================================

// 8. List dishes owned by authenticated cook (with optional search, category, status filters)
router.get("/dishes", requireApprovedCook, getMyDishes);

// 9. Get specific dish details owned by authenticated cook
router.get("/dishes/:id", requireApprovedCook, getMyDishById);

// 10. Create new dish (default DRAFT or PUBLISHED if valid story provided)
router.post(
  "/dishes",
  requireApprovedCook,
  imageUpload.single("photo"),
  validateUploadedFileContent,
  validate(createDishSchema),
  createMyDish
);

// 11. Update existing dish details
router.put(
  "/dishes/:id",
  requireApprovedCook,
  validate(updateDishSchema),
  updateMyDish
);

// 12. Upload or update dish photo
router.post(
  "/dishes/:id/photo",
  requireApprovedCook,
  imageUpload.single("photo"),
  validateUploadedFileContent,
  uploadMyDishPhoto
);

// 13. Publish dish (enforces cultural heritage story requirements)
router.patch("/dishes/:id/publish", requireApprovedCook, publishMyDish);

// 14. Unpublish dish
router.patch("/dishes/:id/unpublish", requireApprovedCook, unpublishMyDish);

// 15. Toggle availability for customer ordering
router.patch(
  "/dishes/:id/availability",
  requireApprovedCook,
  validate(updateDishAvailabilitySchema),
  updateMyDishAvailability
);

// 16. Update inventory quantity & low stock threshold
router.patch(
  "/dishes/:id/stock",
  requireApprovedCook,
  validate(updateDishStockSchema),
  updateMyDishStock
);

// 17. Delete dish (if no order history) or unpublish/archive
router.delete("/dishes/:id", requireApprovedCook, deleteMyDish);

export default router;

