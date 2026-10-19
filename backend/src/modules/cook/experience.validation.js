import { z } from "zod";
import { MAX_DINE_GUESTS_PER_BOOKING } from "../events/dine-bookings.service.js";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const optionalText = (max, { min = 1 } = {}) => z.string().trim().min(min).max(max).optional().nullable();
const stringList = (maxItems, maxLength = 300) => z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).optional();
// Slot inputs represent instants: require an explicit UTC marker or numeric
// offset so local wall-clock values are never interpreted implicitly.
const isoDate = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const experienceFields = {
  type: z.enum(["HOME_DINING", "WORKSHOP"]).optional(),
  title: z.string().trim().min(3).max(120),
  theme: optionalText(120),
  description: optionalText(5000, { min: 10 }),
  teachingContent: optionalText(5000, { min: 10 }),
  learningOutcomes: optionalText(3000, { min: 10 }),
  materialsToBring: optionalText(2000),
  cuisine: optionalText(120),
  isVegetarian: z.boolean().optional(),
  dietaryNotes: optionalText(2000),
  menuNotes: optionalText(2000),
  menuDishIds: z.array(recordId).max(30).refine((ids) => new Set(ids).size === ids.length, "Menu dishes cannot be repeated.").optional(),
  inclusions: stringList(30),
  houseRules: stringList(30),
  pricePerPerson: z.number().finite().positive().max(100000).optional(),
  maxGuests: z.number().int().min(1).max(100).optional(),
  durationMinutes: z.number().int().min(15).max(1440).optional(),
  publicArea: optionalText(250),
  privateAddress: optionalText(2000, { min: 8 }),
  addressSource: z.enum(["COOK_PROFILE", "CUSTOM"]).optional().nullable(),
};

export const cookExperienceIdSchema = { params: z.object({ id: recordId }) };
export const cookExperienceListSchema = { query: z.object({}).strict() };
export const createExperienceDraftSchema = {
  body: z.object(experienceFields).strict(),
};
// New Dine listings are published with their first slot in one request. The
// client sends a single IST-selected instant; the server derives the end from
// durationMinutes. `capacity` is total seats for that slot, while `maxGuests`
// independently limits the size of a single customer booking.
export const publishExperienceSchema = {
  body: z.object({
    idempotencyKey: z.string().uuid(),
    type: z.enum(["HOME_DINING", "WORKSHOP"]),
    title: z.string().trim().min(3).max(120),
    theme: z.string().trim().min(1).max(120),
    description: z.string().trim().min(10).max(5000),
    cuisine: optionalText(120),
    isVegetarian: z.boolean().optional(),
    dietaryNotes: optionalText(2000),
    menuNotes: optionalText(2000),
    teachingContent: optionalText(5000, { min: 10 }),
    learningOutcomes: optionalText(3000, { min: 10 }),
    materialsToBring: optionalText(2000),
    pricePerPerson: z.number().finite().positive().max(100000),
    maxGuests: z.number().int().min(1).max(MAX_DINE_GUESTS_PER_BOOKING),
    capacity: z.number().int().min(1).max(100),
    durationMinutes: z.number().int().min(15).max(1440),
    // Location is stored privately for confirmed guests. Public area is derived
    // from the already-approved Cook profile to avoid exposing a home address.
    location: z.string().trim().min(8).max(2000),
    startsAt: isoDate,
  }).strict().superRefine((data, context) => {
    if (data.type === "HOME_DINING") {
      if (!data.cuisine) context.addIssue({ code: "custom", path: ["cuisine"], message: "Cuisine is required for home dining." });
      if (data.isVegetarian === undefined) context.addIssue({ code: "custom", path: ["isVegetarian"], message: "Menu type is required for home dining." });
      if (!data.menuNotes) context.addIssue({ code: "custom", path: ["menuNotes"], message: "Menu notes are required for home dining." });
    }
    if (data.type === "WORKSHOP") {
      if (!data.teachingContent) context.addIssue({ code: "custom", path: ["teachingContent"], message: "Add what participants will be taught." });
      if (!data.learningOutcomes) context.addIssue({ code: "custom", path: ["learningOutcomes"], message: "Add what participants will learn." });
    }
  }),
};
export const updateExperienceDraftSchema = {
  params: z.object({ id: recordId }),
  body: z.object(experienceFields).partial().strict(),
};
export const createExperienceSlotSchema = {
  params: z.object({ id: recordId }),
  body: z.object({
    startsAt: isoDate,
    endsAt: isoDate,
    capacity: z.number().int().min(1).max(100),
  }).strict(),
};
export const updateExperienceSlotSchema = {
  params: z.object({ id: recordId, slotId: recordId }),
  body: z.object({
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    capacity: z.number().int().min(1).max(100).optional(),
    status: z.enum(["OPEN", "PAUSED"]).optional(),
  }).strict().refine((value) => Object.keys(value).length > 0, "At least one slot field is required."),
};
export const experienceSlotIdSchema = { params: z.object({ id: recordId, slotId: recordId }) };
