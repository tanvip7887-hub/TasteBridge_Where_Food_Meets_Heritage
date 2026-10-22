import { Star } from "lucide-react";

export const StarRating = ({ rating = 0 }) => {
  const score = Number(rating) || 0;
  return <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Rated ${score} out of 5 stars`}>
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-4 w-4 ${index < score ? "fill-amber-400 text-amber-500" : "fill-none text-gray-300"}`} />)}
    </span>
    <span className="text-sm font-semibold text-[#2B1B12]">{score}/5</span>
  </span>;
};

export default StarRating;
