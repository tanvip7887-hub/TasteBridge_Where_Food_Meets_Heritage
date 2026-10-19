import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Flag,
  LoaderCircle,
  MessageSquare,
  MessageSquareText,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import reviewsApi from "../../../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const dateText = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

export const CookReviewsPage = () => {
  const [filterType, setFilterType] = useState(""); // "" | "FOOD" | "EXPERIENCE"
  const [filterNeedsReply, setFilterNeedsReply] = useState(""); // "" | "true"
  const [retryKey, setRetryKey] = useState(0);

  const [reviewsState, setReviewsState] = useState({ key: null, items: [], error: null });
  const currentKey = `${filterType}:${filterNeedsReply}:${retryKey}`;
  const loading = reviewsState.key !== currentKey;
  const items = loading ? [] : reviewsState.items;
  const error = loading ? null : reviewsState.error;

  const [replyDrafts, setReplyDrafts] = useState({});
  const [busyReviewId, setBusyReviewId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");

  // Report modal state
  const [reportingReview, setReportingReview] = useState(null);
  const [reportReason, setReportReason] = useState("");
  const [reportingError, setReportingError] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    let active = true;
    reviewsApi
      .forMyCook({
        page: 1,
        limit: 50,
        ...(filterType ? { type: filterType } : {}),
        ...(filterNeedsReply ? { needsReply: filterNeedsReply } : {}),
      })
      .then((response) => {
        if (!active) return;
        const payload = unwrap(response);
        const reviewList = Array.isArray(payload?.items) ? payload.items : [];
        setReviewsState({ key: currentKey, items: reviewList, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setReviewsState({
          key: currentKey,
          items: [],
          error: err?.message || "Reviews could not be loaded. Please try again.",
        });
      });
    return () => {
      active = false;
    };
  }, [currentKey, filterType, filterNeedsReply]);

  const submitReply = async (review) => {
    const draft = String(replyDrafts[review.id] || "").trim();
    if (!draft || draft.length > 300 || busyReviewId) return;

    setBusyReviewId(review.id);
    setFeedback("");
    setActionError("");

    try {
      const response = await reviewsApi.reply(review.id, draft);
      const payload = unwrap(response);
      if (payload?.id !== review.id || !payload.cookReply) {
        throw new Error("The server did not confirm the reply.");
      }
      setFeedback("Your reply has been posted successfully.");
      setReplyDrafts((prev) => ({ ...prev, [review.id]: "" }));
      setRetryKey((k) => k + 1);
    } catch (err) {
      setActionError(err?.message || "The reply could not be saved. Please try again.");
    } finally {
      setBusyReviewId(null);
    }
  };

  const openReportModal = (review) => {
    setReportingReview(review);
    setReportReason("");
    setReportingError("");
  };

  const closeReportModal = () => {
    setReportingReview(null);
    setReportReason("");
    setReportingError("");
  };

  const handleReportSubmit = async (e) => {
    e.preventDefault();
    const reason = reportReason.trim();
    if (reason.length < 5 || reason.length > 500) {
      setReportingError("Report reason must be between 5 and 500 characters.");
      return;
    }
    if (!reportingReview || submittingReport) return;

    setSubmittingReport(true);
    setReportingError("");
    setFeedback("");
    setActionError("");

    try {
      const response = await reviewsApi.report(reportingReview.id, reason);
      const payload = unwrap(response);
      if (payload?.reviewId !== reportingReview.id) {
        throw new Error("The report could not be recorded.");
      }
      setFeedback("The review was reported for administrator moderation. It remains visible while under review.");
      closeReportModal();
      setRetryKey((k) => k + 1);
    } catch (err) {
      setReportingError(err?.message || "Failed to submit report. Please try again.");
    } finally {
      setSubmittingReport(false);
    }
  };

  const isTabActive = (type, needsReply) => filterType === type && filterNeedsReply === needsReply;

  const selectTab = (type, needsReply) => {
    setFilterType(type);
    setFilterNeedsReply(needsReply);
  };

  return (
    <main className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">Cook Panel</p>
          <h1 className="mt-1 text-2xl font-extrabold text-gray-900 sm:text-3xl">Customer reviews</h1>
          <p className="mt-1 text-sm text-gray-600">
            Read verified customer reviews, reply once with up to 300 characters, or report inappropriate reviews for moderation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      {/* Filter Tabs */}
      <section className="flex flex-wrap items-center gap-2" aria-label="Review filter tabs">
        <button
          type="button"
          onClick={() => selectTab("", "")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            isTabActive("", "")
              ? "bg-[#D2552B] text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => selectTab("FOOD", "")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            isTabActive("FOOD", "")
              ? "bg-[#D2552B] text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          Food
        </button>
        <button
          type="button"
          onClick={() => selectTab("EXPERIENCE", "")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            isTabActive("EXPERIENCE", "")
              ? "bg-[#D2552B] text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          Events
        </button>
        <button
          type="button"
          onClick={() => selectTab("", "true")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            isTabActive("", "true")
              ? "bg-[#D2552B] text-white shadow-sm"
              : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          Needs Reply
        </button>
      </section>

      {/* Global Alerts */}
      {feedback && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Content Section */}
      {loading ? (
        <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-500">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#D2552B]" aria-hidden="true" />
          Loading reviews…
        </div>
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-red-900">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-4 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      ) : items.length > 0 ? (
        <section className="space-y-4" aria-label="Customer review cards">
          {items.map((review) => {
            const draft = replyDrafts[review.id] || "";
            const isBusy = busyReviewId === review.id;
            const isPublished = review.status === "PUBLISHED";
            const isHidden = review.status === "HIDDEN";
            const isRemoved = review.status === "REMOVED";
            const isFood = review.reviewType === "FOOD";
            const subjectTitle = review.subjectName || review.subjectNameSnapshot || review.dish?.name || "TasteBridge experience";

            return (
              <article
                key={review.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-orange-200 sm:p-6"
              >
                {/* Header: Verified Badge, Status, Rating */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isFood ? "bg-emerald-50 text-emerald-800" : "bg-purple-50 text-purple-800"
                        }`}
                      >
                        <CheckCircle className="h-3 w-3" aria-hidden="true" />
                        {isFood ? "Verified order" : "Attended event"}
                      </span>

                      {/* Moderation Status Badges */}
                      {isHidden && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800">
                          Hidden by moderation
                        </span>
                      )}
                      {isRemoved && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-800">
                          Removed
                        </span>
                      )}
                      {review.isReported && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          <Flag className="h-3 w-3" aria-hidden="true" />
                          Reported for review
                        </span>
                      )}
                    </div>

                    <h2 className="mt-2 text-lg font-bold text-gray-900">{subjectTitle}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {review.customerName || "TasteBridge customer"} · {dateText(review.createdAt)}
                      {review.order?.orderNumber && <span> · Order #{review.order.orderNumber}</span>}
                    </p>
                  </div>

                  <span className="inline-flex items-center gap-1 text-base font-bold text-amber-700">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                    {review.rating}/5
                  </span>
                </div>

                {/* Comment */}
                {review.comment && (
                  <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50/80 p-3.5 text-sm leading-6 text-gray-700">
                    {review.comment}
                  </p>
                )}

                {/* Existing Cook Reply */}
                {review.cookReply ? (
                  <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-gray-800">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-[#D2552B]">
                        Your reply
                        {review.cookRepliedAt && (
                          <span className="ml-1 text-xs font-normal text-gray-500">
                            · {dateText(review.cookRepliedAt)}
                          </span>
                        )}
                      </p>
                      <span className="text-[11px] font-semibold text-gray-500">Replied</span>
                    </div>
                    <p className="mt-1.5 leading-6 text-gray-700">{review.cookReply}</p>
                  </div>
                ) : isPublished ? (
                  /* Reply Form (Single reply allowed) */
                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between">
                      <label htmlFor={`reply-${review.id}`} className="text-xs font-bold text-gray-700">
                        Reply to customer (one-time reply, maximum 300 characters)
                      </label>
                      <span className={`text-[11px] ${draft.length > 300 ? "font-bold text-red-600" : "text-gray-500"}`}>
                        {draft.length}/300
                      </span>
                    </div>
                    <textarea
                      id={`reply-${review.id}`}
                      maxLength={300}
                      rows={2}
                      value={draft}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      placeholder="Write a thoughtful reply to thank the customer or address feedback…"
                      className="w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void submitReply(review)}
                        disabled={isBusy || !draft.trim() || draft.length > 300}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ba4721] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isBusy ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isBusy ? "Saving…" : "Post reply"}
                      </button>

                      {/* Report button */}
                      <button
                        type="button"
                        onClick={() => openReportModal(review)}
                        disabled={isBusy || review.isReported}
                        className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        {review.isReported ? "Reported for review" : "Report review"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        /* Empty State */
        <div className="rounded-2xl border border-orange-100 bg-white p-12 text-center shadow-sm">
          <MessageSquareText className="mx-auto h-12 w-12 text-orange-300" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-gray-900">No reviews found</h2>
          <p className="mt-1 text-sm text-gray-600">
            {filterType || filterNeedsReply
              ? "No reviews match the selected filter. Try selecting 'All' to view all reviews."
              : "Verified customer reviews will appear here once customers review your dishes or events."}
          </p>
        </div>
      )}

      {/* Accessible Report Modal */}
      {reportingReview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="report-modal-title" className="text-lg font-bold text-gray-900">
                  Report review for moderation
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Reported reviews are evaluated by administrators. The review remains visible while under moderation.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close report modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="mt-4 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="report-reason" className="text-xs font-bold text-gray-700">
                    Reason for reporting (5–500 characters)
                  </label>
                  <span
                    className={`text-[11px] ${
                      reportReason.trim().length > 500
                        ? "font-bold text-red-600"
                        : reportReason.trim().length < 5 && reportReason.trim().length > 0
                        ? "text-amber-600"
                        : "text-gray-500"
                    }`}
                  >
                    {reportReason.trim().length}/500
                  </span>
                </div>
                <textarea
                  id="report-reason"
                  rows={4}
                  maxLength={500}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Explain why this review violates policies (e.g., abusive language, irrelevant content, harassment)…"
                  className="mt-1 w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  required
                />
              </div>

              {reportingError && (
                <p role="alert" className="text-xs font-medium text-red-700">
                  {reportingError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeReportModal}
                  disabled={submittingReport}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport || reportReason.trim().length < 5 || reportReason.trim().length > 500}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingReport ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Flag className="h-4 w-4" aria-hidden="true" />
                  )}
                  {submittingReport ? "Submitting…" : "Submit report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};

export default CookReviewsPage;
