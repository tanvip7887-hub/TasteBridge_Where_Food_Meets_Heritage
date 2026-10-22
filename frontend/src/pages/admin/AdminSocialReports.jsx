import { useEffect, useId, useRef, useState } from "react";
import { BadgeCheck, CheckCircle2, ChefHat, Clock3, EyeOff, Flag, Info, LoaderCircle, MessageCircle, Search, ShieldCheck, X } from "lucide-react";
import adminApi from "../../api/adminApi.js";

const dataOf = (response) => response?.data?.data ?? response?.data ?? response;
const dateOf = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Date unavailable";
};
const reasonLabel = (value) => String(value || "Other").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const STATUS_TABS = [
  { id: "PENDING", label: "Pending" },
  { id: "REVIEWED", label: "Reviewed" },
  { id: "DISMISSED", label: "Dismissed" },
  { id: "ACTION_TAKEN", label: "Hidden" },
  { id: "", label: "All" },
];
const TYPE_TABS = [
  { id: "", label: "All content" },
  { id: "POST", label: "Posts" },
  { id: "STORY", label: "Stories" },
  { id: "COMMENT", label: "Comments" },
];

function ReportStatusBadge({ status }) {
  const style = status === "PENDING" ? "bg-amber-100 text-amber-900"
    : status === "REVIEWED" ? "bg-emerald-100 text-emerald-900"
      : status === "DISMISSED" ? "bg-gray-100 text-gray-700"
        : "border border-[#2B1B12]/20 bg-white text-[#2B1B12]";
  const label = status === "ACTION_TAKEN" ? "Hidden" : String(status || "UNKNOWN").replaceAll("_", " ");
  return <span aria-live="polite" className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

const contentText = (report) => {
  const target = report.target || {};
  return target.caption || target.text || target.post?.caption || "";
};
const contentMedia = (report) => {
  const target = report.target || {};
  const media = target.media?.[0];
  return { url: media?.mediaUrl || target.mediaUrl || "", type: media?.mediaType || target.mediaType || "" };
};
const isRemoved = (report) => !report.target || Boolean(report.target.deletedAt || report.target.moderationHiddenAt);

function ContentPreview({ report }) {
  const [failed, setFailed] = useState(false);
  const media = contentMedia(report);
  const text = contentText(report);
  if (isRemoved(report)) return <div className="grid aspect-[16/9] max-h-[180px] w-full shrink-0 place-content-center justify-items-center gap-2 rounded-xl bg-gray-100 p-4 text-center text-[13px] text-[#2B1B12]/55 sm:aspect-[4/3] sm:h-[120px] sm:max-h-none sm:w-[160px]"><EyeOff className="h-6 w-6" aria-hidden="true" /><span>Content removed</span></div>;
  if (media.url && !failed) return media.type === "VIDEO"
    ? <video src={media.url} controls preload="metadata" aria-label={`${report.targetType} report preview`} className="aspect-[16/9] max-h-[180px] w-full shrink-0 rounded-xl bg-gray-100 object-cover sm:aspect-[4/3] sm:h-[120px] sm:max-h-none sm:w-[160px]" />
    : <img src={media.url} alt={`${report.targetType} content: ${text || "reported content"}`} loading="lazy" onError={() => setFailed(true)} className="aspect-[16/9] max-h-[180px] w-full shrink-0 rounded-xl bg-gray-100 object-cover sm:aspect-[4/3] sm:h-[120px] sm:max-h-none sm:w-[160px]" />;
  return <div className="flex aspect-[16/9] max-h-[180px] w-full shrink-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-gray-100 p-4 text-center sm:aspect-[4/3] sm:h-[120px] sm:max-h-none sm:w-[160px]"><MessageCircle className="h-6 w-6 shrink-0 text-[#2B1B12]/45" aria-hidden="true" /><p className="line-clamp-3 break-words text-sm leading-5 text-[#2B1B12]/65">{text || "Content no longer available"}</p></div>;
}

function Detail({ icon: Icon, label, children, className = "" }) {
  return <div className={`min-w-0 ${className}`}><dt className="flex items-center gap-1.5 text-xs font-medium text-[#2B1B12]/55"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}</dt><dd className="mt-1 min-w-0 text-sm leading-5 text-[#2B1B12]">{children}</dd></div>;
}

function ReportCard({ report, onAction, onView }) {
  const [expanded, setExpanded] = useState(false);
  const target = report.target || {};
  const text = contentText(report);
  const cookName = target.cook?.businessName || target.post?.cook?.businessName || "Unknown cook";
  const reporter = report.reporter?.name || "Unknown reporter";
  const actionCount = report.actions?.length || 0;
  const pending = report.status === "PENDING";
  const resolvedAction = report.actions?.at(-1);
  const canReadMore = text.length > 180;
  const typeLabel = String(report.targetType || "CONTENT").toUpperCase();

  return <article className="rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">{typeLabel}</span>
        <ReportStatusBadge status={report.status} />
        <span className="inline-flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><Clock3 className="h-4 w-4" aria-hidden="true" />{dateOf(report.createdAt)}</span>
      </div>
      {report.target && <button type="button" onClick={() => onView(report)} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-[#2B1B12]/20 bg-white px-4 text-sm font-semibold text-[#2B1B12] transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:w-auto">View content</button>}
    </header>
    <div className="my-4 border-t border-[#2B1B12]/10" />
    <div className="flex min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:gap-5">
      <ContentPreview report={report} />
      <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail icon={MessageCircle} label="Content"><p className={`break-words text-[#2B1B12]/80 ${canReadMore && !expanded ? "line-clamp-2" : ""}`}>{text || <span className="text-[#2B1B12]/50">Content no longer available</span>}</p>{canReadMore && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-1 inline-flex min-h-9 items-center font-semibold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{expanded ? "Read less" : "Read more"}</button>}</Detail>
        <Detail icon={ChefHat} label="Cook">{cookName}</Detail>
        <Detail icon={Flag} label="Reason"><span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">{reasonLabel(report.reason)}</span>{report.explanation && <p className="mt-1 break-words text-xs leading-5 text-[#2B1B12]/60">{report.explanation}</p>}</Detail>
        <Detail icon={BadgeCheck} label="Reported by">{reporter}</Detail>
        <Detail icon={ShieldCheck} label="Moderation history" className="sm:col-span-2"><span className="text-[#2B1B12]/60">{actionCount} previous moderation {actionCount === 1 ? "action" : "actions"}</span>{report.actions?.length > 0 && <div className="mt-2 space-y-1">{report.actions.map((entry) => <p key={entry.id} className="break-words text-xs leading-5 text-[#2B1B12]/60">{String(entry.action || "Action").replaceAll("_", " ")} by {entry.admin?.name || "Admin"} · {dateOf(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ""}</p>)}</div>}</Detail>
      </dl>
    </div>
    <footer className="mt-4 flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-5 text-[#2B1B12]/60">{pending ? "Review the content, then take an action." : `${report.status === "ACTION_TAKEN" ? "Content hidden" : report.status === "DISMISSED" ? "Report dismissed" : "Report reviewed"}${resolvedAction?.createdAt ? ` · ${dateOf(resolvedAction.createdAt)}` : ""}.`}</p>
      {pending ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
        <button type="button" onClick={() => onAction(report, "HIDE")} disabled={Boolean(target.moderationHiddenAt)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><EyeOff className="h-4 w-4" aria-hidden="true" />Hide content</button>
        <button type="button" onClick={() => onAction(report, "MARK_REVIEWED")} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#2B1B12]/20 bg-white px-4 text-sm font-semibold text-[#2B1B12] transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:w-auto">Mark reviewed</button>
        <button type="button" onClick={() => onAction(report, "DISMISS")} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-[#2B1B12]/60 transition hover:bg-gray-50 hover:text-[#2B1B12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:w-auto">Dismiss</button>
      </div> : <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#2B1B12]/65"><span className={`rounded-full px-2.5 py-1 ${report.status === "REVIEWED" ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>{resolvedAction?.action ? String(resolvedAction.action).replaceAll("_", " ") : report.status.replaceAll("_", " ")}</span></div>}
    </footer>
  </article>;
}

function ReportPreviewDialog({ report, onClose }) {
  const target = report.target || {};
  const media = contentMedia(report);
  const text = contentText(report);
  const heading = `${report.targetType} content preview`;
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.querySelector("button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") {
        const buttons = dialogRef.current?.querySelectorAll("button");
        if (buttons?.length && event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        else if (buttons?.length && !event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus?.(); };
  }, []);
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#2B1B12]/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="content-preview-title" className="w-full max-w-2xl space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 id="content-preview-title" className="text-lg font-bold text-[#2B1B12]">{heading}</h2><p className="mt-1 text-sm text-[#2B1B12]/55">{target.cook?.businessName || target.post?.cook?.businessName || "Unknown cook"}</p></div><button type="button" onClick={onClose} aria-label="Close content preview" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#2B1B12]/60 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-5 w-5" aria-hidden="true" /></button></div>{isRemoved(report) ? <div className="grid min-h-48 place-content-center justify-items-center gap-2 rounded-xl bg-gray-100 text-sm text-[#2B1B12]/55"><EyeOff className="h-7 w-7" aria-hidden="true" />Content removed</div> : media.url ? media.type === "VIDEO" ? <video src={media.url} controls preload="metadata" className="max-h-[65vh] w-full rounded-xl bg-gray-100 object-contain" /> : <img src={media.url} alt={heading} className="max-h-[65vh] w-full rounded-xl bg-gray-100 object-contain" /> : <div className="flex min-h-40 items-center gap-3 rounded-xl bg-gray-50 p-5 text-sm leading-6 text-[#2B1B12]/70"><MessageCircle className="h-6 w-6 shrink-0" aria-hidden="true" />{text || "Content no longer available"}</div>}{text && <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-gray-50 p-4 text-sm leading-6 text-[#2B1B12]/80">{text}</p>}<div className="flex justify-end border-t border-gray-100 pt-3"><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-xl border border-[#2B1B12]/20 px-4 text-sm font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Close</button></div></section></div>;
}

function StatCard({ label, value, helper, icon: Icon }) {
  return <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{label}</span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#D2552B]"><Icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{value}</p><p className="mt-2 text-[13px] text-gray-500">{helper}</p></article>;
}

export const AdminSocialReports = () => {
  const [status, setStatus] = useState("PENDING");
  const [targetType, setTargetType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ key: "", items: [], pagination: null, error: "" });
  const [action, setAction] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState("");
  const reasonId = useId();
  const key = [status, targetType, page, refresh].join(":");
  const loading = result.key !== key;
  const toastTimerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    adminApi.getSocialReports({ status: status || undefined, targetType: targetType || undefined, page, limit: 20 }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = dataOf(response);
        setResult({ key, items: Array.isArray(data?.items) ? data.items : [], pagination: data?.pagination || null, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key, items: [], pagination: null, error: error?.response?.data?.message || "Social reports could not be loaded." });
      });
    return () => controller.abort();
  }, [key, status, targetType, page]);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);
  const openAction = (report, actionType) => { setReason(""); setActionError(""); setAction({ report, actionType }); };
  const closeAction = () => { if (saving) return; setAction(null); setReason(""); setActionError(""); };
  const submitAction = async () => {
    if (!action || reason.trim().length < 5 || saving) return;
    setSaving(true);
    setActionError("");
    try {
      await adminApi.moderateSocialReport(action.report.id, { action: action.actionType, reason: reason.trim() });
      setAction(null);
      setReason("");
      setRefresh((current) => current + 1);
      setToast(action.actionType === "HIDE" ? "Content hidden." : action.actionType === "DISMISS" ? "Report dismissed." : "Report marked reviewed.");
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToast(""), 3200);
    } catch (error) { setActionError(error?.response?.data?.message || "The moderation action could not be saved."); }
    finally { setSaving(false); }
  };

  const query = search.trim().toLowerCase();
  const filteredItems = result.items.filter((report) => {
    const target = report.target || {};
    const values = [report.reporter?.name, report.reason, report.explanation, target.cook?.businessName, target.post?.cook?.businessName];
    return !query || values.some((value) => String(value || "").toLowerCase().includes(query));
  });
  const statusCounts = Object.fromEntries(STATUS_TABS.map((tab) => [tab.id || "ALL", tab.id && result.items.some((report) => report.status === tab.id) ? (status === tab.id ? result.pagination?.total ?? result.items.length : result.items.filter((report) => report.status === tab.id).length) : tab.id ? result.items.filter((report) => report.status === tab.id).length : status === "" ? result.pagination?.total ?? result.items.length : result.items.length]));
  const stats = [
    { label: "Pending", value: result.items.filter((report) => report.status === "PENDING").length, helper: "Awaiting review", icon: Clock3 },
    { label: "Reviewed", value: result.items.filter((report) => report.status === "REVIEWED").length, helper: "Marked reviewed", icon: BadgeCheck },
    { label: "Dismissed", value: result.items.filter((report) => report.status === "DISMISSED").length, helper: "Reports dismissed", icon: CheckCircle2 },
    { label: "Content hidden", value: result.items.filter((report) => report.status === "ACTION_TAKEN").length, helper: "Hidden from public view", icon: EyeOff },
  ];

  return <main className="space-y-6 pb-12" aria-label="Social content reports">
    <h1 className="sr-only">Social content reports</h1>
    <section aria-label="Report overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && result.items.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-14 rounded bg-gray-100" /><div className="mt-3 h-3 w-32 rounded bg-gray-100" /></div>) : stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
    </section>

    <section className="space-y-4" aria-label="Report filters">
      <div className="flex min-w-0 items-center gap-3">
        <nav aria-label="Filter by report status" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto border-b border-[#2B1B12]/10 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{STATUS_TABS.map((tab) => { const tabKey = tab.id || "ALL"; return <button key={tabKey} type="button" onClick={() => { setStatus(tab.id); setPage(1); }} aria-pressed={status === tab.id} className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${status === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-[#2B1B12]/10 bg-white text-[#2B1B12]/70 hover:bg-orange-50"}`}>{tab.label}<span className={`rounded-full px-1.5 py-0.5 text-xs font-extrabold ${status === tab.id ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"}`}>{statusCounts[tabKey] || 0}</span></button>; })}</nav>
        <div className="relative shrink-0"><button type="button" aria-label="How moderation works" aria-expanded={infoOpen} onClick={() => setInfoOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#2B1B12]/10 bg-white text-[#2B1B12]/65 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Info className="h-4 w-4" aria-hidden="true" /></button>{infoOpen && <p role="tooltip" className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-gray-200 bg-white p-3 text-sm leading-5 text-[#2B1B12]/75 shadow-lg">Review the report and content, then mark reviewed, dismiss it, or hide the content. Each decision is recorded in moderation history.</p>}</div>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by content type">{TYPE_TABS.map((tab) => <button key={tab.id || "ALL"} type="button" onClick={() => { setTargetType(tab.id); setPage(1); }} aria-pressed={targetType === tab.id} className={`inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${targetType === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-[#2B1B12]/70 hover:bg-orange-50"}`}>{tab.label}</button>)}</div>
        <form onSubmit={(event) => event.preventDefault()} className="relative w-full md:max-w-[560px]"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search reporter, reason, or cook" placeholder="Search reporter, reason, or cook" className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100" /></form>
      </div>
    </section>

    {result.error && !loading && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span>{result.error}</span><button type="button" onClick={() => setRefresh((value) => value + 1)} className="inline-flex min-h-10 items-center rounded-lg border border-[#2B1B12]/20 bg-white px-3 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></div>}
    {loading ? <section aria-label="Loading reports" className="space-y-5">{[1, 2, 3].map((index) => <article key={index} aria-hidden="true" className="animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex gap-3"><div className="h-14 w-14 rounded-xl bg-gray-100" /><div className="flex-1 space-y-2"><div className="h-5 w-1/3 rounded bg-gray-100" /><div className="h-4 w-1/2 rounded bg-gray-100" /></div></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="h-40 rounded-xl bg-gray-100" /><div className="h-40 rounded-xl bg-gray-100" /></div></article>)}</section>
      : !result.error && filteredItems.length === 0 ? <section className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-8 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">{status === "PENDING" ? "No pending reports" : status === "ACTION_TAKEN" ? "No hidden reports yet" : status === "DISMISSED" ? "No dismissed reports yet" : status === "REVIEWED" ? "No reviewed reports yet" : "No reports found"}</h2><p className="mt-1 text-sm text-[#2B1B12]/60">{status === "PENDING" ? "All reported content has been reviewed." : "No reports match these filters."}</p></section>
        : !result.error && <section aria-label="Social content reports" aria-live="polite" className="space-y-5">{filteredItems.map((report) => <ReportCard key={report.id} report={report} onAction={openAction} onView={setPreviewReport} />)}</section>}

    {!loading && !result.error && result.pagination?.totalPages > 1 && <nav aria-label="Report pages" className="flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-5 text-sm text-[#2B1B12]/65 sm:flex-row sm:items-center sm:justify-between"><span>Page {page} of {result.pagination.totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></nav>}

    {action && <SocialModerationDialog action={action} reason={reason} setReason={setReason} reasonId={reasonId} actionError={actionError} saving={saving} onClose={closeAction} onSubmit={submitAction} />}
    {previewReport && <ReportPreviewDialog report={previewReport} onClose={() => setPreviewReport(null)} />}
    {toast && <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[130] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-lg">{toast}</div>}
  </main>;
};

function SocialModerationDialog({ action, reason, setReason, reasonId, actionError, saving, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);
  closeRef.current = onClose;
  savingRef.current = saving;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const focusable = dialogRef.current?.querySelectorAll("button:not([disabled]), textarea:not([disabled])");
    focusable?.[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !savingRef.current) { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab" && focusable?.length) {
        if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) { event.preventDefault(); focusable[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus?.focus?.(); };
  }, []);
  const hide = action.actionType === "HIDE";
  const actionName = hide ? "Hide content" : action.actionType === "DISMISS" ? "Dismiss report" : "Mark report reviewed";
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#2B1B12]/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="social-moderation-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 id="social-moderation-title" className="text-lg font-bold text-[#2B1B12]">Confirm {actionName.toLowerCase()}</h2><p className="mt-1 text-sm leading-5 text-[#2B1B12]/65">{hide ? "This content will be hidden from public feeds and interactions." : action.actionType === "DISMISS" ? "The report will be dismissed; content remains visible." : "Record that this report was reviewed; content remains visible."}</p></div><button type="button" disabled={saving} onClick={onClose} aria-label="Close dialog" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#2B1B12]/60 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-5 w-5" aria-hidden="true" /></button></div>{actionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{actionError}</p>}<label htmlFor={reasonId} className="block space-y-1.5 text-sm font-semibold text-[#2B1B12]">Reason (5–500 characters)<textarea id={reasonId} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} rows={4} className="w-full rounded-xl border border-gray-300 p-3 font-normal text-[#2B1B12] outline-none focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100" /><span className="flex justify-between gap-3 text-xs font-normal text-gray-500"><span>Minimum 5 characters required</span><span>{reason.length}/500</span></span></label><div className="flex justify-end gap-3 border-t border-gray-100 pt-4"><button type="button" disabled={saving} onClick={onClose} className="inline-flex min-h-11 items-center rounded-xl border border-[#2B1B12]/20 px-4 text-sm font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Cancel</button><button type="button" disabled={saving || reason.trim().length < 5} onClick={onSubmit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-50">{saving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}{saving ? "Saving…" : "Confirm"}</button></div></section></div>;
}

export default AdminSocialReports;
