import { z } from "zod";
import {
  COOK_PROFILE_TEXT_MINIMUMS,
  cookProfileTextLength,
  trimCookProfileText,
} from "../../utils/cookReadiness.js";
import { normalizeCurrency, toPaise } from "../../utils/money.js";

const dishPrice = z.union([z.number().finite(), z.string().trim().min(1)])
  .transform((value, context) => {
    try {
      const normalized = normalizeCurrency(value);
      if (toPaise(normalized) <= 0n) {
        context.addIssue({ code: "custom", message: "Price must be greater than 0." });
        return z.NEVER;
      }
      return normalized;
    } catch {
      context.addIssue({ code: "custom", message: "Price must be a valid amount within the supported currency range." });
      return z.NEVER;
    }
  });

const cookProfileText = ({
  minimum,
  minimumMessage,
  maximum,
  maximumMessage,
  requiredMessage,
}) => {
  const stringSchema = requiredMessage
    ? z.string({ required_error: requiredMessage })
    : z.string();

  return stringSchema
    .transform(trimCookProfileText)
    .superRefine((value, context) => {
      if (cookProfileTextLength(value) < minimum) {
        context.addIssue({ code: "custom", message: minimumMessage });
      }
      // Keep the existing Zod UTF-16 max-length behavior unchanged.
      if (maximum !== undefined && value.length > maximum) {
        context.addIssue({ code: "custom", message: maximumMessage });
      }
    });
};

export const cookApplicationSchema = {
  body: z.object({
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must be at most 100 characters")
      .optional(),
    phone: z
      .string()
      .regex(/^\+?[0-9]{10,14}$/, "Please provide a valid 10-14 digit phone number")
      .optional()
      .or(z.literal("")),
    businessName: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.businessName,
      minimumMessage: "Kitchen display name must be at least 2 characters",
      maximum: 100,
      maximumMessage: "Kitchen display name must be at most 100 characters",
      requiredMessage: "Kitchen / cook display name is required",
    }),
    bio: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.bio,
      minimumMessage: "Introduction must be at least 15 characters",
      maximum: 1500,
      maximumMessage: "Introduction cannot exceed 1500 characters",
      requiredMessage: "Please share a short introduction about your cooking",
    }),
    experienceYears: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.experienceYears,
      minimumMessage: "Please select or state your cooking experience",
      requiredMessage: "Cooking experience is required",
    }),
    specialization: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.specialization,
      minimumMessage: "Specialization must be at least 2 characters",
      maximum: 200,
      maximumMessage: "Specialization cannot exceed 200 characters",
      requiredMessage: "Your culinary specialization or signature dish is required",
    }),
    cuisines: z
      .union([
        z.array(z.string()).min(1, "Please select at least one regional cuisine"),
        z.string().min(1, "Please select at least one regional cuisine"),
      ]),
    signatureDishes: z.string().optional(),
    dietaryPreferences: z
      .union([
        z.array(z.string()).min(1, "Please select at least one dietary preference"),
        z.string().min(1, "Please select at least one dietary preference"),
      ]),
    city: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.city,
      minimumMessage: "City must be at least 2 characters",
      requiredMessage: "Operating city is required",
    }),
    locality: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.locality,
      minimumMessage: "Locality must be at least 2 characters",
      requiredMessage: "Locality / neighborhood is required",
    }),
    serviceArea: z.string().optional(),
    cookingCapacity: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.cookingCapacity,
      minimumMessage: "Please specify your typical daily capacity",
      requiredMessage: "Cooking capacity per day is required",
    }),
    availableDays: z
      .union([
        z.array(z.string()).min(1, "Please select at least one available day"),
        z.string().min(1, "Please select at least one available day"),
      ]),
    availableMealSlots: z
      .union([
        z.array(z.string()).min(1, "Please select at least one meal slot"),
        z.string().min(1, "Please select at least one meal slot"),
      ]),
    prepTimeNotice: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.prepTimeNotice,
      minimumMessage: "Please specify your preparation time notice",
      requiredMessage: "Preparation lead time notice is required",
    }),
    isHomeKitchenDeclared: z.preprocess((val) => {
      if (typeof val === "string") return val === "true" || val === "1";
      return Boolean(val);
    }, z.boolean().refine((val) => val === true, {
      message: "You must confirm you operate from a hygienic home kitchen",
    })),
    fssaiHasRegistration: z.preprocess((val) => {
      if (typeof val === "string") return val === "true" || val === "yes";
      return Boolean(val);
    }, z.boolean().optional()),
    fssaiNumber: z
      .string()
      .optional()
      .refine(
        (val) => !val || /^[0-9]{14}$/.test(val) || /^[A-Za-z0-9\-_]{5,20}$/.test(val),
        "FSSAI registration number must be a valid 14-digit number or FoSCoS application number"
      ),
    fssaiApplicationReference: z.string().max(100).optional(),
    fssaiStatusType: z
      .enum(["HAVE_REGISTRATION", "APPLIED_ON_FOSCOS", "NOT_YET_REGISTERED"])
      .optional(),
    foodSafetyConsent: z.preprocess((val) => {
      if (typeof val === "string") return val === "true" || val === "1";
      return Boolean(val);
    }, z.boolean().refine((val) => val === true, {
      message:
        "You must agree to the Food Safety & Hygiene Agreement before submitting your application.",
    })),
    foodSafetyAgreementVersion: z.string().optional().default("v1.0"),
    identityDocumentType: z.string().optional().default("IDENTITY_PROOF"),
    identityDocumentNumber: z.string().optional(),
  }).superRefine((data, context) => {
    if (data.fssaiStatusType === "HAVE_REGISTRATION" && data.fssaiNumber && !/^[0-9]{14}$/.test(data.fssaiNumber)) {
      context.addIssue({ code: "custom", path: ["fssaiNumber"], message: "Enter the 14-digit FSSAI registration number." });
    }
  }),
};

export const kitchenUpdateSchema = {
  body: z.object({
    fssaiNumber: z.string().trim().max(30).optional().nullable(),
    fssaiApplicationReference: z.string().trim().max(100).optional().nullable(),
    fssaiStatusType: z.enum(["HAVE_REGISTRATION", "APPLIED_ON_FOSCOS", "NOT_YET_REGISTERED"]).optional().nullable(),
    businessName: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.businessName,
      minimumMessage: "Kitchen display name must be at least 2 characters",
      maximum: 100,
      maximumMessage: "Kitchen display name must be at most 100 characters",
    }).optional(),
    bio: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.bio,
      minimumMessage: "Introduction must be at least 15 characters",
      maximum: 2000,
      maximumMessage: "Introduction and cooking story cannot exceed 2000 characters",
    }).optional().nullable(),
    whoTaughtCooking: z
      .string()
      .max(200, "Who taught cooking cannot exceed 200 characters")
      .optional()
      .nullable(),
    experienceYears: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.experienceYears,
      minimumMessage: "Please specify your cooking experience",
    }).optional().nullable(),
    specialization: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.specialization,
      minimumMessage: "Specialization must be at least 2 characters",
      maximum: 200,
      maximumMessage: "Specialization cannot exceed 200 characters",
    }).optional().nullable(),
    signatureDishes: z
      .string()
      .max(500, "Signature dish cannot exceed 500 characters")
      .optional()
      .nullable(),
    city: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.city,
      minimumMessage: "City must be at least 2 characters",
    }).optional().nullable(),
    locality: cookProfileText({
      minimum: COOK_PROFILE_TEXT_MINIMUMS.locality,
      minimumMessage: "Locality must be at least 2 characters",
    }).optional().nullable(),
    serviceArea: z
      .string()
      .max(200, "Service area cannot exceed 200 characters")
      .optional()
      .nullable(),
    isOpen: z
      .preprocess((val) => {
        if (typeof val === "string") return val === "true" || val === "1";
        if (typeof val === "boolean") return val;
        return Boolean(val);
      }, z.boolean())
      .optional(),
    cuisines: z
      .union([
        z.array(z.string()),
        z.string(),
      ])
      .optional(),
    dietaryPreferences: z
      .union([
        z.array(z.string()),
        z.string(),
      ])
      .optional(),
  }).superRefine((data, context) => {
    if (data.fssaiStatusType === "HAVE_REGISTRATION" && data.fssaiNumber && !/^[0-9]{14}$/.test(data.fssaiNumber)) {
      context.addIssue({ code: "custom", path: ["fssaiNumber"], message: "Enter the 14-digit FSSAI registration number." });
    }
  }),
};

// =========================================================================
// DISH & STORY VALIDATION SCHEMAS
// =========================================================================

export const dishStorySchema = z.object({
  whoTaught: z
    .string({ required_error: "Please share who taught you this recipe" })
    .min(2, "Teacher name or family reference must be at least 2 characters")
    .max(200, "Teacher reference cannot exceed 200 characters"),
  occasion: z
    .string()
    .max(200, "Occasion cannot exceed 200 characters")
    .optional()
    .nullable(),
  culturalSignificance: z
    .string()
    .max(3000, "Cultural significance cannot exceed 3000 characters")
    .optional()
    .nullable(),
  storyText: z
    .string({ required_error: "Heritage story is required" })
    .min(10, "Story must be at least 10 characters long")
    .max(5000, "Story cannot exceed 5000 characters"),
  visibility: z
    .enum(["PUBLIC", "PRIVATE", "ARCHIVE_ONLY"])
    .default("PUBLIC"),
  mediaUrl: z
    .string()
    .url("Media URL must be valid")
    .optional()
    .nullable(),
});

export const createDishSchema = {
  body: z.object({
    name: z
      .string({ required_error: "Dish name is required" })
      .min(2, "Dish name must be at least 2 characters")
      .max(120, "Dish name cannot exceed 120 characters"),
    description: z
      .string()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional()
      .nullable(),
    cuisine: z
      .string({ required_error: "Cuisine is required" })
      .min(2, "Cuisine must be at least 2 characters")
      .max(60, "Cuisine cannot exceed 60 characters"),
    categoryId: z
      .string()
      .min(1, "Category ID is required")
      .optional()
      .nullable(),
    price: dishPrice,
    isVegetarian: z.coerce.boolean().default(true),
    ingredients: z
      .union([z.array(z.string()), z.string()])
      .optional(),
    instructions: z
      .string()
      .max(5000, "Instructions cannot exceed 5000 characters")
      .optional()
      .nullable(),
    prepTimeMinutes: z.coerce
      .number()
      .int()
      .min(1, "Preparation time must be at least 1 minute")
      .max(1440, "Preparation time cannot exceed 24 hours")
      .optional()
      .default(30),
    dietaryTags: z
      .union([z.array(z.string()), z.string()])
      .optional(),
    availableQuantity: z.coerce
      .number()
      .int()
      .min(0, "Available quantity cannot be negative")
      .default(10),
    lowStockThreshold: z.coerce
      .number()
      .int()
      .min(0, "Low-stock threshold cannot be negative")
      .default(3),
    isAvailable: z.coerce.boolean().default(true),
    status: z
      .enum(["DRAFT", "PENDING_APPROVAL", "UNPUBLISHED"])
      .optional()
      .default("DRAFT"),
    // Optional nested story or flat story fields
    story: dishStorySchema.optional(),
    whoTaught: z.string().max(200).optional(),
    occasion: z.string().max(200).optional(),
    culturalSignificance: z.string().max(3000).optional(),
    storyText: z.string().max(5000).optional(),
    storyVisibility: z.enum(["PUBLIC", "PRIVATE", "ARCHIVE_ONLY"]).optional(),
  }),
};

export const updateDishSchema = {
  body: z.object({
    name: z
      .string()
      .min(2, "Dish name must be at least 2 characters")
      .max(120, "Dish name cannot exceed 120 characters")
      .optional(),
    description: z
      .string()
      .max(2000, "Description cannot exceed 2000 characters")
      .optional()
      .nullable(),
    cuisine: z
      .string()
      .min(2, "Cuisine must be at least 2 characters")
      .max(60, "Cuisine cannot exceed 60 characters")
      .optional(),
    categoryId: z
      .string()
      .optional()
      .nullable(),
    price: dishPrice.optional(),
    isVegetarian: z.coerce.boolean().optional(),
    ingredients: z
      .union([z.array(z.string()), z.string()])
      .optional(),
    instructions: z
      .string()
      .max(5000, "Instructions cannot exceed 5000 characters")
      .optional()
      .nullable(),
    prepTimeMinutes: z.coerce
      .number()
      .int()
      .min(1, "Preparation time must be at least 1 minute")
      .max(1440, "Preparation time cannot exceed 24 hours")
      .optional(),
    dietaryTags: z
      .union([z.array(z.string()), z.string()])
      .optional(),
    availableQuantity: z.coerce
      .number()
      .int()
      .min(0, "Available quantity cannot be negative")
      .optional(),
    lowStockThreshold: z.coerce
      .number()
      .int()
      .min(0, "Low-stock threshold cannot be negative")
      .optional(),
    isAvailable: z.coerce.boolean().optional(),
    status: z
      .enum(["DRAFT", "PENDING_APPROVAL", "UNPUBLISHED"])
      .optional(),
    story: dishStorySchema.partial().optional(),
    whoTaught: z.string().max(200).optional(),
    occasion: z.string().max(200).optional(),
    culturalSignificance: z.string().max(3000).optional(),
    storyText: z.string().max(5000).optional(),
    storyVisibility: z.enum(["PUBLIC", "PRIVATE", "ARCHIVE_ONLY"]).optional(),
  }),
};

export const updateDishStockSchema = {
  body: z.object({
    availableQuantity: z.coerce
      .number({ required_error: "Available quantity is required" })
      .int("Quantity must be an integer")
      .min(0, "Available quantity cannot be negative"),
    lowStockThreshold: z.coerce
      .number()
      .int("Low stock threshold must be an integer")
      .min(0, "Low stock threshold cannot be negative")
      .optional(),
  }),
};

export const updateDishAvailabilitySchema = {
  body: z.object({
    isAvailable: z.coerce.boolean({ required_error: "isAvailable boolean is required" }),
  }),
};

export const cookEarningsQuerySchema = {
  query: z.object({
    // Offset pagination is capped at 49,950 rows (page 1,000 at the maximum
    // page size of 50) to keep Prisma skip values practical and in range.
    page: z.coerce.number().int().min(1).max(1_000, "Page cannot exceed 1000.").default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().trim().max(100).default(""),
    status: z.enum(["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]).optional(),
    paymentStatus: z.enum(["PENDING", "PAID", "REFUNDED", "FAILED"]).optional(),
    period: z.enum(["ALL", "THIS_MONTH", "LAST_MONTH"]).default("ALL"),
  }),
};

