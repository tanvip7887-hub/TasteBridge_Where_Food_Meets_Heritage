const readData = (response) => response?.data?.data ?? response?.data ?? response;

export const activeStoriesForCook = (group, cookId, now = Date.now()) => {
  if (!group?.cook?.id || group.cook.id !== cookId || !Array.isArray(group.stories)) return [];
  return group.stories
    .filter((story) => story?.id && story.mediaUrl && Number.isFinite(new Date(story.expiresAt).getTime()) && new Date(story.expiresAt).getTime() > now)
    .sort((left, right) => new Date(left.publishedAt) - new Date(right.publishedAt));
};

export const findPublicStoryGroupForCook = async (cookId, loadPage) => {
  if (!cookId || typeof loadPage !== "function") return null;
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const data = readData(await loadPage(page));
    const groups = Array.isArray(data) ? data : data?.items || [];
    const found = groups.find((group) => group?.cook?.id === cookId);
    if (found) return found;
    const reportedPages = Number(data?.pagination?.totalPages);
    totalPages = Number.isInteger(reportedPages) && reportedPages >= page ? reportedPages : page;
    page += 1;
  }
  return null;
};

export const ownStoryViewerPath = (cookId, storyId) =>
  `/stories?cookId=${encodeURIComponent(cookId)}&storyId=${encodeURIComponent(storyId)}`;
