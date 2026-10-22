export const getReviewTabCount = (items, pagination, { filterActive = false } = {}) => {
  const totalPages = pagination?.totalPages;
  if (totalPages === 0 || totalPages === 1) return items.length;
  if (totalPages > 1 && !filterActive && Number.isInteger(pagination?.total)) return pagination.total;
  return null;
};

export const getReviewStatusLabel = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PUBLISHED") return "Visible";
  if (normalized === "HIDDEN") return "Hidden";
  if (normalized === "REMOVED") return "Removed";
  return "Status unavailable";
};

export const getPendingReviewStatus = (item) => {
  if (item?.reviewType === "FOOD" && item.deliveredAt) return "Delivered";
  if (item?.reviewType === "EXPERIENCE" && item.completedAt) return "Completed";
  return null;
};
