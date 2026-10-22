import { getRegionalCuisinePhoto } from "./regionalCuisineImages.js";

const isPublicImageUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^[\d.]+$/.test(host) || host.includes(":")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;
    const private172 = host.match(/^172\.(\d+)\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (host === "::1" || host === "0.0.0.0") return false;
    return true;
  } catch {
    return false;
  }
};

const thumbnailUrl = (value, width = 400) => {
  if (!isPublicImageUrl(value)) return null;
  const url = value.trim();
  const marker = "/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return url;
  const assetPath = url.slice(markerIndex + marker.length);
  const [firstSegment, ...remainingSegments] = assetPath.split("/");
  const hasExistingTransform = /(?:^|,)(?:w_\d+|h_\d+|c_[a-z]+|f_auto|q_auto)(?:,|$)/.test(firstSegment);
  const path = hasExistingTransform ? remainingSegments.join("/") : assetPath;
  return `${url.slice(0, markerIndex + marker.length)}w_${width},c_limit,f_auto,q_auto/${path}`;
};

const normalizedCuisine = (value) => String(value || "")
  .toLocaleLowerCase()
  .replace(/\brajasthani\b/g, "rajasthan")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/** Primary public experience image, preferring a menu dish matching its cuisine. */
export const getExperienceImage = (experience, width = 800, categories = []) => {
  const cuisineNames = [experience?.cuisine, experience?.theme].map(normalizedCuisine).filter(Boolean);
  const matchingDish = experience?.type === "HOME_DINING" && cuisineNames.length
    ? experience.menuItems?.find((item) => {
      const dishCuisine = normalizedCuisine(item?.dish?.cuisine);
      return item?.dish?.image && dishCuisine && cuisineNames.some((cuisine) => dishCuisine.includes(cuisine) || cuisine.includes(dishCuisine));
    })?.dish
    : null;
  const theme = normalizedCuisine(experience?.theme);
  const categoryKeys = [...new Set([theme, normalizedCuisine(experience?.cuisine)].filter(Boolean))];
  const category = categories.find((item) => [item?.name, item?.slug].some((value) => categoryKeys.includes(normalizedCuisine(value))));
  const regionalImage = category ? getRegionalCuisinePhoto(category).image : null;
  const candidates = [matchingDish?.image, regionalImage, ...(experience?.photos || []), experience?.image];
  const value = candidates.find((candidate) => thumbnailUrl(candidate, width));
  const isDishImage = value === matchingDish?.image && Boolean(matchingDish?.image);
  const isRegionalImage = value === regionalImage && Boolean(regionalImage);
  return {
    src: thumbnailUrl(value, width),
    alt: isDishImage
      ? `Photo of ${matchingDish.name || experience.title || "regional dish"}`
      : isRegionalImage
        ? getRegionalCuisinePhoto(category).alt
      : experience?.title ? `Photo of ${experience.title}` : "TasteBridge experience photo",
    placeholderType: experience?.type === "WORKSHOP" ? "workshop" : "dining",
  };
};

/** The ordered public image candidates for a booking, followed by its neutral placeholder. */
export const getBookingImage = (booking) => {
  const candidates = [
    { src: booking?.experienceImageUrl, alt: `Photo of ${booking?.title || "TasteBridge experience"}` },
    { src: booking?.kitchenPhotoUrl, alt: `${booking?.kitchenName || "Cook"} kitchen` },
  ];
  const seen = new Set();
  const images = candidates.flatMap(({ src, alt }) => {
    const safeSrc = thumbnailUrl(src);
    if (!safeSrc || seen.has(safeSrc)) return [];
    seen.add(safeSrc);
    return [{ src: safeSrc, alt }];
  });
  return [...images, { src: null, alt: "No booking photo available", placeholder: true }];
};

/** Ordered public image candidates for a customer review, followed by its type-specific placeholder. */
export const getReviewImage = (item) => {
  const isFood = item?.reviewType === "FOOD";
  const candidates = [
    { src: isFood ? item?.dishImageUrl : item?.experienceImageUrl, alt: `Photo of ${item?.subjectName || "TasteBridge item"}` },
    { src: item?.kitchenPhotoUrl, alt: `${item?.kitchenName || "Cook"} kitchen` },
  ];
  const seen = new Set();
  const images = candidates.flatMap(({ src, alt }) => {
    const safeSrc = thumbnailUrl(src);
    if (!safeSrc || seen.has(safeSrc)) return [];
    seen.add(safeSrc);
    return [{ src: safeSrc, alt }];
  });
  return [...images, { src: null, alt: "", placeholder: true, placeholderType: isFood ? "food" : "event" }];
};

export const shortenBookingReference = (reference) => {
  const value = String(reference || "");
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
};

export const copyBookingReference = async (reference, clipboard = globalThis.navigator?.clipboard) => {
  if (!clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
  await clipboard.writeText(String(reference || ""));
};

export const getBookingTabItems = (groups, tab) => groups?.[tab] || [];
