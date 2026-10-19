import {
  cookSellingReadinessWhere,
  getCookSellingReadiness,
} from "./cookReadiness.js";

export const isCookEligibleToSell = (cookProfile, now = new Date()) =>
  getCookSellingReadiness(cookProfile, now).readyToSell;

export const publicDishesWhere = (categoryId, now = new Date(), eligibleProfileIds = []) => ({
  ...(categoryId ? { categoryId } : {}),
  status: "PUBLISHED",
  isAvailable: true,
  availableQuantity: { gt: 0 },
  cook: {
    is: {
      ...cookSellingReadinessWhere(now, eligibleProfileIds),
      // This is an operational availability switch, distinct from sale approval.
      isOpen: true,
    },
  },
});

export const getDishCustomerVisibility = (dish, cookProfile, accountStatus, now = new Date()) => {
  const readiness = getCookSellingReadiness({
    ...cookProfile,
    user: {
      ...cookProfile?.user,
      role: cookProfile?.user?.role,
      status: accountStatus,
    },
  }, now);
  const reasons = readiness.pendingRequirements.map((item) => item.message);
  if (cookProfile?.isOpen !== true) reasons.push("Kitchen is closed");
  if (dish?.status !== "PUBLISHED") reasons.push("Dish is not published");
  if ((dish?.availableQuantity ?? 0) <= 0) reasons.push("Sold out");
  if (dish?.isAvailable !== true) reasons.push("Dish is paused");

  return { isVisible: reasons.length === 0, reasons };
};

export const publicDishStory = (story) => {
  if (!story || story.visibility !== "PUBLIC") return null;
  const { whoTaught, occasion, culturalSignificance, storyText } = story;
  return { whoTaught, occasion, culturalSignificance, storyText, visibility: "PUBLIC" };
};
