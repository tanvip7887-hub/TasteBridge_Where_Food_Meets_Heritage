import { Router } from "express";
import { authenticate, optionalAuthenticate } from "../../middlewares/auth.js";
import { createSocialCommentRateLimiter } from "../../middlewares/socialCommentRateLimit.js";
import { validate } from "../../middlewares/validate.js";
import { createSocialContentReport, listPublicSocialPosts, listPublicSocialStories } from "./public-social-content.controller.js";
import { createSocialReportSchema, publicPostsSchema, publicStoriesSchema } from "./public-social-content.validation.js";
import {
  createPostComment,
  deletePostComment,
  getPostLikeState,
  likePost,
  listPostComments,
  unlikePost,
} from "./post-interactions.controller.js";
import {
  commentIdSchema,
  createPostCommentSchema,
  likePostSchema,
  listPostCommentsSchema,
  postIdSchema,
  requireCommentIdempotencyKey,
} from "./post-interactions.validation.js";

const router = Router();

// Public read-only endpoints; visibility and Cook eligibility are enforced by the service.
router.get("/stories", validate(publicStoriesSchema), listPublicSocialStories);
router.get("/posts", validate(publicPostsSchema), listPublicSocialPosts);
router.get("/posts/:id/likes", authenticate, validate(postIdSchema), getPostLikeState);
router.post("/posts/:id/likes", authenticate, validate(likePostSchema), likePost);
router.delete("/posts/:id/likes", authenticate, validate(postIdSchema), unlikePost);
router.get("/posts/:id/comments", optionalAuthenticate, validate(listPostCommentsSchema), listPostComments);
router.post("/posts/:id/comments", authenticate, requireCommentIdempotencyKey, createSocialCommentRateLimiter(), validate(createPostCommentSchema), createPostComment);
router.delete("/comments/:commentId", authenticate, validate(commentIdSchema), deletePostComment);
router.post("/reports", authenticate, createSocialCommentRateLimiter({ activity: "reporting content" }), validate(createSocialReportSchema), createSocialContentReport);

export default router;
