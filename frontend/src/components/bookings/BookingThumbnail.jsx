import { ChefHat, ImageOff } from "lucide-react";
import { useState } from "react";
import { getBookingImage } from "../../utils/bookingPresentation.js";

export const BookingThumbnail = ({ booking, type = "dine" }) => {
  const images = getBookingImage(booking);
  const [imageIndex, setImageIndex] = useState(0);
  const current = images[imageIndex];

  if (!current?.src) return <div className={`${type === "workshop" ? "grid h-40 w-full place-items-center sm:h-[110px] sm:w-[140px]" : "grid aspect-[4/3] w-full place-items-center sm:aspect-square sm:w-44"} rounded-xl bg-[#F7F2EC] text-[#B9A99A]`} aria-label="No booking photo available">
    {type === "workshop" ? <ChefHat className="h-8 w-8" aria-hidden="true" /> : <ImageOff className="h-8 w-8" aria-hidden="true" />}
  </div>;

  return <img
    src={current.src}
    alt={current.alt}
    loading="lazy"
    className={type === "workshop" ? "h-40 w-full rounded-xl object-cover sm:h-[110px] sm:w-[140px]" : "aspect-[4/3] w-full rounded-xl object-cover sm:aspect-square sm:w-44"}
    onError={() => setImageIndex((index) => Math.min(index + 1, images.length - 1))}
  />;
};

export default BookingThumbnail;
