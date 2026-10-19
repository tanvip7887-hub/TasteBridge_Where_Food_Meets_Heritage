import { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const route = { params: z.object({ id: recordId }) };

export const likePostSchema = { ...route, body: z.object({}).strict().optional().default({}) };
export const postIdSchema = route;
export const commentIdSchema = { params: z.object({ commentId: recordId }) };
export const createPostCommentSchema = {
  ...route,
  body: z.object({
    text: z.string().max(300, "Comments must be 300 characters or fewer.").refine((text) => text.trim().length > 0, "Comment cannot be empty."),
    parentId: recordId.optional(),
  }).strict(),
};
export const listPostCommentsSchema = {
  ...route,
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }).strict(),
};

export const listCookPostCommentsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    postId: recordId.optional(),
  }).strict(),
};

const commentIdempotencyKeySchema = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);

export const requireCommentIdempotencyKey = (req, res, next) => {
  const parsed = commentIdempotencyKeySchema.safeParse(req.get("Idempotency-Key"));
  if (!parsed.success) {
    return next(new AppError("A valid Idempotency-Key header is required to submit a comment.", HTTP_STATUS.BAD_REQUEST));
  }
  req.commentIdempotencyKey = parsed.data;
  return next();
};
