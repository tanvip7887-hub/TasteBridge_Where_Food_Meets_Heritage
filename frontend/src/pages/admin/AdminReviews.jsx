import { useEffect, useId, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  EyeOff,
  Filter,
  LoaderCircle,
  MessageSquareWarning,
  RefreshCw,
  ShieldAlert,
  Star,
  X,
} from "lucide-react";
import reviewsApi from "../../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

const dateText = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const AdminReviews = () => {
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [filterType, setFilterType] = useState("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const currentKey = `${filterStatus}_${filterType}_${currentPage}_${refreshIndex}`;
  const [dataState, setDataState] = useState({
    key: currentKey,
    items: [],
    total: 0,
    totalPages: 1,
    error: "",
  });

  const loading = dataState.key !== currentKey;

  // Moderation modal state
  const [modalState, setModalState] = useState(null); // { type: 'KEEP' | 'HIDE', item }
  const [reasonDraft, setReasonDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonInputId = useId();

  useEffect(() => {
    let isCurrent = true;
    const queryParams = {
      page: currentPage,
      limit: 20,
      ...(filterStatus !== "ALL" ? { status: filterStatus } : {}),
      ...(filterType !== "ALL" ? { type: filterType } : {}),
    };

    reviewsApi.reportedForAdmin(queryParams)
      .then((res) => {
        if (!isCurrent) return;
        const payload = unwrap(res);
        setDataState({
          key: currentKey,
          items: Array.isArray(payload?.items) ? payload.items : [],
          total: payload?.pagination?.total ?? 0,
          totalPages: payload?.pagination?.totalPages ?? 1,
          error: "",
        });
      })
      .catch((err) => {
        if (!isCurrent) return;
        setDataState({
          key: currentKey,
          items: [],
          total: 0,
          totalPages: 1,
          error: err?.response?.data?.message || err?.message || "Reported reviews could not be loaded.",
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [currentKey, currentPage, filterStatus, filterType]);

  const openModal = (type, item) => {
    setActionError("");
    setReasonDraft(type === "KEEP" ? "Report reviewed and dismissed - review kept published." : "");
    setModalState({ type, item });
  };

  const closeModal = () => {
    if (submitting) return;
    setModalState(null);
    setReasonDraft("");
    setActionError("");
  };

  const submitModeration = async () => {
    if (!modalState) return;
    const { type, item } = modalState;
    const trimmed = reasonDraft.trim();

    if (type === "HIDE" && trimmed.length < 5) {
      setActionError("A reason of at least 5 characters is required when hiding a review.");
      return;
    }
    if (trimmed.length > 500) {
      setActionError("Moderation reason cannot exceed 500 characters.");
      return;
    }

    setSubmitting(true);
    setActionError("");

    try {
      const payload = unwrap(await reviewsApi.moderate(item.reviewId, {
        action: type,
        reason: trimmed || undefined,
      }));

      if (!payload?.id) {
        throw new Error("Server did not confirm moderation decision.");
      }

      // If active filter was ACTIVE, remove item from list
      if (filterStatus === "ACTIVE") {
        setDataState((current) => ({
          ...current,
          items: current.items.filter((row) => row.reviewId !== item.reviewId),
          total: Math.max(0, current.total - 1),
        }));
      } else {
        // Trigger refresh
        setRefreshIndex((idx) => idx + 1);
      }

      closeModal();
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || "The moderation decision could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
              <ShieldAlert className="h-3.5 w-3.5" />
              Admin Moderation Center
            </div>
            <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-extrabold text-gray-900">
              <MessageSquareWarning className="h-7 w-7 text-rose-600" />
              Reported Reviews
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Review cook reports, inspect customer ratings, and decide whether to keep reviews published or hide them from public view.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshIndex((idx) => idx + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Filter Controls */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 pt-5">
          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by report status">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-gray-500">Status:</span>
            {[
              { id: "ACTIVE", label: "Pending Reports", testId: "filter-status-active" },
              { id: "KEPT", label: "Kept Published", testId: "filter-status-kept" },
              { id: "HIDDEN", label: "Hidden", testId: "filter-status-hidden" },
              { id: "ALL", label: "All Reports", testId: "filter-status-all" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.testId}
                onClick={() => {
                  setFilterStatus(tab.id);
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterStatus === tab.id
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by review type">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-gray-500">Type:</span>
            {[
              { id: "ALL", label: "All Types", testId: "filter-type-all" },
              { id: "FOOD", label: "Food Orders", testId: "filter-type-food" },
              { id: "EXPERIENCE", label: "Events", testId: "filter-type-experience" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={tab.testId}
                onClick={() => {
                  setFilterType(tab.id);
                  setCurrentPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterType === tab.id
                    ? "bg-slate-800 text-white shadow-xs"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Global Error Banner */}
      {dataState.error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="mr-2 inline h-4 w-4 text-red-600" />
          {dataState.error}
          <button
            type="button"
            onClick={() => setRefreshIndex((idx) => idx + 1)}
            className="ml-3 font-bold underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content List */}
      {loading ? (
        <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-8 text-gray-500 shadow-sm">
          <LoaderCircle className="h-8 w-8 animate-spin text-rose-600" />
          <span className="text-sm font-medium">Loading reported reviews queue…</span>
        </div>
      ) : dataState.items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">
            {filterStatus === "ACTIVE" ? "Queue Clear! No Pending Reports" : "No Reports Found"}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {filterStatus === "ACTIVE"
              ? "All flagged reviews have been reviewed and resolved."
              : "No reported review records match the selected filter criteria."}
          </p>
        </section>
      ) : (
        <section className="space-y-4" aria-label="Reported review list">
          {dataState.items.map((item) => {
            const review = item.review || {};
            const isFood = review.reviewType === "FOOD";

            return (
              <article
                key={item.id}
                data-testid={`reported-review-${item.id}`}
                className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Header row: Verified badge, report date, and rating */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Verified Badge */}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isFood
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}
                      >
                        {isFood ? "Verified order" : "Attended event"}
                      </span>

                      {/* Current Review Status Badge */}
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          review.status === "PUBLISHED"
                            ? "bg-emerald-50 text-emerald-800"
                            : review.status === "HIDDEN"
                            ? "bg-rose-50 text-rose-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        Review: {review.status || "UNKNOWN"}
                      </span>

                      {/* Report Status Badge */}
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          item.status === "ACTIVE"
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : item.status === "KEPT"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-gray-200 text-gray-800"
                        }`}
                      >
                        Report: {item.status}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-gray-900">
                      {review.subjectName || "TasteBridge Experience"}
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>
                        Customer: <strong className="font-semibold text-gray-900">{review.customerName || "Customer"}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Cook: <strong className="font-semibold text-gray-900">{review.cookName || "Cook"}</strong>
                      </span>
                      {review.orderNumber && (
                        <>
                          <span>•</span>
                          <span>Order #{review.orderNumber}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        Reviewed {dateText(review.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Rating Stars */}
                  <div className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1.5 border border-amber-200">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                    <span className="font-extrabold text-amber-900">{review.rating ?? 5}/5</span>
                  </div>
                </div>

                {/* Customer Comment */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Customer feedback</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm text-gray-800 border border-gray-100">
                    {review.comment ? `“${review.comment}”` : <span className="italic text-gray-400">No written comment provided.</span>}
                  </p>
                </div>

                {/* Cook Reply (if present) */}
                {review.cookReply && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Cook reply</p>
                    <div className="mt-1 rounded-xl bg-amber-50/70 p-3.5 text-sm text-amber-950 border border-amber-100">
                      <p>{review.cookReply}</p>
                      {review.cookRepliedAt && (
                        <p className="mt-1 text-[11px] text-amber-700">Replied {dateText(review.cookRepliedAt)}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Cook's Flag Report Box */}
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-rose-800">
                      <ShieldAlert className="h-4 w-4 text-rose-600" />
                      Cook report reason
                    </p>
                    <span className="text-xs text-rose-600">Reported {dateText(item.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-rose-950 whitespace-pre-wrap">
                    {item.reason}
                  </p>
                </div>

                {/* Moderation History if resolved */}
                {item.resolvedAt && (
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700 border border-slate-200 flex flex-wrap justify-between gap-2">
                    <span>
                      Decision: <strong>{item.status === "KEPT" ? "Kept Published" : "Hidden"}</strong>
                      {review.moderationReason && ` — “${review.moderationReason}”`}
                    </span>
                    <span>Resolved {dateText(item.resolvedAt)}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    data-testid={`keep-btn-${item.id}`}
                    onClick={() => openModal("KEEP", item)}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Keep review
                  </button>
                  <button
                    type="button"
                    data-testid={`hide-btn-${item.id}`}
                    onClick={() => openModal("HIDE", item)}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                  >
                    <EyeOff className="h-4 w-4" />
                    Hide review
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Moderation Confirmation Modal */}
      {modalState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="moderation-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 border border-gray-100">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="moderation-modal-title" className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  {modalState.type === "HIDE" ? (
                    <>
                      <EyeOff className="h-5 w-5 text-rose-600" />
                      Hide Review from Public Display
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      Keep Review Published
                    </>
                  )}
                </h3>
                <p className="mt-1 text-xs text-gray-600">
                  {modalState.type === "HIDE"
                    ? "Hiding this review will exclude it from public dish and cook pages and rating calculations. A moderation reason is required for audit logs."
                    : "This will dismiss the cook's report and keep the review publicly visible for all diners."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Message inside modal */}
            {actionError && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                <AlertCircle className="mr-1.5 inline h-4 w-4 text-red-600" />
                {actionError}
              </div>
            )}

            {/* Reason Field */}
            <div className="space-y-1.5">
              <label htmlFor={reasonInputId} className="block text-xs font-bold text-gray-700">
                {modalState.type === "HIDE" ? (
                  <>
                    Moderation Reason <span className="text-rose-600">*</span> (5–500 characters)
                  </>
                ) : (
                  <>
                    Administrative Note <span className="text-gray-400 font-normal">(optional)</span>
                  </>
                )}
              </label>
              <textarea
                id={reasonInputId}
                rows={4}
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                maxLength={500}
                placeholder={
                  modalState.type === "HIDE"
                    ? "Explain why this review violates platform guidelines and is being hidden…"
                    : "Notes on report dismissal…"
                }
                className="w-full rounded-xl border border-gray-300 p-3 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>{modalState.type === "HIDE" ? "Minimum 5 characters required" : "Recorded in moderation audit log"}</span>
                <span>{reasonDraft.length}/500</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitModeration}
                disabled={submitting || (modalState.type === "HIDE" && reasonDraft.trim().length < 5)}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white shadow-xs disabled:opacity-50 transition-colors ${
                  modalState.type === "HIDE"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {modalState.type === "HIDE" ? "Confirm Hide Review" : "Confirm Keep Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviews;
