export const normalizeStoryGroups = (groups, now = Date.now()) => {
  const byCook = new Map();
  for (const group of Array.isArray(groups) ? groups : []) {
    const cook = group?.cook;
    if (!cook?.id) continue;
    const activeStories = (Array.isArray(group.stories) ? group.stories : [])
      .filter((story) => story?.id && story.mediaUrl && new Date(story.expiresAt).getTime() > now)
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    if (!activeStories.length) continue;
    const existing = byCook.get(cook.id);
    if (existing) {
      existing.stories.push(...activeStories);
      existing.stories.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
    } else {
      byCook.set(cook.id, { cook, stories: activeStories });
    }
  }
  return [...byCook.values()];
};

export const moveStoryPosition = (groups, position, direction = 1, now = Date.now()) => {
  if (!Array.isArray(groups) || !position) return null;
  let groupIndex = position.groupIndex;
  let storyIndex = position.storyIndex + direction;
  while (groupIndex >= 0 && groupIndex < groups.length) {
    const stories = groups[groupIndex]?.stories || [];
    while (storyIndex >= 0 && storyIndex < stories.length) {
      if (new Date(stories[storyIndex].expiresAt).getTime() > now) return { groupIndex, storyIndex };
      storyIndex += direction;
    }
    groupIndex += direction;
    if (groupIndex < 0 || groupIndex >= groups.length) return null;
    storyIndex = direction > 0 ? 0 : (groups[groupIndex].stories?.length || 0) - 1;
  }
  return null;
};

export const groupPostComments = (items = []) => {
  const byParent = new Map();
  items.forEach((item) => {
    const key = item.parentId || null;
    byParent.set(key, [...(byParent.get(key) || []), item]);
  });
  const visit = (parentId = null) => (byParent.get(parentId) || []).map((item) => ({ ...item, replies: visit(item.id) }));
  return visit();
};
