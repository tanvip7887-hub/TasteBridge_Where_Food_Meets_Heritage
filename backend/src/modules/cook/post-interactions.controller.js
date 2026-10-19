import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createPostInteractionsService } from "./post-interactions.service.js";

const interactions = createPostInteractionsService(prisma);

const run = (message, action, status = HTTP_STATUS.OK) => async (req, res, next) => {
  try {
    const data = await action(req);
    return sendSuccess(res, status, message, data);
  } catch (error) {
    return next(error);
  }
};

export const getPostLikeState = run("Post like status retrieved.", (req) => interactions.getLikeState(req.user, req.params.id));
export const likePost = run("Post liked.", (req) => interactions.likePost(req.user, req.params.id));
export const unlikePost = run("Post unliked.", (req) => interactions.unlikePost(req.user, req.params.id));
export const listPostComments = run("Post comments retrieved.", (req) => interactions.listComments(req.params.id, req.validatedQuery, req.user));
export const listMyPostComments = run("Your Post comments retrieved.", (req) => interactions.listCookComments(req.user, req.validatedQuery));
export const createPostComment = run("Comment added.", (req) => interactions.createComment(req.user, req.params.id, req.body, req.commentIdempotencyKey), HTTP_STATUS.CREATED);
export const deletePostComment = run("Comment deleted.", (req) => interactions.deleteComment(req.user, req.params.commentId));
