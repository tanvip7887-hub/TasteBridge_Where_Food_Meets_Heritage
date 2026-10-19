import { z } from "zod";

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(20);

const pagination = { page, limit };

export const publicStoriesSchema = { query: z.object(pagination).strict() };
export const publicPostsSchema = {
  query: z.object({
    ...pagination,
    postType: z.enum(["PHOTO", "VIDEO", "RECIPE", "HERITAGE_STORY"]).optional(),
    cuisine: z.string().trim().min(1).max(100).optional(),
  }).strict(),
};

export const createSocialReportSchema = {
  body: z.object({
    targetType: z.enum(["POST", "STORY", "COMMENT"]),
    targetId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
    reason: z.enum(["INAPPROPRIATE_CONTENT", "HARASSMENT", "SPAM", "MISLEADING_CONTENT", "OTHER"]),
    explanation: z.string().trim().max(500).optional(),
  }).strict(),
};
