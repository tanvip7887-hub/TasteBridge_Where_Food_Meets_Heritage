import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, ChefHat, Clock3, EyeOff, Filter, Info, LoaderCircle, MessageSquareWarning, Search, ShieldAlert, ThumbsUp, UtensilsCrossed, X } from "lucide-react";
import reviewsApi from "../../api/reviewsApi.js";
import StarRating from "../../components/reviews/StarRating.jsx";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const dateText = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const SHORT_STATUSES = [
  { id: "ACTIVE", label: "Pending Reports", testId: "filter-status-active" },
  { id: "KEPT", label: "Kept Published", testId: "filter-status-kept" },
  { id: "HIDDEN", label: "Hidden", testId: "filter-status-hidden" },
  { id: "ALL", label: "All Reports", testId: "filter-status-all" },
];
const TYPES = [
  { id: "ALL", label: "All Types", testId: "filter-type-all" },
  { id: "FOOD", label: "Food Orders", testId: "filter-type-food" },
  { id: "EXPERIENCE", label: "Events", testId: "filter-type-experience" },
];

function ReportStatusBadge({ status }) {
  const style = status === "ACTIVE" ? "bg-amber-100 text-amber-900" : status === "KEPT" ? "bg-emerald-100 text-emerald-900" : "bg-gray-100 text-gray-700";
  const label = status === "ACTIVE" ? "Pending" : status === "KEPT" ? "Kept published" : status === "HIDDEN" ? "Hidden" : "Unknown";
  return <span aria-live="polite" className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

function ReviewThumbnail({ review }) {
  const [failed, setFailed] = useState(false);
  const isFood = review.reviewType === "FOOD";
  const imageUrl = review.itemImageUrl;
  if (!imageUrl || failed) return <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[#2B1B12]/10 bg-[#F7F2EC] text-[#D2552B]" role="img" aria-label={`${review.subjectName || "Review item"} image unavailable`}><UtensilsCrossed className="h-6 w-6" aria-hidden="true" /></div>;
  return <img src={imageUrl} alt={review.subjectName || (isFood ? "Dish" : "Event")} loading="lazy" onError={() => setFailed(true)} className="h-14 w-14 shrink-0 rounded-xl border border-[#2B1B12]/10 object-cover" />;
}

function ReviewBlock({ review }) {
  const [expanded, setExpanded] = useState(false);
  const comment = review.comment || "No written review was provided.";
  const canExpand = Boolean(review.comment && comment.length > 240);
  return <section className="min-w-0 rounded-xl bg-gray-50 p-4 sm:p-5" aria-label="Customer review">
    <h3 className="text-sm font-bold text-[#2B1B12]">Customer review</h3>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm font-semibold text-[#2B1B12]" title={review.customerName || "Customer"}>{review.customerName || "Customer"}</p>
      <StarRating rating={review.rating ?? 0} />
    </div>
    <p className="mt-1 text-xs text-[#2B1B12]/55">Reviewed {dateText(review.createdAt)}</p>
    <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#2B1B12]/80 ${canExpand && !expanded ? "line-clamp-4" : ""}`}>{review.comment ? `“${comment}”` : <span className="italic text-[#2B1B12]/50">{comment}</span>}</p>
    {canExpand && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{expanded ? "Read less" : "Read more"}</button>}
    <span className={`mt-3 inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${review.verifiedBadge === "VERIFIED_ORDER" ? "bg-emerald-50 text-emerald-800" : "bg-emerald-50 text-emerald-800"}`}><BadgeCheck className="h-4 w-4" aria-hidden="true" />{review.verifiedBadge === "ATTENDED_EVENT" ? "Attended event" : "Verified order"}</span>
  </section>;
}

function CookReportBlock({ item, review }) {
  return <section className="min-w-0 rounded-xl bg-gray-50 p-4 sm:p-5" aria-label="Cook report">
    <h3 className="text-sm font-bold text-[#2B1B12]">Cook’s report</h3>
    <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#2B1B12]"><ChefHat className="h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span className="truncate" title={review.cookName || "Cook"}>{review.cookName || "Cook"}</span></p>
    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#2B1B12]/55">Reason</p>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#2B1B12]/80">{item.reason || "No reason provided."}</p>
    {item.note && <><p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#2B1B12]/55">Cook’s note</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#2B1B12]/80">{item.note}</p></>}
    <p className="mt-3 flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><Clock3 className="h-4 w-4" aria-hidden="true" />Reported {dateText(item.createdAt)}</p>
    {review.cookReply && <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/70 p-3"><p className="text-xs font-bold text-amber-900">Cook’s reply{review.cookRepliedAt ? ` · ${dateText(review.cookRepliedAt)}` : ""}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-amber-950">{review.cookReply}</p></div>}
  </section>;
}

function ReportCard({ item, onAction }) {
  const review = item.review || {};
  const isFood = review.reviewType === "FOOD";
  const resolved = item.status !== "ACTIVE";
  const reference = isFood ? `Order #${review.orderNumber || item.reviewId}` : `Booking #${review.bookingNumber || review.bookingId || item.reviewId}`;
  return <article data-testid={`reported-review-${item.id}`} className="rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <ReviewThumbnail review={review} />
        <div className="min-w-0"><h2 className="truncate text-base font-extrabold text-[#2B1B12] sm:text-lg" title={review.subjectName || "TasteBridge experience"}>{review.subjectName || "TasteBridge experience"}</h2><p className="mt-1 truncate text-xs text-[#2B1B12]/55" title={reference}>{isFood ? "Food order" : "Event"} · {reference}</p></div>
      </div>
      <ReportStatusBadge status={item.status} />
    </header>
    <div className="my-4 border-t border-[#2B1B12]/10" />
    <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-6"><ReviewBlock review={review} /><CookReportBlock item={item} review={review} /></div>
    <footer className="mt-4 flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-5 text-[#2B1B12]/60">{resolved ? `Report ${item.status === "KEPT" ? "kept published" : "hidden"}${item.resolvedAt ? ` · ${dateText(item.resolvedAt)}` : ""}.` : "Decide whether to keep this review published or hide it from public view."}</p>
      {!resolved ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:gap-3">
        <button type="button" data-testid={`keep-btn-${item.id}`} onClick={() => onAction("KEEP", item)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:w-auto"><ThumbsUp className="h-4 w-4" aria-hidden="true" />Keep published</button>
        <button type="button" data-testid={`hide-btn-${item.id}`} onClick={() => onAction("HIDE", item)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#2B1B12]/20 bg-white px-4 text-sm font-bold text-[#2B1B12] transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:w-auto"><EyeOff className="h-4 w-4" aria-hidden="true" />Hide review</button>
      </div> : <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#2B1B12]/65"><span className={`rounded-full px-2.5 py-1 ${item.status === "KEPT" ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>{item.status === "KEPT" ? "Review remains published" : "Review hidden"}</span>{review.moderationReason && <span className="max-w-full truncate" title={review.moderationReason}>{review.moderationReason}</span>}</div>}
    </footer>
  </article>;
}

function StatCard({ label, value, helper, icon: Icon }) {
  return <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{label}</span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#D2552B]"><Icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{value}</p><p className="mt-2 text-[13px] text-gray-500">{helper}</p></article>;
}

function EmptyState({ filterStatus }) {
  const pending = filterStatus === "ACTIVE";
  const title = pending ? "Queue clear! No pending reports" : filterStatus === "HIDDEN" ? "No hidden reviews yet" : filterStatus === "KEPT" ? "No kept reviews yet" : "No reports found";
  const helper = pending ? "All flagged reviews have been reviewed and resolved." : "No reported reviews match this view.";
  return <section className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">{title}</h2><p className="mt-1 text-sm text-[#2B1B12]/60">{helper}</p></section>;
}

function ConfirmationDialog({ modalState, reasonDraft, setReasonDraft, actionError, submitting, reasonInputId, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  closeRef.current = onClose;
  submittingRef.current = submitting;
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll("button:not([disabled]), textarea:not([disabled])");
    focusable?.[0]?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !submittingRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); previousFocusRef.current?.focus?.(); };
  }, []);
  const hide = modalState.type === "HIDE";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B1B12]/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="moderation-modal-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><h2 id="moderation-modal-title" className="flex items-center gap-2 text-lg font-bold text-[#2B1B12]"><ShieldAlert className="h-5 w-5 text-[#D2552B]" />{hide ? "Hide review from public display" : "Keep review published"}</h2><p className="mt-1 text-sm leading-5 text-[#2B1B12]/65">{hide ? "Hiding this review removes it from public pages and rating calculations. A moderation reason is required." : "This dismisses the cook’s report and keeps the review publicly visible."}</p></div><button type="button" onClick={onClose} disabled={submitting} aria-label="Close dialog" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#2B1B12]/60 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-5 w-5" aria-hidden="true" /></button></div>
      {actionError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{actionError}</div>}
      <div className="space-y-1.5"><label htmlFor={reasonInputId} className="block text-sm font-bold text-[#2B1B12]">{hide ? <>Moderation reason <span className="text-amber-700">*</span> (5–500 characters)</> : <>Administrative note <span className="font-normal text-[#2B1B12]/50">(optional)</span></>}</label><textarea id={reasonInputId} rows={4} value={reasonDraft} onChange={(event) => setReasonDraft(event.target.value)} maxLength={500} placeholder={hide ? "Explain why this review should be hidden…" : "Notes on report dismissal…"} className="w-full rounded-xl border border-gray-300 p-3 text-sm text-[#2B1B12] outline-none focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100" /><div className="flex justify-between gap-3 text-xs text-gray-500"><span>{hide ? "Minimum 5 characters required" : "Recorded in moderation audit log"}</span><span>{reasonDraft.length}/500</span></div></div>
      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={onClose} disabled={submitting} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Cancel</button><button type="button" onClick={onSubmit} disabled={submitting || (hide && reasonDraft.trim().length < 5)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-50">{submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{hide ? "Confirm hide" : "Confirm keep published"}</button></div>
    </div>
  </div>;
}

export const AdminReviews = () => {
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [filterType, setFilterType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const currentKey = `${filterStatus}_${filterType}_${currentPage}_${refreshIndex}`;
  const [dataState, setDataState] = useState({ key: currentKey, items: [], total: 0, totalPages: 1, error: "" });
  const loading = dataState.key !== currentKey;
  const [modalState, setModalState] = useState(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reasonInputId = useId();

  useEffect(() => {
    let isCurrent = true;
    const queryParams = { page: currentPage, limit: 20, ...(filterStatus !== "ALL" ? { status: filterStatus } : {}), ...(filterType !== "ALL" ? { type: filterType } : {}) };
    reviewsApi.reportedForAdmin(queryParams).then((response) => {
      if (!isCurrent) return;
      const payload = unwrap(response);
      setDataState({ key: currentKey, items: Array.isArray(payload?.items) ? payload.items : [], total: payload?.pagination?.total ?? 0, totalPages: payload?.pagination?.totalPages ?? 1, error: "" });
    }).catch((requestError) => {
      if (!isCurrent) return;
      setDataState({ key: currentKey, items: [], total: 0, totalPages: 1, error: requestError?.response?.data?.message || requestError?.message || "Reported reviews could not be loaded." });
    });
    return () => { isCurrent = false; };
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
    if (type === "HIDE" && trimmed.length < 5) { setActionError("A reason of at least 5 characters is required when hiding a review."); return; }
    if (trimmed.length > 500) { setActionError("Moderation reason cannot exceed 500 characters."); return; }
    setSubmitting(true);
    setActionError("");
    try {
      const payload = unwrap(await reviewsApi.moderate(item.reviewId, { action: type, reason: trimmed || undefined }));
      if (!payload?.id) throw new Error("Server did not confirm moderation decision.");
      if (filterStatus === "ACTIVE") setDataState((current) => ({ ...current, items: current.items.filter((row) => row.reviewId !== item.reviewId), total: Math.max(0, current.total - 1) }));
      else setRefreshIndex((index) => index + 1);
      setModalState(null);
      setReasonDraft("");
    } catch (moderationError) {
      setActionError(moderationError?.response?.data?.message || moderationError?.message || "The moderation decision could not be saved.");
    } finally { setSubmitting(false); }
  };

  const filteredItems = dataState.items.filter((item) => {
    const review = item.review || {};
    const query = search.trim().toLowerCase();
    return !query || [review.cookName, review.customerName, review.subjectName, review.orderNumber, review.bookingNumber, review.bookingId]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
  const currentItems = dataState.items;
  const counts = {
    ACTIVE: filterStatus === "ACTIVE" ? dataState.total : currentItems.filter((item) => item.status === "ACTIVE").length,
    KEPT: filterStatus === "KEPT" ? dataState.total : currentItems.filter((item) => item.status === "KEPT").length,
    HIDDEN: filterStatus === "HIDDEN" ? dataState.total : currentItems.filter((item) => item.status === "HIDDEN").length,
    ALL: filterStatus === "ALL" ? dataState.total : currentItems.length,
  };
  const stats = [
    { label: "Pending reports", value: counts.ACTIVE, helper: "Waiting for review", icon: Clock3 },
    { label: "Kept published", value: currentItems.filter((item) => item.status === "KEPT").length, helper: "Reports dismissed", icon: BadgeCheck },
    { label: "Hidden", value: currentItems.filter((item) => item.status === "HIDDEN").length, helper: "Reviews removed from view", icon: EyeOff },
    { label: "Total reports", value: counts.ALL, helper: "Reported review records", icon: MessageSquareWarning },
  ];

  return <main className="space-y-6 pb-12" aria-label="Reported reviews">
    <h1 className="sr-only">Reported Reviews</h1>
    <section aria-label="Report overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && currentItems.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-16 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
    </section>

    <section className="space-y-4" aria-label="Report filters">
      <div className="flex min-w-0 items-center gap-3">
        <nav aria-label="Filter by report status" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto border-b border-[#2B1B12]/10 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group">{SHORT_STATUSES.map((tab) => <button key={tab.id} type="button" data-testid={tab.testId} onClick={() => { setFilterStatus(tab.id); setCurrentPage(1); }} aria-pressed={filterStatus === tab.id} className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-xl border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${filterStatus === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-[#2B1B12]/10 bg-white text-[#2B1B12]/70 hover:bg-orange-50"}`}>
          {tab.label}<span className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-extrabold ${filterStatus === tab.id ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"}`}>{counts[tab.id]}</span>
        </button>)}</nav>
        <div className="relative shrink-0"><button type="button" aria-label="How moderation works" aria-expanded={infoOpen} onClick={() => setInfoOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#2B1B12]/10 bg-white text-[#2B1B12]/65 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Info className="h-4 w-4" aria-hidden="true" /></button>{infoOpen && <div role="tooltip" className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-gray-200 bg-white p-3 text-sm leading-5 text-[#2B1B12]/75 shadow-lg">Review the report and customer feedback, then keep the review published or hide it from public view. Hiding requires a moderation reason.</div>}</div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by review type"><Filter className="h-4 w-4 text-[#2B1B12]/50" aria-hidden="true" />{TYPES.map((tab) => <button key={tab.id} type="button" data-testid={tab.testId} onClick={() => { setFilterType(tab.id); setCurrentPage(1); }} aria-pressed={filterType === tab.id} className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${filterType === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-[#2B1B12]/70 hover:bg-orange-50"}`}>{tab.label}</button>)}</div>
        <form onSubmit={(event) => event.preventDefault()} className="relative w-full md:max-w-[560px]"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input type="search" aria-label="Search reported reviews" placeholder="Search cook, customer, or item" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100" /></form>
      </div>
    </section>

    {dataState.error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>{dataState.error}</span><button type="button" onClick={() => setRefreshIndex((index) => index + 1)} className="inline-flex min-h-10 items-center rounded-lg border border-[#2B1B12]/20 bg-white px-3 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></div>}
    {loading ? <section aria-label="Loading reported reviews" className="space-y-5">{[1, 2, 3].map((index) => <article key={index} aria-hidden="true" className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex gap-3"><div className="h-14 w-14 rounded-xl bg-gray-100" /><div className="flex-1 space-y-2"><div className="h-5 w-1/3 rounded bg-gray-100" /><div className="h-4 w-1/2 rounded bg-gray-100" /></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="h-40 rounded-xl bg-gray-100" /><div className="h-40 rounded-xl bg-gray-100" /></div></article>)}</section>
      : !dataState.error && filteredItems.length === 0 ? <EmptyState filterStatus={filterStatus} />
        : !dataState.error && <section aria-label="Reported review list" aria-live="polite" className="space-y-5">{filteredItems.map((item) => <ReportCard key={item.id} item={item} onAction={openModal} />)}</section>}

    {!loading && !dataState.error && dataState.totalPages > 1 && <nav aria-label="Reported reviews pagination" className="flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-5 text-sm text-[#2B1B12]/65 sm:flex-row sm:items-center sm:justify-between"><span>Page {currentPage} of {dataState.totalPages}</span><div className="flex gap-2"><button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={currentPage >= dataState.totalPages} onClick={() => setCurrentPage((page) => page + 1)} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></nav>}

    {modalState && <ConfirmationDialog modalState={modalState} reasonDraft={reasonDraft} setReasonDraft={setReasonDraft} actionError={actionError} submitting={submitting} reasonInputId={reasonInputId} onClose={closeModal} onSubmit={submitModeration} />}
  </main>;
};

export default AdminReviews;
