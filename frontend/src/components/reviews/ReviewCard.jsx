import { CalendarDays } from "lucide-react";
import { useState } from "react";
import StatusChip from "../bookings/StatusChip.jsx";
import ReviewThumbnail from "./ReviewThumbnail.jsx";
import StarRating from "./StarRating.jsx";
import { getPendingReviewStatus, getReviewStatusLabel } from "../../utils/reviewPresentation.js";

const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const ReviewComment = ({ comment }) => {
  const [expanded, setExpanded] = useState(false);
  const canExpand = comment.length > 220;
  return <div className="mt-3 rounded-xl bg-[#FFF8F0] px-4 py-3">
    <p className={`whitespace-pre-wrap text-sm leading-6 text-gray-700 ${canExpand && !expanded ? "line-clamp-3" : ""}`}>{comment}</p>
    {canExpand && <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-sm font-semibold text-[#A94325] underline decoration-transparent underline-offset-2 hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{expanded ? "Read less" : "Read more"}</button>}
  </div>;
};

export const ReviewCard = ({ item, variant, onWrite, onEdit }) => {
  const isReady = variant === "ready";
  const itemType = item.reviewType === "FOOD" ? "Food" : "Event";
  const kitchenName = item.kitchenName;
  const submittedStatus = getReviewStatusLabel(item.status);
  const pendingStatus = getPendingReviewStatus(item);
  const date = isReady ? item.deliveredAt || item.completedAt : item.createdAt;

  return <article className="grid gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md sm:grid-cols-[104px_minmax(0,1fr)] sm:items-start sm:gap-5 sm:p-5">
    <ReviewThumbnail item={item} />
    <div className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#D2552B]">{itemType}</p>
          <h3 className="mt-1 text-lg font-extrabold leading-tight text-[#2B1B12]">{item.subjectName || "TasteBridge experience"}</h3>
          {kitchenName && <p className="mt-1 text-sm text-gray-500">by {kitchenName}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isReady && pendingStatus && <StatusChip type="review" status={pendingStatus}>{pendingStatus}</StatusChip>}
          {!isReady && <StatusChip type="review" status={item.status}>{submittedStatus}</StatusChip>}
          {isReady
            ? <button type="button" onClick={() => onWrite(item)} className="min-h-10 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#ad4324] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Write a review</button>
            : item.editable && <button type="button" onClick={() => onEdit(item)} className="min-h-10 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-[#71351F] transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Edit</button>}
        </div>
      </div>

      {isReady ? <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-[#68733F]" aria-hidden="true" />{dateText(date)}</span>
        {item.orderReference && <span>{itemType === "Food" ? `Order ${item.orderReference}` : `Reference ${item.orderReference}`}</span>}
      </div> : <>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500">
          <StarRating rating={item.rating} />
          <span>{dateText(date)}</span>
        </div>
        {item.comment && <ReviewComment comment={item.comment} />}
        {item.cookReply && <div className="mt-3 border-l-2 border-[#68733F] pl-4 py-1">
          <p className="text-xs font-bold text-[#68733F]">Reply from {kitchenName || item.cookName || "Cook"}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{item.cookReply}</p>
        </div>}
      </>}
    </div>
  </article>;
};

export default ReviewCard;
