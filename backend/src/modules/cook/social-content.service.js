import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { getCookSellingReadiness } from "../../utils/cookReadiness.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { SOCIAL_VIDEO_MAX_DURATION_SECONDS } from "../../utils/socialMediaUpload.js";

const badRequest = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST);
const notFound = () => new AppError("Social content not found.", HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const postInclude = { media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } };

const mediaForImage = (file, upload) => ({
  mediaType: "IMAGE",
  mediaUrl: upload.secureUrl,
  cloudinaryPublicId: upload.publicId,
  cloudinaryResourceType: "image",
  mediaFormat: upload.format || null,
  mediaMimeType: file.mimetype,
  mediaBytes: upload.bytes || file.size,
  mediaDurationSeconds: null,
});

const mediaForVideo = (file, upload) => ({
  mediaType: "VIDEO",
  mediaUrl: upload.secureUrl,
  cloudinaryPublicId: upload.publicId,
  cloudinaryResourceType: upload.resourceType || "video",
  mediaFormat: upload.format || null,
  mediaMimeType: file.mimetype,
  mediaBytes: upload.bytes || file.size,
  mediaDurationSeconds: upload.duration,
});

const validateVideoDuration = async (storage, upload) => {
  const duration = Number(upload?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > SOCIAL_VIDEO_MAX_DURATION_SECONDS) {
    if (upload?.publicId) {
      try { await storage.deleteCloudinaryAsset(upload.publicId, upload.resourceType || "video", "upload"); } catch { /* Keep the validation error authoritative. */ }
    }
    throw badRequest("Videos must be 60 seconds or shorter.");
  }
};

const postTypeMatchesMedia = (postType, mediaType) =>
  !((postType === "PHOTO" && mediaType === "VIDEO") || (postType === "VIDEO" && mediaType === "IMAGE"));

export const createCookSocialContentService = (
  database,
  { storage = cloudinaryService, readiness = getCookSellingReadiness, now = () => new Date() } = {},
) => {
  const assertEligibleCook = async (cookId) => {
    const cook = await database.cookProfile.findUnique({ where: { id: cookId }, include: { user: true } });
    if (!cook) throw notFound();
    const check = readiness(cook, now());
    if (!check.readyToSell) {
      throw new AppError(
        `Your Cook account is not eligible to publish: ${check.pendingRequirements.map(({ label }) => label).join(", ")}.`,
        HTTP_STATUS.FORBIDDEN,
      );
    }
    return cook;
  };

  const assertOwnedDish = async (tx, cookId, dishId) => {
    if (!dishId) return;
    const dish = await tx.dish.findFirst({ where: { id: dishId, cookId }, select: { id: true } });
    if (!dish) throw badRequest("Choose a dish that belongs to your kitchen.");
  };

  const cleanupIfUnused = async (assets = []) => {
    for (const asset of assets) {
      if (!asset?.publicId || !asset.resourceType) continue;
      let storyCount;
      let postMediaCount;
      try {
        [storyCount, postMediaCount] = await Promise.all([
          database.cookStory.count({ where: { cloudinaryPublicId: asset.publicId } }),
          database.cookPostMedia.count({ where: { cloudinaryPublicId: asset.publicId } }),
        ]);
      } catch {
        // If references cannot be checked, retain the asset and never mask the original failure.
        continue;
      }
      if (storyCount || postMediaCount) continue;
      try { await storage.deleteCloudinaryAsset(asset.publicId, asset.resourceType, "upload"); } catch { /* A provider cleanup failure must not undo persisted content. */ }
    }
  };

  const uploadImage = async (file, cookId, folder) => {
    if (!file?.buffer || !file.size) throw badRequest("Choose an image to upload.");
    const result = await storage.uploadPublicMarketplaceImage({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      folder,
      tags: ["social-content", "cook"],
    });
    if (!result?.publicId || !result.secureUrl) {
      throw new AppError("Image storage did not return a usable asset.", HTTP_STATUS.BAD_GATEWAY);
    }
    return { ...mediaForImage(file, result), publicId: result.publicId, resourceType: "image" };
  };

  const uploadVideo = async (file, cookId, folder) => {
    if (!file?.buffer || !file.size) throw badRequest("Choose a video to upload.");
    const result = await storage.uploadPublicSocialVideo({
      fileBuffer: file.buffer,
      folder,
      tags: ["social-content", "cook"],
    });
    if (!result?.publicId || !result.secureUrl) {
      throw new AppError("Video storage did not return a usable asset.", HTTP_STATUS.BAD_GATEWAY);
    }
    await validateVideoDuration(storage, result);
    return { ...mediaForVideo(file, result), publicId: result.publicId, resourceType: result.resourceType || "video" };
  };

  const createStory = async (cookId, input, file, mediaType) => {
    await assertEligibleCook(cookId);
    const uploaded = mediaType === "IMAGE"
      ? await uploadImage(file, cookId, `tastebridge/social/${cookId}/stories`)
      : await uploadVideo(file, cookId, `tastebridge/social/${cookId}/stories`);
    try {
      const publishedAt = now();
      const expiresAt = new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000);
      return await database.$transaction(async (tx) => {
        await assertOwnedDish(tx, cookId, input.dishId);
        const { publicId: _publicId, resourceType: _resourceType, ...storyMedia } = uploaded;
        return tx.cookStory.create({
          data: {
            cookId,
            dishId: input.dishId || null,
            caption: input.caption || null,
            ...storyMedia,
            publishedAt,
            expiresAt,
          },
        });
      });
    } catch (error) {
      await cleanupIfUnused([uploaded]);
      throw error;
    }
  };

  const createPostWithMedia = async (cookId, input, uploadedMedia, mediaType) => {
    await assertEligibleCook(cookId);
    if (!input.postType) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("Select a Post type.");
    }
    if (mediaType === "IMAGE" && (uploadedMedia.length < 1 || uploadedMedia.length > 5)) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("A photo Post must contain between 1 and 5 images.");
    }
    if (mediaType === "VIDEO" && uploadedMedia.length !== 1) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("A video Post must contain exactly one video.");
    }
    if (!postTypeMatchesMedia(input.postType, mediaType)) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("The selected Post type does not match the uploaded media.");
    }

    try {
      return await database.$transaction(async (tx) => {
        await assertOwnedDish(tx, cookId, input.dishId);
        if (input.status === "PUBLISHED" && !uploadedMedia.length) throw badRequest("Add media before publishing a Post.");
        return tx.cookPost.create({
          data: {
            cookId,
            dishId: input.dishId || null,
            postType: input.postType,
            caption: input.caption || null,
            status: input.status || "PUBLISHED",
            publishedAt: (input.status || "PUBLISHED") === "PUBLISHED" ? now() : null,
            media: { create: uploadedMedia.map(({ publicId: _publicId, resourceType: _resourceType, ...media }, sortOrder) => ({ ...media, sortOrder })) },
          },
          include: postInclude,
        });
      });
    } catch (error) {
      await cleanupIfUnused(uploadedMedia);
      throw error;
    }
  };

  const replacePostMedia = async (cookId, postId, uploadedMedia, mediaType) => {
    await assertEligibleCook(cookId);
    const existing = await database.cookPost.findFirst({ where: { id: postId, cookId }, include: postInclude });
    if (!existing) {
      await cleanupIfUnused(uploadedMedia);
      throw notFound();
    }
    if (!postTypeMatchesMedia(existing.postType, mediaType)) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("The uploaded media does not match this Post type.");
    }
    if (mediaType === "IMAGE" && (uploadedMedia.length < 1 || uploadedMedia.length > 5)) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("A photo Post must contain between 1 and 5 images.");
    }
    if (mediaType === "VIDEO" && uploadedMedia.length !== 1) {
      await cleanupIfUnused(uploadedMedia);
      throw badRequest("A video Post must contain exactly one video.");
    }
    const oldAssets = existing.media.map((media) => ({ publicId: media.cloudinaryPublicId, resourceType: media.cloudinaryResourceType }));
    try {
      const updated = await database.$transaction(async (tx) => {
        const owned = await tx.cookPost.findFirst({ where: { id: postId, cookId }, select: { id: true } });
        if (!owned) throw notFound();
        await tx.cookPostMedia.deleteMany({ where: { postId } });
        await tx.cookPostMedia.createMany({
          data: uploadedMedia.map(({ publicId: _publicId, resourceType: _resourceType, ...media }, sortOrder) => ({ postId, ...media, sortOrder })),
        });
        return tx.cookPost.findFirst({ where: { id: postId, cookId }, include: postInclude });
      });
      await cleanupIfUnused(oldAssets);
      return updated;
    } catch (error) {
      await cleanupIfUnused(uploadedMedia);
      throw error;
    }
  };

  return {
    async listStories(cookId) {
      return database.cookStory.findMany({
        where: { cookId, expiresAt: { gt: now() } },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        include: { dish: { select: { id: true, name: true } } },
      });
    },
    async createStoryPhoto(cookId, input, file) { return createStory(cookId, input, file, "IMAGE"); },
    async createStoryVideo(cookId, input, file) { return createStory(cookId, input, file, "VIDEO"); },
    async deleteStory(cookId, storyId) {
      const story = await database.cookStory.findFirst({ where: { id: storyId, cookId } });
      if (!story) throw notFound();
      await database.cookStory.delete({ where: { id: storyId } });
      await cleanupIfUnused([{ publicId: story.cloudinaryPublicId, resourceType: story.cloudinaryResourceType }]);
      return { id: story.id, deleted: true };
    },
    async listPosts(cookId, status) {
      return database.cookPost.findMany({
        where: { cookId, ...(status ? { status } : {}) },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: {
          ...postInclude,
          dish: { select: { id: true, name: true } },
          _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
        },
      });
    },
    async createDraft(cookId, input) {
      await assertEligibleCook(cookId);
      return database.$transaction(async (tx) => {
        await assertOwnedDish(tx, cookId, input.dishId);
        return tx.cookPost.create({
          data: { cookId, dishId: input.dishId || null, postType: input.postType, caption: input.caption || null, status: "DRAFT" },
          include: postInclude,
        });
      });
    },
    async createPhotoPost(cookId, input, files) {
      await assertEligibleCook(cookId);
      if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw badRequest("Add between 1 and 5 photos.");
      const uploaded = [];
      try {
        for (const file of files) uploaded.push(await uploadImage(file, cookId, `tastebridge/social/${cookId}/posts`));
      } catch (error) {
        await cleanupIfUnused(uploaded);
        throw error;
      }
      return createPostWithMedia(cookId, input, uploaded, "IMAGE");
    },
    async createVideoPost(cookId, input, file) {
      await assertEligibleCook(cookId);
      const uploaded = await uploadVideo(file, cookId, `tastebridge/social/${cookId}/posts`);
      return createPostWithMedia(cookId, input, [uploaded], "VIDEO");
    },
    async updatePost(cookId, postId, input) {
      await assertEligibleCook(cookId);
      return database.$transaction(async (tx) => {
        const post = await tx.cookPost.findFirst({ where: { id: postId, cookId }, include: postInclude });
        if (!post) throw notFound();
        if (input.dishId !== undefined) await assertOwnedDish(tx, cookId, input.dishId);
        if (input.postType && post.media.length && post.media.some((media) => !postTypeMatchesMedia(input.postType, media.mediaType))) {
          throw badRequest("The Post type must match its current media.");
        }
        const nextStatus = input.status || post.status;
        if (post.status === "PUBLISHED" && nextStatus === "DRAFT") throw conflict("Published Posts cannot be changed back to drafts.");
        if (nextStatus === "PUBLISHED" && post.moderationHiddenAt) throw conflict("This Post was hidden by moderation and cannot be republished.");
        if (nextStatus === "PUBLISHED" && post.media.length === 0) throw badRequest("Add media before publishing a Post.");
        return tx.cookPost.update({
          where: { id: postId },
          data: {
            ...(input.postType !== undefined ? { postType: input.postType } : {}),
            ...(input.caption !== undefined ? { caption: input.caption || null } : {}),
            ...(input.dishId !== undefined ? { dishId: input.dishId || null } : {}),
            ...(input.status !== undefined ? { status: nextStatus, ...(nextStatus === "PUBLISHED" ? { publishedAt: post.publishedAt || now() } : {}) } : {}),
          },
          include: postInclude,
        });
      }, { isolationLevel: "Serializable" });
    },
    async replacePostPhotos(cookId, postId, files) {
      await assertEligibleCook(cookId);
      if (!Array.isArray(files) || files.length < 1 || files.length > 5) throw badRequest("Add between 1 and 5 photos.");
      const uploaded = [];
      try {
        for (const file of files) uploaded.push(await uploadImage(file, cookId, `tastebridge/social/${cookId}/posts`));
      } catch (error) {
        await cleanupIfUnused(uploaded);
        throw error;
      }
      return replacePostMedia(cookId, postId, uploaded, "IMAGE");
    },
    async replacePostVideo(cookId, postId, file) {
      await assertEligibleCook(cookId);
      const uploaded = await uploadVideo(file, cookId, `tastebridge/social/${cookId}/posts`);
      return replacePostMedia(cookId, postId, [uploaded], "VIDEO");
    },
    async deletePost(cookId, postId) {
      const post = await database.cookPost.findFirst({ where: { id: postId, cookId }, include: postInclude });
      if (!post) throw notFound();
      await database.cookPost.delete({ where: { id: postId } });
      await cleanupIfUnused(post.media.map((media) => ({ publicId: media.cloudinaryPublicId, resourceType: media.cloudinaryResourceType })));
      return { id: post.id, deleted: true };
    },
  };
};
