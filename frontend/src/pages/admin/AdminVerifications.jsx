import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../../api/adminApi.js";
import DocumentPreviewButton from "../../components/admin/DocumentPreviewButton.jsx";
import {
  Check, CheckCircle, ChefHat, CircleHelp, FileCheck, FileText, Search, Truck, X,
} from "lucide-react";

const formatDate = (value) => value
  ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  : "Date not available";

const displayName = (doc) => ({
  AADHAAR: "Aadhaar card",
  AADHAAR_CARD: "Aadhaar card",
  PAN: "PAN card",
  PAN_CARD: "PAN card",
  FSSAI_LICENSE: "FSSAI license",
  DRIVING_LICENSE: "Driving license",
  VEHICLE_RC: "Vehicle registration",
  PROFILE_PHOTO: "Profile photo",
}[doc?.documentType] || String(doc?.documentType || "Verification document").replaceAll("_", " ").toLowerCase().replace(/^./, (char) => char.toUpperCase()));

const applicantDocuments = (applicant, pendingDocuments) => {
  const userDocs = applicant.user?.verificationDocuments || [];
  const pendingForUser = pendingDocuments.filter((doc) => doc.userId === applicant.userId);
  const unique = new Map();
  [...userDocs, ...pendingForUser].forEach((doc) => unique.set(doc.id, doc));
  return [...unique.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

function StatusBadge({ status }) {
  const normalized = String(status || "PENDING").toUpperCase();
  const style = normalized === "APPROVED"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : normalized === "REJECTED"
      ? "bg-gray-100 text-gray-700 border-gray-200"
      : "bg-amber-50 text-amber-800 border-amber-200";
  const label = normalized === "NEEDS_REVISION" ? "Needs revision" : normalized === "PENDING" ? "Pending review" : normalized[0] + normalized.slice(1).toLowerCase();
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>;
}

function DocumentTile({ document, onDecision }) {
  const isPending = document.verificationStatus === "PENDING";
  return (
    <li className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D9532B]">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#342116]" title={displayName(document)}>{displayName(document)}</p>
          <p className="mt-1 text-xs text-gray-500">Submitted {formatDate(document.createdAt)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={document.verificationStatus} />
            {document.rejectionReason && <span className="line-clamp-1 text-xs text-gray-500" title={document.rejectionReason}>{document.rejectionReason}</span>}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
        <DocumentPreviewButton document={document} label="View" />
        {isPending && <>
          <button type="button" onClick={() => onDecision(document, "APPROVED")} className="min-h-11 rounded-xl bg-[#D9532B] px-3 text-xs font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Approve</button>
          <button type="button" onClick={() => onDecision(document, "NEEDS_REVISION")} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-xs font-semibold text-[#523D31] transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Request revision</button>
          <button type="button" onClick={() => onDecision(document, "REJECTED")} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-xs font-semibold text-[#523D31] transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Reject</button>
        </>}
      </div>
    </li>
  );
}

function VerificationCard({ applicant, documents, onDecision, onProfileDecision }) {
  const user = applicant.user || {};
  const name = user.name || applicant.businessName || "Unnamed applicant";
  const city = applicant.kind === "cook" ? [applicant.locality, applicant.city].filter(Boolean).join(", ") : "";
  const avatar = applicant.kind === "cook" ? applicant.profileImage : null;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const pendingCount = documents.filter((doc) => doc.verificationStatus === "PENDING").length;
  const profilePending = applicant.verificationStatus === "PENDING";

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ? <img src={avatar} alt={`${name} profile`} loading="lazy" className="h-12 w-12 shrink-0 rounded-full border border-gray-200 object-cover" /> : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#D9532B]" aria-label={`${name} initials`}>{initials}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-[#342116]" title={name}>{name}</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{applicant.kind === "cook" ? "Cook" : "Delivery agent"}</span>
            </div>
            <p className="mt-1 truncate text-sm text-gray-500" title={[user.email, user.phone, city].filter(Boolean).join(" · ")}>{[user.email, user.phone, city].filter(Boolean).join(" · ") || "Contact details not available"}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:items-end">
          <StatusBadge status={applicant.verificationStatus} />
          <span className="text-xs text-gray-500">Applied on {formatDate(applicant.createdAt)}</span>
        </div>
      </header>

      <div className="my-4 border-t border-gray-200" />
      <section aria-label={`${name} documents`}>
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <FileCheck className="h-4 w-4" aria-hidden="true" />
          <span>Documents</span><span className="normal-case tracking-normal">· {documents.length} {documents.length === 1 ? "document" : "documents"}</span>
        </div>
        {documents.length ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {documents.map((doc) => <DocumentTile key={doc.id} document={doc} onDecision={onDecision} />)}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-sm text-gray-500">No documents uploaded yet</div>
        )}
      </section>

      <footer className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500">{pendingCount ? "Check all documents before approving." : "Review the applicant details before making a decision."}</p>
        {profilePending && <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          <button type="button" onClick={() => onProfileDecision(applicant, "APPROVED")} className="min-h-11 rounded-xl bg-[#D9532B] px-4 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Approve application</button>
          <button type="button" onClick={() => onProfileDecision(applicant, "REJECTED")} className="min-h-11 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-[#523D31] transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Reject</button>
        </div>}
      </footer>
    </article>
  );
}

function SkeletonCard() {
  return <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-6"><div className="flex items-center gap-3"><div className="h-12 w-12 rounded-full bg-gray-200" /><div className="flex-1 space-y-2"><div className="h-4 w-1/3 rounded bg-gray-200" /><div className="h-3 w-1/2 rounded bg-gray-100" /></div></div><div className="mt-5 h-24 rounded-xl bg-gray-100" /></div>;
}

export const AdminVerifications = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedApplicant, setSelectedApplicant] = useState(null);
  const [decisionType, setDecisionType] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [fssaiExpiryDate, setFssaiExpiryDate] = useState("");
  const [toast, setToast] = useState("");
  const dialogRef = useRef(null);
  const returnFocusRef = useRef(null);
  const activeType = ["cook", "delivery"].includes(searchParams.get("type")) ? searchParams.get("type") : "all";

  const fetchVerifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getPendingVerifications();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load verification center.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchVerifications(true); }, [fetchVerifications]);
  useEffect(() => {
    if (!selectedDoc && !selectedApplicant) { returnFocusRef.current?.focus(); return; }
    const dialog = dialogRef.current;
    const focusable = () => dialog?.querySelectorAll('button:not([disabled]), textarea:not([disabled]), input:not([disabled])') || [];
    focusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !actionLoading) { setSelectedDoc(null); setSelectedApplicant(null); return; }
      if (event.key !== "Tab") return;
      const items = [...focusable()];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDoc, selectedApplicant, actionLoading]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const { pendingCooks = [], pendingAgents = [], pendingDocuments = [] } = data || {};
  const applicants = useMemo(() => {
    const profiles = [
      ...pendingCooks.map((profile) => ({ ...profile, kind: "cook", userId: profile.userId })),
      ...pendingAgents.map((profile) => ({ ...profile, kind: "delivery", userId: profile.userId })),
    ];
    const known = new Set(profiles.map((profile) => profile.userId));
    pendingDocuments.forEach((doc) => {
      if (known.has(doc.userId)) return;
      profiles.push({ id: `document-user-${doc.userId}`, userId: doc.userId, kind: doc.user?.role === "COOK" ? "cook" : "delivery", verificationStatus: "PENDING", createdAt: doc.createdAt, user: doc.user });
      known.add(doc.userId);
    });
    return profiles.map((profile) => ({ ...profile, documents: applicantDocuments(profile, pendingDocuments) }));
  }, [pendingCooks, pendingAgents, pendingDocuments]);
  const filteredApplicants = useMemo(() => applicants.filter((applicant) => {
    if (activeType === "cook" && applicant.kind !== "cook") return false;
    if (activeType === "delivery" && applicant.kind !== "delivery") return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    const haystack = [applicant.user?.name, applicant.businessName, applicant.user?.email, applicant.user?.phone, applicant.city, applicant.locality].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  }), [applicants, activeType, search]);
  const counts = { all: applicants.length, cook: pendingCooks.length, delivery: pendingAgents.length };

  const setTab = (type) => {
    const next = new URLSearchParams(searchParams);
    if (type === "all") next.delete("type");
    else next.set("type", type);
    setSearchParams(next, { replace: true });
  };
  const openDecisionModal = (doc, type, applicant = null) => {
    returnFocusRef.current = document.activeElement;
    setSelectedDoc(doc);
    setSelectedApplicant(applicant);
    setDecisionType(type);
    setRejectionReason("");
    setFssaiExpiryDate("");
  };
  const openProfileDecision = (applicant, type) => openDecisionModal(null, type, applicant);

  const handleConfirmDecision = async (event) => {
    event.preventDefault();
    if (decisionType !== "APPROVED" && !rejectionReason.trim()) return;
    if (selectedDoc?.documentType === "FSSAI_LICENSE" && decisionType === "APPROVED" && !fssaiExpiryDate) return;
    try {
      setActionLoading(true);
      if (selectedApplicant) {
        const body = {
          verificationStatus: decisionType,
          rejectionReason: decisionType === "REJECTED" ? rejectionReason.trim() : undefined,
          revisionReason: decisionType === "NEEDS_REVISION" ? rejectionReason.trim() : undefined,
        };
        if (selectedApplicant.kind === "cook") await adminApi.updateCookVerification(selectedApplicant.id, body);
        else await adminApi.updateDeliveryAgentVerification(selectedApplicant.id, { verificationStatus: decisionType });
      } else {
        const fssaiCookId = selectedDoc.documentType === "FSSAI_LICENSE" && selectedDoc.user?.cookProfile?.id;
        if (fssaiCookId) {
          await adminApi.reviewCookFssai(fssaiCookId, {
            action: decisionType === "APPROVED" ? "APPROVE" : decisionType === "REJECTED" ? "REJECT" : "REQUEST_NEW_DOCUMENT",
            documentId: selectedDoc.id,
            rejectionReason: rejectionReason.trim() || undefined,
            fssaiExpiryDate: decisionType === "APPROVED" ? fssaiExpiryDate : undefined,
          });
        } else {
          await adminApi.updateDocumentVerification(selectedDoc.id, {
            verificationStatus: decisionType,
            rejectionReason: rejectionReason.trim() || undefined,
          });
          if (selectedDoc.user?.role === "COOK") {
            const cook = pendingCooks.find((profile) => profile.userId === selectedDoc.userId);
            if (cook) await adminApi.updateCookVerification(cook.id, { verificationStatus: decisionType, rejectionReason: rejectionReason.trim() || undefined });
          } else if (selectedDoc.user?.role === "DELIVERY_AGENT") {
            const agent = pendingAgents.find((profile) => profile.userId === selectedDoc.userId);
            if (agent) await adminApi.updateDeliveryAgentVerification(agent.id, { verificationStatus: decisionType, rejectionReason: rejectionReason.trim() || undefined });
          }
        }
      }
      setSelectedDoc(null);
      setSelectedApplicant(null);
      setDecisionType(null);
      setRejectionReason("");
      setToast(decisionType === "APPROVED" ? "Verification approved." : decisionType === "REJECTED" ? "Verification rejected." : "Revision requested.");
      await fetchVerifications();
    } catch (err) {
      setError(err.message || "Unable to update verification.");
    } finally {
      setActionLoading(false);
    }
  };

  const statCards = [
    { label: "Pending Cooks", value: pendingCooks.length, helper: "Waiting for approval", Icon: ChefHat, type: "cook" },
    { label: "Pending Delivery Agents", value: pendingAgents.length, helper: "Waiting for approval", Icon: Truck, type: "delivery" },
    { label: "Documents to Review", value: pendingDocuments.length, helper: "Awaiting your review", Icon: FileText, type: "all" },
  ];

  return (
    <main className="space-y-6 pb-10 pt-6" aria-live="polite">
      <h1 className="sr-only">Verification Center</h1>
      <section aria-label="Verification overview" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map(({ label, value, helper, Icon, type }) => (
          <button key={label} type="button" onClick={() => setTab(type)} className="min-h-36 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">
            <div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-[#654F42]">{label}</span><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#D9532B]"><Icon className="h-5 w-5" aria-hidden="true" /></span></div>
            <div className="mt-3 text-3xl font-bold text-[#342116]">{value}</div>
            <p className="mt-1 text-sm text-gray-500">{helper}</p>
          </button>
        ))}
      </section>

      <section aria-label="Applicant filters" className="space-y-4">
        <div className="flex items-center gap-3 overflow-x-auto border-b border-gray-200 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ id: "all", label: "All", count: counts.all }, { id: "cook", label: "Cooks", count: counts.cook }, { id: "delivery", label: "Delivery Agents", count: counts.delivery }].map((tab) => (
            <button key={tab.id} type="button" onClick={() => setTab(tab.id)} aria-current={activeType === tab.id ? "page" : undefined} className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${activeType === tab.id ? "border-[#D9532B] bg-[#D9532B] text-white" : "border-gray-200 bg-white text-[#523D31] hover:bg-gray-50"}`}>
              {tab.label}<span className={`rounded-full px-2 py-0.5 text-xs ${activeType === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>{tab.count}</span>
            </button>
          ))}
          <span className="ml-auto shrink-0" title="Review applicant details and documents before approving a verification request."><CircleHelp className="h-5 w-5 text-gray-500" aria-label="About verification" /></span>
        </div>
        <label className="relative block w-full md:max-w-xl">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search name, email, or phone" className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 text-sm text-[#342116] placeholder:text-gray-400 focus:border-[#D9532B] focus:outline-none focus:ring-2 focus:ring-orange-100" aria-label="Search applicants" />
        </label>
      </section>

      <section aria-label="Pending verifications" className="space-y-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-[#342116]">Pending verifications</h2><span className="text-sm text-gray-500">{filteredApplicants.length} pending</span></div>
        {error && <div role="alert" className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-[#523D31]">{error} <button type="button" onClick={() => void fetchVerifications(true)} className="ml-2 font-semibold text-[#D9532B] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Try again</button></div>}
        {loading ? <div className="space-y-4">{[0, 1, 2].map((item) => <SkeletonCard key={item} />)}</div> : filteredApplicants.length ? (
          <div className="space-y-5">
            {filteredApplicants.map((applicant) => <VerificationCard key={`${applicant.kind}-${applicant.id}`} applicant={applicant} documents={applicant.documents} onDecision={openDecisionModal} onProfileDecision={openProfileDecision} />)}
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-6 w-6" aria-hidden="true" /></span>
            <h3 className="text-base font-semibold text-[#342116]">{search ? "No matching applicants" : activeType === "delivery" ? "No pending delivery agents" : activeType === "cook" ? "No pending cooks" : "Verification queue clear!"}</h3>
            <p className="mt-1 text-sm text-gray-500">{search ? "Try a different name, email, or phone number." : "No pending verification requests at this time."}</p>
          </div>
        )}
      </section>

      {toast && <div role="status" className="fixed bottom-5 right-5 z-40 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"><CheckCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{toast}</div>}

      {(selectedDoc || selectedApplicant) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionLoading) { setSelectedDoc(null); setSelectedApplicant(null); } }}>
          <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title" onSubmit={handleConfirmDecision} className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <h2 id="verification-dialog-title" className="text-lg font-semibold text-[#342116]">{decisionType === "APPROVED" ? `Confirm ${selectedApplicant ? "application" : "document"} approval` : decisionType === "REJECTED" ? `Reject ${selectedApplicant ? "application" : "document"}` : "Request document revision"}</h2>
              <button type="button" aria-label="Close" disabled={actionLoading} onClick={() => { setSelectedDoc(null); setSelectedApplicant(null); }} className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              <p>Applicant: <strong className="text-[#342116]">{selectedApplicant?.user?.name || selectedDoc?.user?.name || "Applicant"}</strong></p>
              {selectedDoc && <p>Document: <strong className="text-[#342116]">{displayName(selectedDoc)}</strong></p>}
              {selectedDoc?.documentType === "FSSAI_LICENSE" && <>
                <p>FSSAI status: <strong className="text-[#342116]">{selectedDoc.user?.cookProfile?.fssaiStatus || "SUBMITTED"}</strong></p>
                <p>Registration type: <strong className="text-[#342116]">{selectedDoc.user?.cookProfile?.fssaiStatusType?.replaceAll("_", " ") || "Not specified"}</strong></p>
                <p>FoSCoS application reference: <strong className="text-[#342116]">{selectedDoc.user?.cookProfile?.fssaiApplicationReference || "Not recorded"}</strong></p>
                <p>Certificate expiry: <strong className="text-[#342116]">{selectedDoc.expiryDate ? new Date(selectedDoc.expiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Enter the expiry date when approving"}</strong></p>
                {selectedDoc.user?.cookProfile?.fssaiRejectionReason && <p>Review reason: <strong>{selectedDoc.user.cookProfile.fssaiRejectionReason}</strong></p>}
                {selectedDoc.rejectionReason && <p>Document reason: <strong>{selectedDoc.rejectionReason}</strong></p>}
              </>}
            </div>
            {decisionType !== "APPROVED" && <div>
              <label htmlFor="verification-reason" className="mb-1 block text-sm font-medium text-[#523D31]">Reason for {decisionType === "REJECTED" ? "rejection" : "revision request"} *</label>
              <textarea id="verification-reason" required value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Provide a clear explanation for the applicant..." rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#D9532B] focus:outline-none focus:ring-2 focus:ring-orange-100" />
            </div>}
            {selectedDoc?.documentType === "FSSAI_LICENSE" && decisionType === "APPROVED" && <div>
              <label htmlFor="fssai-expiry" className="mb-1 block text-sm font-medium text-[#523D31]">FSSAI expiry date *</label>
              <input id="fssai-expiry" required type="date" value={fssaiExpiryDate} onChange={(event) => setFssaiExpiryDate(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm focus:border-[#D9532B] focus:outline-none focus:ring-2 focus:ring-orange-100" />
            </div>}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={actionLoading} onClick={() => { setSelectedDoc(null); setSelectedApplicant(null); }} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-[#523D31] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Cancel</button>
              <button type="submit" disabled={actionLoading} className="min-h-11 rounded-xl bg-[#D9532B] px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">{actionLoading ? "Saving…" : "Confirm decision"}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

export default AdminVerifications;
