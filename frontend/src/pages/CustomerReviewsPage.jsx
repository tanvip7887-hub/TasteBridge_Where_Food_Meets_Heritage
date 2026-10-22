import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, BookOpenCheck } from "lucide-react";
import reviewsApi from "../api/reviewsApi.js";
import CustomerReviewModal from "../components/reviews/CustomerReviewModal.jsx";
import ReviewCard from "../components/reviews/ReviewCard.jsx";
import ReviewSkeleton from "../components/reviews/ReviewSkeleton.jsx";
import Tabs from "../components/bookings/Tabs.jsx";
import { getReviewTabCount } from "../utils/reviewPresentation.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const CustomerReviewsPage = () => {
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState([]);
  const [mine, setMine] = useState([]);
  const [pendingPagination, setPendingPagination] = useState(null);
  const [minePagination, setMinePagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedTab, setSelectedTab] = useState(null);
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
      setPendingPagination(pendingData.pagination || null);
      setMinePagination(mineData.pagination || null);
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
  const hasPendingFilter = Boolean(requestedOrder || requestedBooking || requestedDish);
  const activeTab = selectedTab || (visiblePending.length ? "ready" : "submitted");
  const tabs = [
    { value: "ready", label: "Ready to review", count: getReviewTabCount(visiblePending, pendingPagination, { filterActive: hasPendingFilter }) },
    { value: "submitted", label: "Submitted", count: getReviewTabCount(mine, minePagination) },
  ];

  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
    <header className="rounded-2xl border border-orange-100 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6">
      <p className="text-xs font-semibold text-gray-500">Customer panel <span className="mx-2 text-gray-300">/</span><span className="text-[#D2552B]">Your reviews</span></p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">Your reviews</h1>
      <p className="mt-2 text-sm text-gray-600">Share feedback only for completed, verified purchases and events.</p>
    </header>
    {loading ? <div role="status" aria-label="Loading your reviews" className="space-y-4"><ReviewSkeleton /><ReviewSkeleton /></div>
      : error ? <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-red-100 bg-white px-5 py-10 text-center shadow-sm" role="alert"><AlertCircle className="h-9 w-9 text-red-500" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-gray-700">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Retry</button></div>
        : <>
          <Tabs tabs={tabs} value={activeTab} onChange={setSelectedTab} label="Your reviews" idPrefix="reviews" />
          {activeTab === "ready" ? <section id="reviews-panel-ready" role="tabpanel" aria-labelledby="reviews-tab-ready" className="space-y-4" aria-label="Ready to review">
            {visiblePending.length ? visiblePending.map((item) => <ReviewCard key={`${item.reviewType}-${item.id}`} item={item} variant="ready" onWrite={begin} />)
              : <div className="rounded-2xl border border-orange-100 bg-white px-5 py-10 text-center shadow-sm"><BookOpenCheck className="mx-auto h-9 w-9 text-[#68733F]" aria-hidden="true" /><p className="mt-3 text-sm text-gray-600">{requestedOrder || requestedBooking || requestedDish ? "No eligible review is available for this item. It may already be reviewed or outside the review window." : "You have no completed purchases waiting for a review."}</p></div>}
          </section> : <section id="reviews-panel-submitted" role="tabpanel" aria-labelledby="reviews-tab-submitted" className="space-y-4" aria-label="Submitted reviews">
            {mine.length ? mine.map((review) => <ReviewCard key={review.id} item={review} variant="submitted" onEdit={beginEdit} />)
              : <div className="rounded-2xl border border-orange-100 bg-white px-5 py-10 text-center shadow-sm"><BookOpenCheck className="mx-auto h-9 w-9 text-[#68733F]" aria-hidden="true" /><p className="mt-3 text-sm text-gray-600">You have not submitted a review yet.</p></div>}
          </section>}
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
