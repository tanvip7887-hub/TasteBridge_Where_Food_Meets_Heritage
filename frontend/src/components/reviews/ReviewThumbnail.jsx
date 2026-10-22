import { CalendarDays, ChefHat, Utensils } from "lucide-react";
import { useState } from "react";
import { getReviewImage } from "../../utils/bookingPresentation.js";

export const ReviewThumbnail = ({ item, size = "default" }) => {
  const images = getReviewImage(item);
  const [imageIndex, setImageIndex] = useState(0);
  const current = images[imageIndex];
  const dimensions = size === "small" ? "h-14 w-14" : "h-40 w-full sm:h-[104px] sm:w-[104px]";
  if (!current?.src) {
    const PlaceholderIcon = current?.placeholderType === "food" ? Utensils : CalendarDays;
    return <div className={`grid shrink-0 place-items-center rounded-xl bg-[#F7F2EC] text-[#B9A99A] ${dimensions}`} aria-label="No review photo available">
      {current?.placeholderType === "event" ? <ChefHat className="h-8 w-8" aria-hidden="true" /> : <PlaceholderIcon className="h-8 w-8" aria-hidden="true" />}
    </div>;
  }
  return <img
    src={current.src}
    alt={current.alt}
    loading="lazy"
    className={`shrink-0 rounded-xl object-cover ${dimensions}`}
    onError={() => setImageIndex((index) => Math.min(index + 1, images.length - 1))}
  />;
};

export default ReviewThumbnail;
