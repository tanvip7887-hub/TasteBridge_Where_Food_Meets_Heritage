import { z } from "zod";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const caption = z.string().trim().max(2200).optional().nullable();
const optionalDishId = recordId.optional().nullable();
const postType = z.enum(["PHOTO", "VIDEO", "RECIPE", "HERITAGE_STORY"]);
const postStatus = z.enum(["DRAFT", "PUBLISHED"]);

const postMetadata = {
  postType,
  caption,
  dishId: optionalDishId,
  status: postStatus,
};

const routeId = { params: z.object({ id: recordId }) };

export const listSocialPostsSchema = {
  query: z.object({ status: postStatus.optional() }).strict(),
};

export const createSocialStorySchema = {
  body: z.object({ caption, dishId: optionalDishId }).strict(),
};

export const createSocialPostDraftSchema = {
  body: z.object({ postType, caption, dishId: optionalDishId, status: z.literal("DRAFT").optional() }).strict(),
};

export const createSocialPostWithPhotosSchema = {
  body: z.object({ ...postMetadata, status: postStatus.default("PUBLISHED") }).strict(),
};

export const createSocialPostWithVideoSchema = {
  body: z.object({ ...postMetadata, status: postStatus.default("PUBLISHED") }).strict(),
};

export const updateSocialPostSchema = {
  ...routeId,
  body: z.object({ ...postMetadata }).partial().strict()
    .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update."),
};

export const socialContentIdSchema = routeId;
