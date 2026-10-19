import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, LoaderCircle, Star } from "lucide-react";
import reviewsApi from "../api/reviewsApi.js";
import CustomerReviewModal from "../components/reviews/CustomerReviewModal.jsx";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export const CustomerReviewsPage = () => {
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const [pendingResponse, mineResponse] = await Promise.all([
        reviewsApi.pending({ page: 1, limit: 50 }),
        reviewsApi.mine({ page: 1, limit: 50 }),
      ]);
      if (signal?.aborted) return;
      const pendingData = unwrap(pendingResponse);
      const mineData = unwrap(mineResponse);
      if (!Array.isArray(pendingData?.items) || !Array.isArray(mineData?.items)) throw new Error("Your review list could not be read. Please retry.");
      setPending(pendingData.items);
      setMine(mineData.items);
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError?.message || "Reviews could not be loaded.");
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load(controller.signal);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, retry]);

  const requestedOrder = searchParams.get("orderId");
  const requestedBooking = searchParams.get("bookingId");
  const requestedDish = searchParams.get("dishId");
  const visiblePending = useMemo(() => pending.filter((item) => (!requestedOrder || item.orderId === requestedOrder || item.checkoutId === requestedOrder)
    && (!requestedBooking || item.bookingId === requestedBooking)
    && (!requestedDish || item.dishId === requestedDish)), [pending, requestedOrder, requestedBooking, requestedDish]);

  const begin = (item) => {
    setActive({ kind: "new", item });
  };
  const beginEdit = (review) => {
    setActive({ kind: "edit", review });
  };

  const modalTarget = active?.kind === "new" ? active.item : active?.review ? { ...active.review, kind: "edit" } : null;

  return <main className="mx-auto w-full max-w-5xl space-y-7 px-4 py-8 sm:px-6 sm:py-10">
    <header><p className="text-sm font-semibold text-[#D2552B]">Customer Panel</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">Your reviews</h1><p className="mt-2 text-sm text-gray-600">Share feedback only for completed, verified purchases and events.</p></header>
    {error && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="h-4 w-4" />{error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="font-bold underline">Retry</button></div>}
    {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" />Loading your reviews…</div>
      : error ? null : <>
        <section className="space-y-3" aria-labelledby="pending-reviews-heading"><h2 id="pending-reviews-heading" className="text-xl font-bold text-[#2B1B12]">Ready for your review</h2>
          {visiblePending.length ? visiblePending.map((item) => <article key={`${item.reviewType}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">{item.reviewType === "FOOD" ? "Verified order" : "Attended event"}</p><h3 className="mt-1 font-bold text-gray-900">{item.subjectName}</h3><p className="mt-1 text-xs text-gray-500">{item.orderReference ? `Order ${item.orderReference} · ` : ""}{dateText(item.deliveredAt || item.completedAt)}</p></div><button type="button" onClick={() => begin(item)} className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Write a review</button></article>)
            : <p className="rounded-xl bg-white p-5 text-sm text-gray-600">{requestedOrder || requestedBooking || requestedDish ? "No eligible review is available for this item. It may already be reviewed or outside the review window." : "You have no completed purchases waiting for a review."}</p>}
        </section>
        <section className="space-y-3" aria-labelledby="submitted-reviews-heading"><h2 id="submitted-reviews-heading" className="text-xl font-bold text-[#2B1B12]">Submitted reviews</h2>
          {mine.length ? mine.map((review) => <article key={review.id} className="rounded-2xl border border-gray-100 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{review.reviewType === "FOOD" ? "Food" : "Experience"} · {review.status === "PUBLISHED" ? "Visible" : review.status === "HIDDEN" ? "Hidden by moderation" : "Removed"}</p><h3 className="mt-1 font-bold text-gray-900">{review.subjectName}</h3><p className="mt-1 text-xs text-gray-500">{dateText(review.createdAt)}</p></div><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1 font-bold text-amber-700"><Star className="h-4 w-4 fill-amber-400 text-amber-500" />{review.rating}/5</span>{review.editable && <button type="button" onClick={() => beginEdit(review)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit</button>}</div></div>{review.comment && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{review.comment}</p>}{review.cookReply && <p className="mt-3 rounded-lg bg-orange-50 p-3 text-sm text-gray-700"><strong>Cook reply:</strong> {review.cookReply}</p>}</article>) : <p className="rounded-xl bg-white p-5 text-sm text-gray-600">You have not submitted a review yet.</p>}
        </section>
      </>}
    <CustomerReviewModal
      isOpen={Boolean(active)}
      target={modalTarget}
      onClose={() => setActive(null)}
      onSuccess={() => {
        void load();
      }}
    />
    {!loading && !error && pending.length === 0 && mine.length === 0 && <Link to="/explore" className="inline-flex rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700">Browse dishes</Link>}
  </main>;
};

export default CustomerReviewsPage;
