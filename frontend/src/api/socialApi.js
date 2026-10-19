import api from "./axios.js";

export const listPublicStories = ({ page = 1, limit = 50, signal } = {}) =>
  api.get("/social/stories", { params: { page, limit }, signal });

export const listPublicPosts = ({ page = 1, limit = 12, postType, cuisine, signal } = {}) =>
  api.get("/social/posts", {
    params: { page, limit, ...(postType ? { postType } : {}), ...(cuisine ? { cuisine } : {}) },
    signal,
  });

export const getPostLikeState = (postId, { signal } = {}) =>
  api.get(`/social/posts/${encodeURIComponent(postId)}/likes`, { signal });

export const likePost = (postId) =>
  api.post(`/social/posts/${encodeURIComponent(postId)}/likes`, {});

export const unlikePost = (postId) =>
  api.delete(`/social/posts/${encodeURIComponent(postId)}/likes`);

export const listPostComments = (postId, { page = 1, limit = 20, signal } = {}) =>
  api.get(`/social/posts/${encodeURIComponent(postId)}/comments`, { params: { page, limit }, signal });

export const createPostComment = (postId, { text, parentId } = {}, idempotencyKey) =>
  api.post(`/social/posts/${encodeURIComponent(postId)}/comments`, { text, ...(parentId ? { parentId } : {}) }, {
    headers: { "Idempotency-Key": idempotencyKey },
  });

export const deletePostComment = (commentId) =>
  api.delete(`/social/comments/${encodeURIComponent(commentId)}`);
export const reportSocialContent = (payload) => api.post("/social/reports", payload);
