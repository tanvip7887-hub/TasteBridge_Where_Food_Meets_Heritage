import { z } from "zod";

// Verification status enum values: PENDING, APPROVED, REJECTED, NEEDS_REVISION
export const updateVerificationStatusSchema = {
  body: z.object({
    verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "NEEDS_REVISION"], {
      required_error: "verificationStatus is required",
    }),
    rejectionReason: z.string().optional(),
    revisionReason: z.string().optional(),
    // FSSAI status is changed only through the dedicated document-review workflow.
    fssaiStatus: z.never().optional(),
    isApprovedToSell: z.boolean().optional(),
  }),
};

export const reviewDeliveryAgentPayoutDetailsSchema = {
  body: z.object({
    action: z.enum(["APPROVE", "REJECT"]),
    rejectionReason: z.string().trim().max(2000).optional(),
  }).strict().superRefine((data, context) => {
    if (data.action === "REJECT" && !data.rejectionReason) {
      context.addIssue({ code: "custom", path: ["rejectionReason"], message: "A rejection reason is required." });
    }
  }),
};

export const cookFssaiReviewSchema = {
  body: z.object({
    action: z.enum(["APPROVE", "REJECT", "REQUEST_NEW_DOCUMENT"]),
    documentId: z.string().min(1).optional(),
    rejectionReason: z.string().trim().max(2000).optional(),
    fssaiStatusType: z.enum(["HAVE_REGISTRATION", "APPLIED_ON_FOSCOS", "NOT_YET_REGISTERED"]).optional(),
    fssaiExpiryDate: z.preprocess((value) => value === "" ? undefined : value, z.string().date().optional()),
  }).superRefine((data, context) => {
    if (data.action === "APPROVE" && !data.documentId) {
      context.addIssue({ code: "custom", path: ["documentId"], message: "An FSSAI document is required for approval." });
    }
    if (data.action === "APPROVE" && !data.fssaiExpiryDate) {
      context.addIssue({ code: "custom", path: ["fssaiExpiryDate"], message: "Record the FSSAI expiry date when approving." });
    }
    if (data.action !== "APPROVE" && !data.rejectionReason) {
      context.addIssue({ code: "custom", path: ["rejectionReason"], message: "A reason is required for this FSSAI decision." });
    }
    if (data.action !== "APPROVE" && !data.documentId) {
      context.addIssue({ code: "custom", path: ["documentId"], message: "Select the submitted FSSAI document to review." });
    }
  }),
};

// Account status enum values: PENDING, ACTIVE, SUSPENDED, DEACTIVATED
export const updateAccountStatusSchema = {
  body: z.object({
    status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"], {
      required_error: "status is required",
    }),
  }),
};

// Dish status enum values: DRAFT, PENDING_APPROVAL, PUBLISHED, UNPUBLISHED, REJECTED
export const updateDishStatusSchema = {
  body: z.object({
    status: z.enum(["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "UNPUBLISHED", "REJECTED"], {
      required_error: "status is required",
    }),
  }),
};

// Create Food Category schema
export const createCategorySchema = {
  body: z.object({
    name: z.string({ required_error: "Category name is required" }).min(1, "Name cannot be empty"),
    description: z.string().optional(),
    image: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
};

// Update Food Category schema
export const updateCategorySchema = {
  body: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    isActive: z.boolean().optional(),
  }),
};

// Order status update schema
export const updateOrderStatusSchema = {
  body: z.object({
    status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"], {
      required_error: "status is required",
    }),
  }).strict(),
};

// Experience status update schema
export const updateExperienceStatusSchema = {
  body: z.object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"], {
      required_error: "status is required",
    }),
  }),
};

export const adminExperiencesQuerySchema = {
  query: z.object({
    type: z.enum(["HOME_DINING", "WORKSHOP"]).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "PAUSED", "PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
    cuisine: z.string().trim().max(120).optional(),
    search: z.string().trim().max(120).optional(),
  }).strict(),
};

export const adminExperienceBookingsQuerySchema = {
  query: z.object({
    status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "ACCEPTED", "REJECTED"]).optional(),
    paymentStatus: z.enum(["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "UNPAID"]).optional(),
    search: z.string().trim().max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }).strict(),
};

export const reviewWorkshopSchema = {
  params: z.object({ id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }),
  body: z.object({
    action: z.enum(["APPROVE", "REJECT"]),
    rejectionReason: z.string().trim().min(5).max(2000).optional(),
  }).strict().superRefine((data, context) => {
    if (data.action === "REJECT" && !data.rejectionReason) {
      context.addIssue({ code: "custom", path: ["rejectionReason"], message: "A rejection reason is required." });
    }
  }),
};

// Review status update schema
export const updateReviewStatusSchema = {
  body: z.object({
    status: z.enum(["PUBLISHED", "HIDDEN", "REMOVED"], {
      required_error: "status is required",
    }),
    reason: z.string().trim().min(5).max(500),
  }),
};

export const socialReportsQuerySchema = {
  query: z.object({
    status: z.enum(["PENDING", "REVIEWED", "DISMISSED", "ACTION_TAKEN"]).optional(),
    targetType: z.enum(["POST", "STORY", "COMMENT"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }).strict(),
};

export const moderateSocialReportSchema = {
  params: z.object({ id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/) }),
  body: z.object({
    action: z.enum(["MARK_REVIEWED", "DISMISS", "HIDE"]),
    reason: z.string().trim().min(5).max(500),
  }).strict(),
};

// Update Verification Document schema
export const updateDocumentVerificationSchema = {
  body: z.object({
    verificationStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "NEEDS_REVISION"], {
      required_error: "verificationStatus is required",
    }),
    rejectionReason: z.string().optional(),
  }),
};

// Platform Settings schema
export const updatePlatformSettingsSchema = {
  body: z.object({
    platformFeePercent: z.number().min(0).max(100).optional(),
    deliveryFeeBase: z.number().min(0).optional(),
    experienceCancellationWindowHours: z.number().int().min(0).max(720).optional(),
    experienceCookResponseWindowHours: z.number().int().min(1).max(168).optional(),
    experienceBookingCutoffHours: z.number().int().min(0).max(168).optional(),
    experiencePaymentHoldMinutes: z.number().int().min(1).max(1440).optional(),
  }),
};
