import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Flag,
  LoaderCircle,
  MessageSquare,
  MessageSquareText,
  X,
} from "lucide-react";
import reviewsApi from "../../../api/reviewsApi.js";
import ReviewThumbnail from "../../../components/reviews/ReviewThumbnail.jsx";
import StarRating from "../../../components/reviews/StarRating.jsx";
import ReviewSkeleton from "../../../components/reviews/ReviewSkeleton.jsx";

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

const reviewTabs = [
  { key: "all", label: "All", type: "", needsReply: "" },
  { key: "food", label: "Food", type: "FOOD", needsReply: "" },
  { key: "events", label: "Events", type: "EXPERIENCE", needsReply: "" },
  { key: "needs-reply", label: "Needs Reply", type: "", needsReply: "true" },
];

function ReviewTabs({ filterType, filterNeedsReply, tabCounts, onSelect }) {
  return <nav aria-label="Review filters" className="flex min-w-0 gap-2 overflow-x-auto border-b border-gray-200 pb-3 scrollbar-none">
    {reviewTabs.map((tab) => {
      const active = filterType === tab.type && filterNeedsReply === tab.needsReply;
      const count = tabCounts[`${tab.type}:${tab.needsReply}`];
      return <button key={tab.key} type="button" onClick={() => onSelect(tab.type, tab.needsReply)} aria-pressed={active} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${active ? "border-[#D2552B] bg-[#D2552B] text-white shadow-sm" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
        {tab.label}{Number.isInteger(count) && <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"}`}>{count}</span>}
      </button>;
    })}
  </nav>;
}

function ReviewHeader({ review, subjectTitle, needsReply }) {
  const isFood = review.reviewType === "FOOD";
  const reference = review.order?.orderNumber || review.experienceBooking?.id || review.id;
  return <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
    <div className="flex min-w-0 items-center gap-3">
      <ReviewThumbnail item={review} size="small" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-extrabold text-gray-900 sm:text-lg" title={subjectTitle}>{subjectTitle}</h2>
          {needsReply && !review.cookReply && <span className="inline-flex shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Needs reply</span>}
        </div>
        <p className="mt-1 truncate text-xs text-gray-500" title={String(reference)}>{review.customerName || review.customer?.name || "TasteBridge customer"} Â· {dateText(review.createdAt)} Â· Order #{reference}</p>
      </div>
    </div>
    <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
      <StarRating rating={review.rating} />
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isFood ? "bg-emerald-50 text-emerald-800" : "bg-purple-50 text-purple-800"}`}><span aria-hidden="true">âœ“</span>{isFood ? "Verified order" : "Attended event"}</span>
    </div>
  </header>;
}

function ReviewBody({ comment }) {
  const [expanded, setExpanded] = useState(false);
  const text = String(comment || "");
  const canExpand = text.length > 320;
  return <div className="py-4">
    {text ? <>
      <p className={`whitespace-pre-wrap text-sm leading-6 text-gray-700 ${canExpand && !expanded ? "line-clamp-4" : ""}`}>{text}</p>
      {canExpand && <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-sm font-semibold text-[#A94325] underline decoration-transparent underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{expanded ? "Read less" : "Read more"}</button>}
    </> : <p className="text-sm text-gray-500">No written review</p>}
  </div>;
}

function ReplyBlock({ review }) {
  return <blockquote className="min-w-0 rounded-xl bg-gray-50 p-4">
    <p className="text-xs font-bold text-gray-600">Your reply{review.cookRepliedAt && <span className="ml-1 font-normal text-gray-500">Â· {dateText(review.cookRepliedAt)}</span>}</p>
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{review.cookReply}</p>
  </blockquote>;
}

function ReplyForm({ review, draft, busy, textareaRef, onChange, onCancel, onSubmit }) {
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out">
    <label htmlFor={`reply-${review.id}`} className="block text-xs font-bold text-gray-700">Your reply (one-time, maximum 300 characters)</label>
    <textarea ref={textareaRef} id={`reply-${review.id}`} maxLength={300} rows={3} value={draft} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }} placeholder="Write a thoughtful replyâ€¦" className="mt-2 w-full resize-none rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span aria-live="polite" className={`text-xs ${draft.length > 300 ? "font-bold text-red-600" : "text-gray-500"}`}>{draft.length}/300</span>
      <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:opacity-50">Cancel</button>
        <button type="submit" disabled={busy || !draft.trim() || draft.length > 300} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ba4721] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MessageSquare className="h-4 w-4" aria-hidden="true" />}{busy ? "Savingâ€¦" : "Post reply"}
        </button>
      </div>
    </div>
  </form>;
}

function ReviewCard({ review, needsReply, draft, isReplyOpen, isBusy, textareaRef, onOpenReply, onDraftChange, onCancelReply, onSubmitReply, onReport }) {
  const subjectTitle = review.subjectName || review.subjectNameSnapshot || review.dish?.name || "TasteBridge experience";
  const isPublished = review.status === "PUBLISHED";
  return <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md sm:p-6">
    <ReviewHeader review={review} subjectTitle={subjectTitle} needsReply={needsReply} />
    <div className="my-4 border-t border-gray-100" />
    <ReviewBody comment={review.comment} />
    {review.status === "HIDDEN" && <p className="mb-3 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">Hidden by moderation</p>}
    {review.status === "REMOVED" && <p className="mb-3 inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-800">Removed</p>}
    {review.cookReply && <ReplyBlock review={review} />}
    <footer className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
      <div className="min-w-0">
        {!review.cookReply && isPublished && <button type="button" onClick={() => onOpenReply(review)} aria-expanded={isReplyOpen} aria-controls={`reply-panel-${review.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><MessageSquare className="h-4 w-4" aria-hidden="true" />{isReplyOpen ? "Close reply" : "Reply"}</button>}
        {!review.cookReply && isPublished && <p className="mt-1 text-xs text-gray-500">You can reply once.</p>}
      </div>
      {review.isReported ? <span className="inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-amber-800">Reported, under moderation</span> : isPublished && <button type="button" onClick={() => onReport(review)} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Flag className="h-4 w-4" aria-hidden="true" />Report review</button>}
    </footer>
    {!review.cookReply && <div id={`reply-panel-${review.id}`} className={`${isReplyOpen ? "mt-3 max-h-[360px] opacity-100" : "max-h-0 opacity-0"} overflow-hidden transition-[max-height,opacity] duration-200 ease-out`}>{isReplyOpen && <ReplyForm review={review} draft={draft} busy={isBusy} textareaRef={textareaRef} onChange={onDraftChange} onCancel={onCancelReply} onSubmit={onSubmitReply} />}</div>}
  </article>;
}

function EmptyState({ filtered }) {
  return <section className="rounded-2xl border border-dashed border-orange-200 bg-white p-8 text-center sm:p-12" aria-label="No reviews">
    <MessageSquareText className="mx-auto h-10 w-10 text-orange-300" aria-hidden="true" />
    <h2 className="mt-3 text-lg font-bold text-gray-900">{filtered ? "No reviews match these filters" : "No reviews yet"}</h2>
    <p className="mt-1 text-sm text-gray-600">{filtered ? "Try another filter to see more customer feedback." : "Verified customer reviews will appear here once customers review your dishes or events."}</p>
  </section>;
}

export const CookReviewsPage = () => {
  const [filterType, setFilterType] = useState(""); // "" | "FOOD" | "EXPERIENCE"
  const [filterNeedsReply, setFilterNeedsReply] = useState(""); // "" | "true"
  const [retryKey, setRetryKey] = useState(0);

  const [reviewsState, setReviewsState] = useState({ key: null, items: [], pagination: null, error: null });
  const [tabCounts, setTabCounts] = useState({});
  const currentKey = `${filterType}:${filterNeedsReply}:${retryKey}`;
  const loading = reviewsState.key !== currentKey;
  const items = loading ? [] : reviewsState.items;
  const error = loading ? null : reviewsState.error;

  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState(null);
  const replyTextareaRef = useRef(null);
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
        setReviewsState({ key: currentKey, items: reviewList, pagination: payload?.pagination || null, error: null });
        if (Number.isInteger(payload?.pagination?.total)) {
          setTabCounts((previous) => ({ ...previous, [`${filterType}:${filterNeedsReply}`]: payload.pagination.total }));
        }
      })
      .catch((err) => {
        if (!active) return;
        setReviewsState({
          key: currentKey,
          items: [],
          pagination: null,
          error: err?.message || "Reviews could not be loaded. Please try again.",
        });
      });
    return () => {
      active = false;
    };
  }, [currentKey, filterType, filterNeedsReply]);

  useEffect(() => {
    if (openReplyId) replyTextareaRef.current?.focus();
  }, [openReplyId]);

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
      setOpenReplyId(null);
      setTabCounts({});
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

  const selectTab = (type, needsReply) => {
    if (openReplyId) setReplyDrafts((previous) => ({ ...previous, [openReplyId]: "" }));
    setOpenReplyId(null);
    setFilterType(type);
    setFilterNeedsReply(needsReply);
  };

  return (
    <main className="mx-auto -mt-4 w-full max-w-[1180px] space-y-6 pb-12 pt-6 sm:-mt-6 lg:-mt-8">
      <h1 className="sr-only">Customer reviews</h1>
      <ReviewTabs
        filterType={filterType}
        filterNeedsReply={filterNeedsReply}
        tabCounts={tabCounts}
        onSelect={selectTab}
      />

      {feedback && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /><span>{feedback}</span></div>}
      {actionError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" /><span>{actionError}</span></div>}

      {loading ? (
        <section role="status" aria-label="Loading reviews" className="space-y-5"><span className="sr-only">Loading reviews…</span>{[1, 2, 3].map((key) => <ReviewSkeleton key={key} />)}</section>
      ) : error ? (
        <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-red-900">{error}</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-4 min-h-11 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-800 hover:bg-red-50">Retry</button>
        </section>
      ) : items.length > 0 ? (
        <ul className="space-y-5" aria-label="Customer review cards">
          {items.map((review) => (
            <li key={review.id}>
              <ReviewCard
                review={review}
                needsReply={filterNeedsReply === "true"}
                draft={replyDrafts[review.id] || ""}
                isReplyOpen={openReplyId === review.id}
                isBusy={busyReviewId === review.id}
                textareaRef={openReplyId === review.id ? replyTextareaRef : null}
                onOpenReply={(selected) => {
                  if (openReplyId === selected.id) {
                    setReplyDrafts((previous) => ({ ...previous, [selected.id]: "" }));
                    setOpenReplyId(null);
                  } else {
                    setReplyDrafts({ [selected.id]: "" });
                    setOpenReplyId(selected.id);
                  }
                }}
                onDraftChange={(value) => setReplyDrafts({ [review.id]: value })}
                onCancelReply={() => {
                  setReplyDrafts((previous) => ({ ...previous, [review.id]: "" }));
                  setOpenReplyId(null);
                }}
                onSubmitReply={() => void submitReply(review)}
                onReport={openReportModal}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState filtered={Boolean(filterType || filterNeedsReply)} />
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
                    Reason for reporting (5â€“500 characters)
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
                  placeholder="Explain why this review violates policies (e.g., abusive language, irrelevant content, harassment)â€¦"
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
                  {submittingReport ? "Submittingâ€¦" : "Submit report"}
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
