import { createHash } from "node:crypto";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { cookSellingReadinessWhere, findCookProfilesWithValidRequiredText, getCookSellingReadiness } from "../../utils/cookReadiness.js";
import { createNotificationsService } from "../notifications/notifications.service.js";

const notFound = () => new AppError("Post or comment not found.", HTTP_STATUS.NOT_FOUND);
const forbidden = () => new AppError("Your account is not eligible for this action.", HTTP_STATUS.FORBIDDEN);
const unauthenticated = () => new AppError("Authentication required.", HTTP_STATUS.UNAUTHORIZED);
const badRequest = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST);
const conflict = () => new AppError("This Idempotency-Key was already used for a different comment request.", HTTP_STATUS.CONFLICT);
const commentIdempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,128}$/;
const commentFingerprint = ({ postId, text, parentId }) => createHash("sha256")
  .update(JSON.stringify({ operation: "CREATE_POST_COMMENT", postId, text, parentId: parentId || null }))
  .digest("hex");
const isUniqueConstraintError = (error) => error?.code === "P2002";

const publicPostWhere = (postId, now, eligibleCookIds) => ({
  id: postId,
  status: "PUBLISHED",
  publishedAt: { not: null, lte: now },
  moderationHiddenAt: null,
  media: { some: {} },
  cook: { is: cookSellingReadinessWhere(now, eligibleCookIds) },
});

const serializeComment = ({ id, postId, parentId, text, createdAt, deletedAt, moderationHiddenAt, author, canDelete = false }) => ({
  id,
  postId,
  parentId,
  text: deletedAt || moderationHiddenAt ? null : text,
  createdAt,
  deleted: Boolean(deletedAt || moderationHiddenAt),
  moderatedHidden: Boolean(moderationHiddenAt),
  author: deletedAt || moderationHiddenAt || !author ? null : {
    displayName: author.cookProfile?.businessName || author.name,
    role: author.cookProfile ? "COOK" : "CUSTOMER",
  },
  canDelete: !deletedAt && canDelete,
});

const serializeCookComment = (comment) => ({
  id: comment.id,
  postId: comment.postId,
  parentId: comment.parentId,
  text: comment.deletedAt ? null : comment.text,
  createdAt: comment.createdAt,
  deleted: Boolean(comment.deletedAt),
  canDelete: !comment.deletedAt,
  author: comment.deletedAt || !comment.author ? null : {
    displayName: comment.author.cookProfile?.businessName || comment.author.name,
    role: comment.author.cookProfile ? "COOK" : "CUSTOMER",
  },
});

export const createPostInteractionsService = (
  database,
  { now = () => new Date(), findEligibleCookIds = findCookProfilesWithValidRequiredText, readiness } = {},
) => {
  const assertActor = async (user) => {
    if (!user?.id) throw unauthenticated();
    if (user.status !== "ACTIVE") throw forbidden();
    if (user.activePortal === "CUSTOMER") return { userId: user.id, cookId: null };
    if (user.activePortal !== "COOK") throw forbidden();

    const cook = await database.cookProfile.findUnique({
      where: { userId: user.id },
      include: { user: true },
    });
    if (!cook) throw forbidden();
    const eligible = (readiness || getCookSellingReadiness)(cook, now()).readyToSell;
    if (!eligible) throw forbidden();
    return { userId: user.id, cookId: cook.id };
  };

  const requirePublicPost = async (tx, postId, currentTime) => {
    const cookIds = await findEligibleCookIds(tx);
    if (!cookIds.length) throw notFound();
    const post = await tx.cookPost.findFirst({
      where: publicPostWhere(postId, currentTime, cookIds),
      select: { id: true, cookId: true },
    });
    if (!post) throw notFound();
    return post;
  };

  const likeState = async (tx, postId, userId) => {
    const [likeCount, ownLike] = await Promise.all([
      tx.cookPostLike.count({ where: { postId } }),
      tx.cookPostLike.findUnique({ where: { userId_postId: { userId, postId } }, select: { id: true } }),
    ]);
    return { postId, likeCount, likedByMe: Boolean(ownLike) };
  };

  return {
    async getLikeState(user, postId) {
      const { userId } = await assertActor(user);
      return database.$transaction(async (tx) => {
        await requirePublicPost(tx, postId, now());
        return likeState(tx, postId, userId);
      });
    },

    async likePost(user, postId) {
      const { userId } = await assertActor(user);
      return database.$transaction(async (tx) => {
        await requirePublicPost(tx, postId, now());
        await tx.cookPostLike.upsert({
          where: { userId_postId: { userId, postId } },
          create: { userId, postId },
          update: {},
        });
        return likeState(tx, postId, userId);
      });
    },

    async unlikePost(user, postId) {
      const { userId } = await assertActor(user);
      return database.$transaction(async (tx) => {
        await requirePublicPost(tx, postId, now());
        await tx.cookPostLike.deleteMany({ where: { userId, postId } });
        return likeState(tx, postId, userId);
      });
    },

    async listComments(postId, { page, limit }, user = null) {
      const currentTime = now();
      return database.$transaction(async (tx) => {
        await requirePublicPost(tx, postId, currentTime);
        const where = { postId };
        const [total, comments, post] = await Promise.all([
          tx.cookPostComment.count({ where: { ...where, deletedAt: null, moderationHiddenAt: null } }),
          tx.cookPostComment.findMany({
            where,
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            skip: (page - 1) * limit,
            take: limit,
            select: {
              id: true, postId: true, parentId: true, authorId: true, text: true, createdAt: true, deletedAt: true, moderationHiddenAt: true,
              author: { select: { name: true, cookProfile: { select: { businessName: true } } } },
            },
          }),
          tx.cookPost.findUnique({ where: { id: postId }, select: { cookId: true } }),
        ]);
        const actorCookId = user?.activePortal === "COOK"
          ? (await tx.cookProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id
          : null;
        return {
          items: comments.map((comment) => serializeComment({
            ...comment,
            canDelete: Boolean(user?.id && (comment.authorId === user.id || (actorCookId && actorCookId === post?.cookId))),
          })),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          commentCount: total,
        };
      });
    },

    async listCookComments(user, { page, limit, postId }) {
      if (!user?.id) throw unauthenticated();
      if (user.status !== "ACTIVE" || user.activePortal !== "COOK") throw forbidden();
      const cook = await database.cookProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!cook) throw forbidden();
      const where = { post: { is: { cookId: cook.id, ...(postId ? { id: postId } : {}) } } };
      const rootWhere = { ...where, parentId: null };
      const [total, commentCount, roots] = await Promise.all([
        database.cookPostComment.count({ where: rootWhere }),
        database.cookPostComment.count({ where: { ...where, deletedAt: null, moderationHiddenAt: null } }),
        database.cookPostComment.findMany({
          where: rootWhere,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, postId: true, parentId: true, text: true, createdAt: true, deletedAt: true,
            author: { select: { name: true, cookProfile: { select: { businessName: true } } } },
            post: { select: {
              id: true, postType: true, caption: true,
              media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { id: true, mediaType: true, mediaUrl: true } },
            } },
            replies: {
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: {
                id: true, postId: true, parentId: true, text: true, createdAt: true, deletedAt: true,
                author: { select: { name: true, cookProfile: { select: { businessName: true } } } },
              },
            },
          },
        }),
      ]);
      return {
        items: roots.map((root) => ({
          ...serializeCookComment(root),
          post: root.post,
          replies: root.replies.map(serializeCookComment),
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        commentCount,
      };
    },

    async createComment(user, postId, { text, parentId = null }, idempotencyKey = null) {
      const actor = await assertActor(user);
      const cleanText = typeof text === "string" ? text.trim() : "";
      if (!cleanText) throw badRequest("Comment cannot be empty.");
      if (text.length > 300) throw badRequest("Comments must be 300 characters or fewer.");
      if (typeof idempotencyKey !== "string" || !commentIdempotencyKeyPattern.test(idempotencyKey)) {
        throw badRequest("A valid Idempotency-Key header is required to submit a comment.");
      }
      const fingerprint = commentFingerprint({ postId, text: cleanText, parentId });
      const currentTime = now();
      const createOrReplay = async (tx, { allowCreate }) => {
        const post = await requirePublicPost(tx, postId, currentTime);
        const existing = await tx.cookPostComment.findUnique({
          where: { authorId_idempotencyKey: { authorId: actor.userId, idempotencyKey } },
          select: {
            id: true, postId: true, parentId: true, authorId: true, text: true, createdAt: true, deletedAt: true,
            moderationHiddenAt: true, requestFingerprint: true,
            author: { select: { name: true, cookProfile: { select: { businessName: true } } } },
          },
        });
        if (existing) {
          if (existing.requestFingerprint !== fingerprint) throw conflict();
          return serializeComment({ ...existing, canDelete: true });
        }
        if (!allowCreate) return null;
        if (parentId) {
          const parent = await tx.cookPostComment.findFirst({
            where: { id: parentId, postId, deletedAt: null, moderationHiddenAt: null },
            select: { id: true },
          });
          if (!parent) throw badRequest("Reply must reference an active comment on the same Post.");
        }
        const comment = await tx.cookPostComment.create({
          data: { postId, authorId: actor.userId, parentId, text: cleanText, idempotencyKey, requestFingerprint: fingerprint },
          select: {
            id: true, postId: true, parentId: true, authorId: true, text: true, createdAt: true, deletedAt: true,
            author: { select: { name: true, cookProfile: { select: { businessName: true } } } },
          },
        });
        const postOwner = await tx.cookProfile.findUnique({
          where: { id: post.cookId },
          select: { userId: true },
        });
        if (postOwner?.userId && postOwner.userId !== actor.userId) {
          await createNotificationsService(tx).create({
            userId: postOwner.userId,
            portal: "COOK",
            type: "SYSTEM_ALERT",
            title: parentId ? "New reply on your Post" : "New comment on your Post",
            message: parentId ? "Someone replied to a comment on your Post." : "Someone commented on your Post.",
            metadata: {
              kind: "SOCIAL_POST_COMMENT",
              postId: post.id,
              commentId: comment.id,
              href: `/cook/stories?tab=Comments&postId=${encodeURIComponent(post.id)}`,
            },
            // The caller reuses its key for a retry. The notification event is
            // persisted in this transaction and uniquely scoped to this Cook.
            eventKey: `social-post:${post.id}:comment-request:${actor.userId}:${idempotencyKey || comment.id}:cook:${postOwner.userId}`,
          });
        }
        return serializeComment({ ...comment, canDelete: true });
      };

      try {
        return await database.$transaction((tx) => createOrReplay(tx, { allowCreate: true }));
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // A concurrent request may have committed the same unique key after
        // this transaction's initial lookup. Its transaction also committed
        // the comment notification atomically, so only read and replay here.
        const replay = await database.$transaction((tx) => createOrReplay(tx, { allowCreate: false }));
        if (replay) return replay;
        throw error;
      }
    },

    async deleteComment(user, commentId) {
      if (!user?.id) throw unauthenticated();
      if (user.status !== "ACTIVE") throw forbidden();
      const cook = user.activePortal === "COOK"
        ? await database.cookProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
        : null;
      return database.$transaction(async (tx) => {
        const comment = await tx.cookPostComment.findUnique({
          where: { id: commentId },
          select: { id: true, authorId: true, deletedAt: true, post: { select: { cookId: true } } },
        });
        if (!comment || (comment.authorId !== user.id && comment.post.cookId !== cook?.id)) throw notFound();
        if (comment.deletedAt) return { id: comment.id, deleted: true };
        await tx.cookPostComment.update({
          where: { id: comment.id },
          data: { text: null, deletedAt: now() },
        });
        return { id: comment.id, deleted: true };
      });
    },
  };
};
