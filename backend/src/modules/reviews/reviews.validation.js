import { z } from "zod";

const id = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
// Match cook APIs: cap pages so database skip values stay bounded.
const page = z.coerce.number().int().min(1).max(1_000, "Page cannot exceed 1000.").default(1);
const limit = z.coerce.number().int().min(1).max(50).default(20);
const comment = z.string().trim().max(500).optional().transform((value) => value || undefined);

export const pendingReviewsSchema = { query: z.object({ page, limit }).strict() };
export const myReviewsSchema = { query: z.object({ page, limit }).strict() };
export const publicReviewsSchema = {
  params: z.object({ id }).strict(),
  query: z.object({ page, limit }).strict(),
};
export const cookReviewsSchema = {
  query: z.object({
    page,
    limit,
    type: z.enum(["FOOD", "EXPERIENCE"]).optional(),
    needsReply: z.enum(["true", "false"]).optional(),
  }).strict(),
};
export const createReviewSchema = {
  body: z.discriminatedUnion("reviewType", [
    z.object({ reviewType: z.literal("FOOD"), orderItemId: id, rating: z.number().int().min(1).max(5), comment }).strict(),
    z.object({ reviewType: z.literal("EXPERIENCE"), bookingId: id, rating: z.number().int().min(1).max(5), comment }).strict(),
  ]),
};
export const updateReviewSchema = {
  params: z.object({ id }).strict(),
  body: z.object({ rating: z.number().int().min(1).max(5), comment }).strict(),
};
export const reviewIdSchema = { params: z.object({ id }).strict() };
export const replySchema = {
  params: z.object({ id }).strict(),
  body: z.object({ reply: z.string().trim().min(1).max(300) }).strict(),
};
export const reportSchema = {
  params: z.object({ id }).strict(),
  body: z.object({ reason: z.string().trim().min(5).max(500) }).strict(),
};
export const adminReportedReviewsSchema = {
  query: z.object({
    page,
    limit,
    status: z.enum(["ACTIVE", "KEPT", "HIDDEN", "ALL"]).optional(),
    type: z.enum(["FOOD", "EXPERIENCE", "ALL"]).optional(),
  }).strict(),
};
export const moderateReviewSchema = {
  params: z.object({ id }).strict(),
  body: z.object({
    action: z.enum(["KEEP", "HIDE"]),
    reason: z.string().trim().max(500).optional(),
  }).strict().refine((data) => {
    if (data.action === "HIDE") {
      return typeof data.reason === "string" && data.reason.trim().length >= 5;
    }
    return true;
  }, {
    message: "A moderation reason of at least 5 characters is required when hiding a review.",
    path: ["reason"],
  }),
};

