const isFssaiReview = (notification, source) =>
  notification?.source === source
  && notification?.metadata?.kind === "FSSAI_REVIEW"
  && typeof notification?.metadata?.eventKey === "string"
  && notification.metadata.eventKey.length > 0;

/** Combine only the paired legacy/shared copies created by the same review.
 * Each underlying record remains independent for read operations.
 */
export const mergeCookNotificationFeeds = (sharedItems = [], legacyItems = []) => {
  const sharedByEventKey = new Map(
    sharedItems.filter((item) => isFssaiReview(item, "shared"))
      .map((item) => [item.metadata.eventKey, item]),
  );
  const pairedSharedIds = new Set();
  const combined = legacyItems.map((legacy) => {
    const shared = isFssaiReview(legacy, "legacy")
      ? sharedByEventKey.get(legacy.metadata.eventKey)
      : null;
    // Event-key matching is the primary guard. Matching copy also protects
    // historical/malformed records from hiding an unrelated alert.
    if (!shared || shared.title !== legacy.title || shared.message !== legacy.message) return { ...legacy, displayKey: `legacy:${legacy.id}`, sources: [legacy] };
    pairedSharedIds.add(shared.id);
    const sources = [legacy, shared];
    return {
      ...legacy,
      displayKey: `fssai:${legacy.metadata.eventKey}`,
      sources,
      isRead: sources.every((item) => item.isRead),
    };
  });

  for (const item of sharedItems) {
    if (pairedSharedIds.has(item.id)) continue;
    combined.push({ ...item, displayKey: `shared:${item.id}`, sources: [item] });
  }

  return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

/** Count paired shared/legacy FSSAI rows once when both are currently unread. */
export const countCookUnreadNotifications = (sharedUnreadCount, legacyUnreadCount, mergedItems = []) => {
  const sharedCount = Number.isFinite(sharedUnreadCount) ? sharedUnreadCount : 0;
  const legacyCount = Number.isFinite(legacyUnreadCount) ? legacyUnreadCount : 0;
  const pairedUnreadCount = mergedItems.filter((item) => (
    item.sources?.length === 2 && item.sources.every((source) => !source.isRead)
  )).length;

  return Math.max(0, sharedCount + legacyCount - pairedUnreadCount);
};
