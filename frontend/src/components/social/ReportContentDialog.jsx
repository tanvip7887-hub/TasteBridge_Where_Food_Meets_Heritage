import { useId, useState } from "react";
import { useSelector } from "react-redux";
import { AlertCircle, Flag, LoaderCircle, X } from "lucide-react";
import { reportSocialContent } from "../../api/socialApi.js";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";

export const ReportContentDialog = ({ targetType, targetId, onClose }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [reason, setReason] = useState("INAPPROPRIATE_CONTENT");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const explanationId = useId();
  const submit = async (event) => {
    event.preventDefault();
    if (!isAuthenticated) { window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT)); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      await reportSocialContent({ targetType, targetId, reason, explanation: explanation.trim() || undefined });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Your report could not be submitted. Please try again.");
    } finally { setBusy(false); }
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="social-report-title" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4">
    <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-3"><div><h2 id="social-report-title" className="flex items-center gap-2 text-lg font-bold text-[#2B1B12]"><Flag size={18} />Report {targetType.toLowerCase()}</h2><p className="mt-1 text-sm text-[#2B1B12]/65">Reports are reviewed by TasteBridge administrators.</p></div><button type="button" onClick={onClose} aria-label="Close report dialog" className="rounded-full p-2 hover:bg-orange-50"><X size={18} /></button></header>
      {submitted ? <div role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Thank you. Your report has been submitted for review.</div> : <>
        {!isAuthenticated && <p className="text-sm text-amber-800">Sign in to submit a report.</p>}
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle size={16} />{error}</p>}
        <label className="block text-sm font-semibold text-gray-800">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="INAPPROPRIATE_CONTENT">Inappropriate content</option><option value="HARASSMENT">Harassment</option><option value="SPAM">Spam</option><option value="MISLEADING_CONTENT">Misleading content</option><option value="OTHER">Other</option></select></label>
        <label htmlFor={explanationId} className="block text-sm font-semibold text-gray-800">Additional details (optional)<textarea id={explanationId} value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" placeholder="Add context for the review team" /><span className="text-xs font-normal text-gray-500">{explanation.length}/500</span></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#D2552B] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy && <LoaderCircle size={15} className="animate-spin" />}{isAuthenticated ? "Submit report" : "Sign in to report"}</button></div>
      </>}
    </form>
  </div>;
};
