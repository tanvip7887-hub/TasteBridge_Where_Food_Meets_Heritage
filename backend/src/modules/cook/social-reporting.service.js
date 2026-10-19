import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { cookSellingReadinessWhere, findCookProfilesWithValidRequiredText } from "../../utils/cookReadiness.js";

const fail = (message, status) => new AppError(message, status);
const notFound = () => fail("Social content is unavailable.", HTTP_STATUS.NOT_FOUND);
const allowedReasons = new Set(["INAPPROPRIATE_CONTENT", "HARASSMENT", "SPAM", "MISLEADING_CONTENT", "OTHER"]);
const targetTypes = new Set(["POST", "STORY", "COMMENT"]);

export const createSocialReportingService = (
  database,
  { now = () => new Date(), findEligibleCookIds = findCookProfilesWithValidRequiredText } = {},
) => {
  const resolvePublicTarget = async (tx, targetType, targetId, currentTime) => {
    const cookIds = await findEligibleCookIds(tx);
    const eligibleCook = { is: cookSellingReadinessWhere(currentTime, cookIds) };
    if (targetType === "POST") {
      const post = await tx.cookPost.findFirst({
        where: { id: targetId, status: "PUBLISHED", publishedAt: { not: null, lte: currentTime }, moderationHiddenAt: null, media: { some: {} }, cook: eligibleCook },
        select: { id: true },
      });
      if (post) return post;
    } else if (targetType === "STORY") {
      const story = await tx.cookStory.findFirst({
        where: { id: targetId, publishedAt: { lte: currentTime }, expiresAt: { gt: currentTime }, moderationHiddenAt: null, cook: eligibleCook },
        select: { id: true },
      });
      if (story) return story;
    } else if (targetType === "COMMENT") {
      const comment = await tx.cookPostComment.findFirst({
        where: {
          id: targetId, deletedAt: null, moderationHiddenAt: null,
          post: { is: { status: "PUBLISHED", publishedAt: { not: null, lte: currentTime }, moderationHiddenAt: null, media: { some: {} }, cook: eligibleCook } },
        },
        select: { id: true },
      });
      if (comment) return comment;
    }
    throw notFound();
  };

  const requireCustomer = (user) => {
    if (!user?.id) throw fail("Authentication required.", HTTP_STATUS.UNAUTHORIZED);
    if (user.status !== "ACTIVE" || user.role !== "CUSTOMER" || user.activePortal !== "CUSTOMER") {
      throw fail("Only active customers can report social content.", HTTP_STATUS.FORBIDDEN);
    }
  };

  return {
    async createReport(user, { targetType, targetId, reason, explanation }) {
      requireCustomer(user);
      if (!targetTypes.has(targetType) || !targetId || !allowedReasons.has(reason)) {
        throw fail("Choose a valid content type and report reason.", HTTP_STATUS.BAD_REQUEST);
      }
      const cleanExplanation = explanation?.trim() || null;
      if (cleanExplanation?.length > 500) throw fail("Explanation must be 500 characters or fewer.", HTTP_STATUS.BAD_REQUEST);
      try {
        return await database.$transaction(async (tx) => {
          await resolvePublicTarget(tx, targetType, targetId, now());
          const existing = await tx.socialContentReport.findFirst({
            where: { reporterId: user.id, targetType, targetId, status: "PENDING" },
            select: { id: true },
          });
          if (existing) throw fail("You have already reported this content.", HTTP_STATUS.CONFLICT);
          return tx.socialContentReport.create({
            data: {
              reporterId: user.id, targetType, targetId, reason, explanation: cleanExplanation,
              ...(targetType === "POST" ? { postId: targetId } : {}),
              ...(targetType === "STORY" ? { storyId: targetId } : {}),
              ...(targetType === "COMMENT" ? { commentId: targetId } : {}),
            },
            select: { id: true, targetType: true, targetId: true, reason: true, explanation: true, status: true, createdAt: true },
          });
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (error?.code === "P2002") throw fail("You have already reported this content.", HTTP_STATUS.CONFLICT);
        throw error;
      }
    },

    async listReports({ status, targetType, page = 1, limit = 20 }) {
      const where = { ...(status ? { status } : {}), ...(targetType ? { targetType } : {}) };
      const [total, reports] = await Promise.all([
        database.socialContentReport.count({ where }),
        database.socialContentReport.findMany({
          where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit,
          include: { reporter: { select: { id: true, name: true } }, actions: { orderBy: { createdAt: "asc" }, include: { admin: { select: { name: true } } } } },
        }),
      ]);
      const items = await Promise.all(reports.map(async (report) => {
        let target = null;
        if (report.targetType === "POST") target = await database.cookPost.findUnique({ where: { id: report.targetId }, select: { id: true, caption: true, postType: true, moderationHiddenAt: true, cook: { select: { businessName: true } }, media: { orderBy: { sortOrder: "asc" }, take: 1, select: { mediaUrl: true, mediaType: true } } } });
        if (report.targetType === "STORY") target = await database.cookStory.findUnique({ where: { id: report.targetId }, select: { id: true, caption: true, mediaUrl: true, mediaType: true, expiresAt: true, moderationHiddenAt: true, cook: { select: { businessName: true } } } });
        if (report.targetType === "COMMENT") target = await database.cookPostComment.findUnique({ where: { id: report.targetId }, select: { id: true, text: true, createdAt: true, deletedAt: true, moderationHiddenAt: true, post: { select: { id: true, caption: true, cook: { select: { businessName: true } } } }, author: { select: { name: true } } } });
        return { ...report, target };
      }));
      return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },

    async moderateReport(adminUserId, reportId, { action, reason }) {
      if (!adminUserId) throw fail("Admin authentication required.", HTTP_STATUS.UNAUTHORIZED);
      const cleanReason = typeof reason === "string" ? reason.trim() : "";
      if (cleanReason.length < 5 || cleanReason.length > 500) throw fail("A moderation reason between 5 and 500 characters is required.", HTTP_STATUS.BAD_REQUEST);
      if (!["MARK_REVIEWED", "DISMISS", "HIDE"].includes(action)) throw fail("Choose a valid moderation action.", HTTP_STATUS.BAD_REQUEST);
      return database.$transaction(async (tx) => {
        const report = await tx.socialContentReport.findUnique({ where: { id: reportId } });
        if (!report || report.status !== "PENDING") throw fail("This report is no longer pending review.", HTTP_STATUS.CONFLICT);
        const targetModel = report.targetType === "POST" ? "cookPost" : report.targetType === "STORY" ? "cookStory" : "cookPostComment";
        const target = await tx[targetModel].findUnique({ where: { id: report.targetId }, select: { id: true, ...(report.targetType === "COMMENT" ? { deletedAt: true } : {}) } });
        if (!target) throw fail("The reported content was deleted and cannot be moderated.", HTTP_STATUS.CONFLICT);
        const auditAction = action === "MARK_REVIEWED" ? "MARK_REVIEWED" : action === "DISMISS" ? "DISMISS_REPORT" : "HIDE_" + report.targetType;
        if (action === "HIDE") {
          if (report.targetType === "COMMENT" && target.deletedAt) throw fail("Deleted comments cannot be hidden again.", HTTP_STATUS.CONFLICT);
          await tx[targetModel].update({ where: { id: report.targetId }, data: { moderationHiddenAt: now() } });
        }
        const status = action === "MARK_REVIEWED" ? "REVIEWED" : action === "DISMISS" ? "DISMISSED" : "ACTION_TAKEN";
        const updated = await tx.socialContentReport.update({ where: { id: reportId }, data: { status, reviewedAt: now() } });
        await tx.socialModerationAction.create({ data: { reportId, adminUserId, targetType: report.targetType, targetId: report.targetId, action: auditAction, reason: cleanReason } });
        return updated;
      }, { isolationLevel: "Serializable" });
    },
  };
};
