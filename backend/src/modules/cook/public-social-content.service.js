import {
  cookSellingReadinessWhere,
  findCookProfilesWithValidRequiredText,
} from "../../utils/cookReadiness.js";

const emptyPage = (page, limit) => ({ items: [], pagination: { page, limit, total: 0, totalPages: 0 } });

const publicCookSelect = {
  id: true,
  businessName: true,
  profileImage: true,
  city: true,
  locality: true,
};

const publicMediaSelect = {
  id: true,
  mediaType: true,
  mediaUrl: true,
  mediaFormat: true,
  mediaMimeType: true,
  mediaDurationSeconds: true,
  sortOrder: true,
};

const publicDishSelect = {
  id: true,
  name: true,
  image: true,
  cuisine: true,
};

const serializeStory = ({ id, mediaType, mediaUrl, mediaFormat, mediaMimeType, mediaDurationSeconds, caption, publishedAt, expiresAt, dish }) => ({
  id, mediaType, mediaUrl, mediaFormat, mediaMimeType, mediaDurationSeconds, caption, publishedAt, expiresAt,
  dish: dish ? { id: dish.id, name: dish.name } : null,
});

const serializePost = ({ id, postType, caption, publishedAt, cook, media, dish, _count }) => ({
  id,
  postType,
  caption,
  publishedAt,
  cook: cook ? { id: cook.id, businessName: cook.businessName, profileImage: cook.profileImage, city: cook.city, locality: cook.locality } : null,
  media: (media || []).map(({ id: mediaId, mediaType, mediaUrl, mediaFormat, mediaMimeType, mediaDurationSeconds, sortOrder }) => ({
    id: mediaId, mediaType, mediaUrl, mediaFormat, mediaMimeType, mediaDurationSeconds, sortOrder,
  })),
  dish: dish ? { id: dish.id, name: dish.name, image: dish.image, cuisine: dish.cuisine } : null,
  likeCount: _count?.likes ?? 0,
  commentCount: _count?.comments ?? 0,
});

export const createPublicSocialContentService = (
  database,
  { now = () => new Date(), findEligibleCookIds = findCookProfilesWithValidRequiredText } = {},
) => ({
  async listStoryGroups({ page, limit }) {
    const currentTime = now();
    const cookIds = await findEligibleCookIds(database);
    if (!cookIds.length) return emptyPage(page, limit);

    const activeStoryWhere = {
      publishedAt: { lte: currentTime },
      expiresAt: { gt: currentTime },
      moderationHiddenAt: null,
    };
    const eligibleCookWhere = cookSellingReadinessWhere(currentTime, cookIds);
    const storyWhere = {
      ...activeStoryWhere,
      cookId: { in: cookIds },
      cook: { is: eligibleCookWhere },
    };
    const [total, groups] = await Promise.all([
      database.cookProfile.count({ where: { ...eligibleCookWhere, socialStories: { some: activeStoryWhere } } }),
      database.cookStory.groupBy({
        by: ["cookId"],
        where: storyWhere,
        _max: { publishedAt: true },
        orderBy: [{ _max: { publishedAt: "desc" } }, { cookId: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    if (!groups.length) return emptyPage(page, limit);

    const cooks = await database.cookProfile.findMany({
      where: { ...eligibleCookWhere, id: { in: groups.map(({ cookId }) => cookId) } },
      select: {
        ...publicCookSelect,
        socialStories: {
          where: { publishedAt: { lte: currentTime }, expiresAt: { gt: currentTime }, moderationHiddenAt: null },
          orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
          select: {
            id: true, mediaType: true, mediaUrl: true, mediaFormat: true, mediaMimeType: true,
            mediaDurationSeconds: true, caption: true, publishedAt: true, expiresAt: true,
            dish: { select: { id: true, name: true } },
          },
        },
      },
    });
    const cookById = new Map(cooks.map((cook) => [cook.id, cook]));
    const items = groups.flatMap(({ cookId }) => {
      const cook = cookById.get(cookId);
      if (!cook?.socialStories?.length) return [];
      return [{
        cook: { id: cook.id, businessName: cook.businessName, profileImage: cook.profileImage, city: cook.city, locality: cook.locality },
        stories: cook.socialStories.map(serializeStory),
      }];
    });
    return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },

  async listPosts({ page, limit, postType, cuisine }) {
    const currentTime = now();
    const cookIds = await findEligibleCookIds(database);
    if (!cookIds.length) return emptyPage(page, limit);

    const eligibleCookWhere = cookSellingReadinessWhere(currentTime, cookIds);
    const where = {
      status: "PUBLISHED",
      publishedAt: { not: null, lte: currentTime },
      moderationHiddenAt: null,
      media: { some: {} },
      ...(postType ? { postType } : {}),
      cook: { is: { ...eligibleCookWhere, ...(cuisine ? { cuisines: { has: cuisine } } : {}) } },
    };
    const [total, posts] = await Promise.all([
      database.cookPost.count({ where }),
      database.cookPost.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, postType: true, caption: true, publishedAt: true,
          cook: { select: publicCookSelect },
          media: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: publicMediaSelect },
          dish: { select: publicDishSelect },
          _count: { select: { likes: true, comments: { where: { deletedAt: null, moderationHiddenAt: null } } } },
        },
      }),
    ]);
    return {
      items: posts.map(serializePost),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },
});
