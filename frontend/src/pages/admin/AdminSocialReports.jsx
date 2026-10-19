import { useEffect, useId, useState } from "react";
import { AlertCircle, Check, EyeOff, LoaderCircle, RefreshCw, ShieldAlert } from "lucide-react";
import adminApi from "../../api/adminApi.js";

const dataOf = (response) => response?.data?.data ?? response?.data ?? response;
const dateOf = (value) => value ? new Date(value).toLocaleString("en-IN") : "Date unavailable";
const reasonLabel = (value) => value?.replaceAll("_", " ").toLowerCase();

export const AdminSocialReports = () => {
  const [status, setStatus] = useState("PENDING");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState({ key: "", items: [], pagination: null, error: "" });
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonId = useId();
  const key = [status, targetType, page, refresh].join(":");
  const loading = result.key !== key;

  useEffect(() => {
    const controller = new AbortController();
    adminApi.getSocialReports({ status: status || undefined, targetType: targetType || undefined, page, limit: 20 }, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const data = dataOf(response);
        setResult({ key, items: data?.items || [], pagination: data?.pagination || null, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ key, items: [], pagination: null, error: error?.response?.data?.message || "Social reports could not be loaded." });
      });
    return () => controller.abort();
  }, [key, status, targetType, page]);

  const openAction = (report, actionType) => {
    setReason("");
    setActionError("");
    setAction({ report, actionType });
  };

  const submitAction = async () => {
    if (!action || reason.trim().length < 5 || saving) return;
    setSaving(true);
    setActionError("");
    try {
      await adminApi.moderateSocialReport(action.report.id, { action: action.actionType, reason: reason.trim() });
      setAction(null);
      setRefresh((current) => current + 1);
    } catch (error) {
      setActionError(error?.response?.data?.message || "The moderation action could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <main className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-700"><ShieldAlert size={15} />Admin moderation</p><h1 className="mt-1 text-2xl font-extrabold text-gray-900">Social content reports</h1><p className="mt-1 text-sm text-gray-600">Review reports on published Posts, active Stories, and comments.</p></div>
      <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
    </header>
    <section className="flex flex-wrap gap-3 rounded-xl border bg-white p-4">
      <label className="text-sm font-semibold">Status <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="ml-2 rounded-lg border px-3 py-2"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="REVIEWED">Reviewed</option><option value="DISMISSED">Dismissed</option><option value="ACTION_TAKEN">Action taken</option></select></label>
      <label className="text-sm font-semibold">Content <select value={targetType} onChange={(event) => { setTargetType(event.target.value); setPage(1); }} className="ml-2 rounded-lg border px-3 py-2"><option value="">All content</option><option value="POST">Posts</option><option value="STORY">Stories</option><option value="COMMENT">Comments</option></select></label>
    </section>
    {result.error && !loading && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mr-2 inline" size={17} />{result.error}<button type="button" onClick={() => setRefresh((value) => value + 1)} className="ml-2 font-bold underline">Retry</button></div>}
    {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 rounded-2xl border bg-white text-gray-600"><LoaderCircle className="animate-spin" />Loading reports…</div>
      : !result.error && result.items.length === 0 ? <div className="rounded-2xl border border-dashed bg-white p-12 text-center"><Check className="mx-auto text-emerald-600" size={30} /><h2 className="mt-3 font-bold">No reports found</h2><p className="mt-1 text-sm text-gray-600">Reports matching these filters will appear here.</p></div>
        : <section className="space-y-4">{result.items.map((report) => {
          const target = report.target || {};
          const pending = report.status === "PENDING";
          const preview = target.media?.[0]?.mediaUrl || target.mediaUrl;
          const isVideo = target.media?.[0]?.mediaType === "VIDEO" || target.mediaType === "VIDEO";
          return <article key={report.id} className="grid gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-[150px_1fr]">
            <div className="aspect-square overflow-hidden rounded-xl bg-gray-100">{preview && !isVideo ? <img src={preview} alt="Reported content" className="h-full w-full object-cover" /> : isVideo && preview ? <video src={preview} controls preload="metadata" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-gray-500">{report.targetType} report</div>}</div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{report.targetType}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold">{report.status}</span><span className="text-xs text-gray-500">{dateOf(report.createdAt)}</span></div>
              <h2 className="font-bold text-gray-900">{target.caption || target.text || target.post?.caption || "Content unavailable"}</h2>
              <p className="text-sm text-gray-700">Cook: <strong>{target.cook?.businessName || target.post?.cook?.businessName || "Unavailable"}</strong>{target.author?.name ? " · Author: " + target.author.name : ""}</p>
              <p className="text-sm"><span className="font-semibold">Reason:</span> {reasonLabel(report.reason)}{report.explanation ? " — " + report.explanation : ""}</p>
              <p className="text-xs text-gray-500">Reported by {report.reporter?.name || "Customer"} · {report.actions?.length || 0} moderation actions</p>
              {target.moderationHiddenAt && <p className="text-xs font-semibold text-rose-700">Content is hidden from public view.</p>}
              {report.actions?.length > 0 && <div className="space-y-1 border-t pt-2">{report.actions.map((entry) => <p key={entry.id} className="text-xs text-gray-600">{entry.action.replaceAll("_", " ")} by {entry.admin?.name || "Admin"} · {entry.reason} · {dateOf(entry.createdAt)}</p>)}</div>}
              {pending && <div className="flex flex-wrap gap-2 pt-2"><button type="button" onClick={() => openAction(report, "MARK_REVIEWED")} className="rounded-lg border px-3 py-2 text-sm font-semibold">Mark reviewed</button><button type="button" onClick={() => openAction(report, "DISMISS")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Dismiss</button><button type="button" onClick={() => openAction(report, "HIDE")} disabled={Boolean(target.moderationHiddenAt)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><EyeOff size={15} />Hide content</button></div>}
            </div>
          </article>;
        })}</section>}
    {result.pagination?.totalPages > 1 && <nav aria-label="Report pages" className="flex justify-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50">Previous</button><span className="py-2 text-sm">Page {page} of {result.pagination.totalPages}</span><button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50">Next</button></nav>}
    {action && <div role="dialog" aria-modal="true" aria-labelledby="social-moderation-title" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"><section className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><h2 id="social-moderation-title" className="text-lg font-bold">Confirm moderation action</h2><p className="text-sm text-gray-600">{action.actionType === "HIDE" ? "This content will be hidden from public feeds and interactions." : action.actionType === "DISMISS" ? "The report will be dismissed; content remains visible." : "Record that this report was reviewed; content remains visible."}</p>{actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}<label htmlFor={reasonId} className="block text-sm font-semibold">Reason (5–500 characters)<textarea id={reasonId} value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border p-3" /></label><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setAction(null)} className="rounded-lg border px-4 py-2">Cancel</button><button type="button" disabled={saving || reason.trim().length < 5} onClick={submitAction} className="rounded-lg bg-rose-600 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save action"}</button></div></section></div>}
  </main>;
};

export default AdminSocialReports;
