import prisma from "../../config/prisma.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { createCookSocialContentService } from "./social-content.service.js";

const socialContent = createCookSocialContentService(prisma);

const getCookId = async (userId) => {
  const profile = await prisma.cookProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw new AppError("Cook profile not found.", HTTP_STATUS.FORBIDDEN);
  return profile.id;
};

const run = (message, action, status = HTTP_STATUS.OK) => async (req, res, next) => {
  try {
    const cookId = await getCookId(req.user.id);
    const data = await action(cookId, req);
    return sendSuccess(res, status, message, data);
  } catch (error) {
    return next(error);
  }
};

export const listMySocialStories = run("Active Stories retrieved.", (cookId) => socialContent.listStories(cookId));
export const createMySocialStoryPhoto = run("Story published.", (cookId, req) => socialContent.createStoryPhoto(cookId, req.body, req.file), HTTP_STATUS.CREATED);
export const createMySocialStoryVideo = run("Story published.", (cookId, req) => socialContent.createStoryVideo(cookId, req.body, req.file), HTTP_STATUS.CREATED);
export const deleteMySocialStory = run("Story deleted.", (cookId, req) => socialContent.deleteStory(cookId, req.params.id));
export const listMySocialPosts = run("Posts retrieved.", (cookId, req) => socialContent.listPosts(cookId, req.validatedQuery?.status));
export const createMySocialPostDraft = run("Draft saved.", (cookId, req) => socialContent.createDraft(cookId, req.body), HTTP_STATUS.CREATED);
export const createMySocialPostPhotos = run("Post saved.", (cookId, req) => socialContent.createPhotoPost(cookId, req.body, req.files || []), HTTP_STATUS.CREATED);
export const createMySocialPostVideo = run("Post saved.", (cookId, req) => socialContent.createVideoPost(cookId, req.body, req.file), HTTP_STATUS.CREATED);
export const updateMySocialPost = run("Post updated.", (cookId, req) => socialContent.updatePost(cookId, req.params.id, req.body));
export const replaceMySocialPostPhotos = run("Post photos replaced.", (cookId, req) => socialContent.replacePostPhotos(cookId, req.params.id, req.files || []));
export const replaceMySocialPostVideo = run("Post video replaced.", (cookId, req) => socialContent.replacePostVideo(cookId, req.params.id, req.file));
export const deleteMySocialPost = run("Post deleted.", (cookId, req) => socialContent.deletePost(cookId, req.params.id));
