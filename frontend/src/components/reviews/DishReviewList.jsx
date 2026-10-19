import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle, LoaderCircle, RefreshCw, Star } from "lucide-react";
import { useSelector } from "react-redux";
import reviewsApi from "../../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const DishReviewList = ({ dishId, ratingSummary }) => {
  const { user } = useSelector((state) => state.auth);
  const [retry, setRetry] = useState(0);
  const [reviewState, setReviewState] = useState({ key: null, payload: null, eligible: false, error: null });

  const currentKey = `${dishId}:${retry}:${user?.activePortal}:${user?.role}`;
  const loading = reviewState.key !== currentKey;
  const payload = loading ? null : reviewState.payload;
  const error = loading ? null : reviewState.error;
  const eligible = loading ? false : reviewState.eligible;

  useEffect(() => {
    let active = true;
    const requests = [reviewsApi.forDish(dishId, { page: 1, limit: 10 })];
    if (user?.activePortal === "CUSTOMER" || user?.role === "CUSTOMER") requests.push(reviewsApi.pending({ page: 1, limit: 50 }));
    Promise.all(requests).then(([publicResponse, pendingResponse]) => {
      if (!active) return;
      const result = unwrap(publicResponse);
      const pending = Array.isArray(unwrap(pendingResponse)?.items) ? unwrap(pendingResponse).items : [];
      const isEligible = pending.some((item) => item.reviewType === "FOOD" && item.subjectName && item.orderItemId && item.orderId && item.dishId === dishId);
      setReviewState({ key: currentKey, payload: result, eligible: isEligible, error: null });
    }).catch((requestError) => {
      if (active) {
        setReviewState({ key: currentKey, payload: null, eligible: false, error: requestError?.message || "Reviews could not be loaded." });
      }
    });
    return () => { active = false; };
  }, [dishId, retry, user?.activePortal, user?.role, currentKey]);

  const summary = payload?.ratingSummary || ratingSummary;
  return <section className="mt-8 border-t border-orange-100 pt-6" aria-labelledby="dish-reviews-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="dish-reviews-heading" className="text-xl font-extrabold text-gray-900">Customer reviews</h2>{summary?.count > 0 && <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />{Number(summary.average || 0).toFixed(1)} · {summary.count} verified review{summary.count === 1 ? "" : "s"}</p>}</div>
      {eligible && <Link to={`/reviews?dishId=${encodeURIComponent(dishId)}`} className="rounded-lg border border-orange-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-orange-50">Write a review</Link>}
    </div>
    {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-gray-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading reviews…</p>
      : error ? <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-red-700" role="alert"><AlertCircle className="h-4 w-4" />{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="font-semibold underline"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Retry</button></div>
        : payload?.items?.length ? <div className="mt-4 space-y-3">{payload.items.map((review) => <article key={review.id} className="rounded-xl border border-gray-100 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-gray-900">{review.customerName}</p><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${review.verified === "VERIFIED_ORDER" ? "bg-emerald-50 text-emerald-800" : "bg-purple-50 text-purple-800"}`}><CheckCircle className="h-3 w-3" aria-hidden="true" />{review.verified === "VERIFIED_ORDER" ? "Verified order" : "Attended event"}</span></div><p className="mt-0.5 text-xs text-gray-500">{new Date(review.createdAt).toLocaleDateString("en-IN")}</p></div><span className="flex items-center gap-1 text-sm font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />{review.rating}/5</span></div>{review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{review.comment}</p>}{review.cookReply && <div className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-gray-700"><p className="text-xs font-bold text-[#D2552B]">Reply from {review.cookName}{review.cookRepliedAt && <span className="ml-1 text-[11px] font-normal text-gray-500">· {new Date(review.cookRepliedAt).toLocaleDateString("en-IN")}</span>}</p><p className="mt-1">{review.cookReply}</p></div>}</article>)}</div>
          : <p className="mt-4 rounded-xl bg-orange-50/70 p-4 text-sm text-gray-600">No customer reviews yet.</p>}
  </section>;
};

export default DishReviewList;
