import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bike, CheckCircle2, Clock3, Eye, FileText, Loader2, Mail, MapPin, Phone, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";
import { useOutletContext } from "react-router-dom";
import { getDeliveryAgentPayoutValidationError, normalizeDeliveryAgentPayoutDetails } from "../../utils/deliveryAgentPayout.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const documentLabels = {
  IDENTITY_PROOF: "Identity document",
  DRIVING_LICENSE: "Driving licence",
  VEHICLE_REGISTRATION: "Vehicle registration",
  ADDRESS_PROOF: "Address proof",
  OTHER: "Other document",
};

const statusStyle = (status) => {
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-800 border-amber-200";
  if (!status) return "bg-gray-50 text-gray-700 border-gray-200";
  return "bg-red-50 text-red-800 border-red-200";
};

const labelForDocument = (document) => document.documentType === "OTHER" && document.mimeType?.startsWith("image/")
  ? "Profile photo"
  : documentLabels[document.documentType] || document.documentType?.replaceAll("_", " ") || "Verification document";

const pendingDocumentBlobRequests = new Map();
const getDocumentBlob = (documentId) => {
  if (!pendingDocumentBlobRequests.has(documentId)) {
    const request = deliveryAgentApi.getDocument(documentId).then((response) => {
      const blob = response?.data instanceof Blob ? response.data : response;
      if (!(blob instanceof Blob)) throw new Error("The document response was not a file.");
      return blob;
    });
    pendingDocumentBlobRequests.set(documentId, request);
    request.finally(() => {
      if (pendingDocumentBlobRequests.get(documentId) === request) pendingDocumentBlobRequests.delete(documentId);
    }).catch(() => {});
  }
  return pendingDocumentBlobRequests.get(documentId);
};

export const DeliveryAgentProfilePage = () => {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [payoutSubmitting, setPayoutSubmitting] = useState(false);
  const [payoutError, setPayoutError] = useState("");
  const [payoutSuccess, setPayoutSuccess] = useState("");
  const { refreshDashboard } = useOutletContext();
  const requestId = useRef(0);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = unwrap(await deliveryAgentApi.getMyApplication());
      setApplication(result?.application || null);
      setUpiId(result?.application?.payoutDetails?.upiId || "");
      setAccountHolderName(result?.application?.payoutDetails?.accountHolderName || "");
    } catch (loadError) {
      setError(loadError?.message || "Your profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const photo = application?.user?.verificationDocuments?.find((document) => document.documentType === "OTHER" && document.mimeType?.startsWith("image/") && document.verificationStatus === "APPROVED");
    setProfilePhotoUrl("");
    if (!photo?.id) return undefined;
    getDocumentBlob(photo.id).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setProfilePhotoUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [application]);
  useEffect(() => () => {
    requestId.current += 1;
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const closePreview = () => {
    requestId.current += 1;
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const openPreview = async (document) => {
    const id = ++requestId.current;
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ id: document.id, name: document.fileName || documentLabels[document.documentType] || "Verification document", isPdf: document.mimeType === "application/pdf" || document.fileName?.toLowerCase().endsWith(".pdf"), loading: true, url: null, error: "" });
    try {
      const blob = await getDocumentBlob(document.id);
      const url = URL.createObjectURL(blob);
      if (requestId.current !== id) {
        URL.revokeObjectURL(url);
        return;
      }
      setPreview((current) => current?.id === document.id ? { ...current, loading: false, url } : current);
    } catch (previewError) {
      if (requestId.current === id) setPreview((current) => current?.id === document.id ? { ...current, loading: false, error: previewError?.message || "The document could not be opened." } : current);
    }
  };

  const submitPayoutDetails = async (event) => {
    event.preventDefault();
    const normalizedDetails = normalizeDeliveryAgentPayoutDetails({ upiId, accountHolderName });
    const validationError = getDeliveryAgentPayoutValidationError(normalizedDetails);
    if (validationError) {
      setPayoutError(validationError);
      return;
    }
    setPayoutSubmitting(true);
    setPayoutError("");
    setPayoutSuccess("");
    try {
      const details = unwrap(await deliveryAgentApi.submitPayoutDetails(normalizedDetails));
      setApplication((current) => current ? { ...current, payoutDetails: details } : current);
      setUpiId(details?.upiId || normalizedDetails.upiId);
      setAccountHolderName(details?.accountHolderName || normalizedDetails.accountHolderName);
      setPayoutSuccess("Payout details submitted. They are awaiting admin approval.");
      await refreshDashboard().catch(() => {});
    } catch (submitError) {
      setPayoutError(submitError?.message || "Your payout details could not be submitted.");
    } finally {
      setPayoutSubmitting(false);
    }
  };

  if (loading) return <div role="status" aria-label="Loading profile" className="mx-auto grid max-w-7xl gap-4 sm:grid-cols-2"><div className="h-36 animate-pulse rounded-2xl bg-white shadow-sm sm:col-span-2" /><div className="h-56 animate-pulse rounded-2xl bg-white shadow-sm" /><div className="h-56 animate-pulse rounded-2xl bg-white shadow-sm" /><div className="h-48 animate-pulse rounded-2xl bg-white shadow-sm sm:col-span-2" /></div>;
  if (error) return <section className="mx-auto max-w-2xl rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-8 w-8 text-red-600" /><h1 className="mt-3 text-xl font-bold text-[#2B1B12]">Profile unavailable</h1><p className="mt-2 text-sm text-gray-600">{error}</p><button type="button" onClick={loadProfile} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><RefreshCw className="h-4 w-4" />Try again</button></section>;
  if (!application) return <section className="rounded-2xl border border-orange-100 bg-white p-6 text-sm text-gray-600">No delivery-agent profile was found.</section>;

  const user = application.user || {};
  const documents = user.verificationDocuments || [];
  const payoutDetails = application.payoutDetails;
  const payoutDetailsComplete = !getDeliveryAgentPayoutValidationError(payoutDetails);
  const payoutAwaitingReview = payoutDetails?.verificationStatus === "PENDING" && payoutDetailsComplete;
  const address = application.address;
  const addressText = address && [address.addressLine1, address.addressLine2, address.locality, address.city, address.state, address.pincode].filter(Boolean).join(", ");

  const approvedCount = documents.filter((document) => document.verificationStatus === "APPROVED").length;
  const attentionDocuments = documents.filter((document) => document.verificationStatus === "PENDING" || document.verificationStatus === "REJECTED");
  const verificationLabel = application.verificationStatus?.replaceAll("_", " ") || "Not submitted";
  const initials = (user.name || "DA").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const field = (label, value, Icon, href) => <div className="flex min-w-0 items-start gap-3 rounded-xl bg-[#F8F9FB] p-3.5"><span className="mt-0.5 text-[#D2552B]"><Icon className="h-4 w-4" /></span><div className="min-w-0"><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-[#2B1B12]">{value ? (href ? <a className="rounded-sm hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400" href={href}>{value}</a> : value) : <span className="font-normal text-gray-500">Not provided</span>}</dd></div></div>;

  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      {profilePhotoUrl ? <img src={profilePhotoUrl} alt={`${user.name || "Delivery agent"} profile`} className="h-20 w-20 shrink-0 rounded-full border border-gray-200 object-cover" /> : <span aria-label="Profile initials" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-orange-100 bg-red-50 text-xl font-bold text-red-700">{initials}</span>}
      <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-bold text-[#2B1B12]">{user.name || "Delivery agent"}</h1><p className="mt-1 text-sm text-gray-600">{[application.deliveryType?.replaceAll("_", " ") || application.vehicleType, application.vehicleNumber].filter(Boolean).join(" · ") || "Delivery profile"}</p><div className="mt-3 flex flex-wrap gap-2">{application.verificationStatus === "APPROVED" && <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Verified agent</span>}<span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle(application.verificationStatus)}`}>{application.verificationStatus === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{verificationLabel}</span></div></div>
    </header>

    <div className="grid items-start gap-5 lg:grid-cols-5">
      <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3" aria-labelledby="personal-details-heading">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-red-700"><UserRound className="h-5 w-5" /></span><h2 id="personal-details-heading" className="text-lg font-bold text-[#2B1B12]">Personal details</h2></div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {field("Email", user.email, Mail, user.email ? `mailto:${user.email}` : null)}
          {field("Phone", user.phone, Phone, user.phone ? `tel:${user.phone}` : null)}
          {field("Delivery mode", application.deliveryType?.replaceAll("_", " ") || application.vehicleType, Bike)}
          {field("Vehicle number", application.vehicleNumber, FileText)}
          <div className="sm:col-span-2">{field("Service address", addressText, MapPin)}</div>
        </dl>
      </section>

      <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2" aria-labelledby="verification-heading">
        <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-red-700"><ShieldCheck className="h-5 w-5" /></span><div><h2 id="verification-heading" className="text-lg font-bold text-[#2B1B12]">Verification status</h2><p className="mt-0.5 text-sm text-gray-500">{approvedCount} of {documents.length} documents approved</p></div></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(application.verificationStatus)}`}>{verificationLabel}</span></div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Approved verification documents" aria-valuemin={0} aria-valuemax={documents.length || 1} aria-valuenow={approvedCount}><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${documents.length ? (approvedCount / documents.length) * 100 : 0}%` }} /></div>
        {attentionDocuments.length === 0 ? <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" />All submitted documents are approved.</p> : <div className="mt-4 space-y-2"><p className="text-sm text-gray-600">These documents need attention:</p>{attentionDocuments.map((document) => <div key={document.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F8F9FB] px-3 py-2"><span className="min-w-0 truncate text-sm font-medium text-[#2B1B12]">{labelForDocument(document)}</span><span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(document.verificationStatus)}`}>{document.verificationStatus?.toLowerCase()}</span></div>)}</div>}
      </section>
    </div>

    <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="documents-heading">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-red-700"><FileText className="h-5 w-5" /></span><div><h2 id="documents-heading" className="text-lg font-bold text-[#2B1B12]">Verification documents</h2><p className="mt-0.5 text-sm text-gray-500">Review the files submitted with your application.</p></div></div>
      {documents.length === 0 ? <p className="mt-4 rounded-xl bg-[#F8F9FB] p-4 text-sm text-gray-600">No documents have been submitted.</p> : <ul className="mt-4 divide-y divide-gray-100">{documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F8F9FB] text-gray-600">{document.documentType === "OTHER" && document.verificationStatus === "APPROVED" && profilePhotoUrl ? <img src={profilePhotoUrl} alt="" className="h-full w-full object-cover" /> : <FileText className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-sm font-semibold text-[#2B1B12]">{labelForDocument(document)}</p><p className="mt-0.5 truncate text-sm text-gray-500" title={document.fileName || "Uploaded document"}>{document.fileName || "Uploaded document"}</p>{document.verificationStatus === "REJECTED" && document.rejectionReason && <p className="mt-1 break-words text-sm text-red-700">{document.rejectionReason}</p>}</div></div><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(document.verificationStatus)}`}>{document.verificationStatus?.replaceAll("_", " ") || "Unknown"}</span><button type="button" onClick={() => openPreview(document)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-[#2B1B12] transition-colors hover:border-red-300 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><Eye className="h-4 w-4" />Preview</button></div></li>)}</ul>}
    </section>

    <section id="payment-details" className="scroll-mt-6 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="payout-heading">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-600" /><div><h2 id="payout-heading" className="font-bold text-[#2B1B12]">Delivery-fee payment details</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">Submit your UPI ID and the name associated with it. Approval records the submitted destination only; it does not independently verify the account or process payouts.</p></div></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(payoutDetails?.verificationStatus)}`}>{payoutDetails?.verificationStatus?.replaceAll("_", " ") || "NOT SUBMITTED"}</span></div>
      {application.verificationStatus !== "APPROVED" ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Submit your UPI payout details after your delivery-agent profile is approved.</p> : payoutAwaitingReview ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Awaiting admin approval</p><p className="mt-1">Your UPI ID and account holder name are under review. Delivery work stays locked until all requirements, including this review, are approved.</p><p className="mt-2 font-semibold">{payoutDetails.upiId} · {payoutDetails.accountHolderName}</p>{payoutSuccess && <p role="status" className="mt-2 font-semibold text-emerald-800">{payoutSuccess}</p>}</div> : <form onSubmit={submitPayoutDetails} className="mt-4 max-w-xl space-y-3">
        {payoutDetails?.verificationStatus === "REJECTED" && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-bold">Update required</p><p className="mt-1">{payoutDetails.rejectionReason || "Your payout details were rejected. Please review and resubmit them."}</p></div>}
        {payoutDetails?.verificationStatus === "APPROVED" && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><p className="font-bold">Payout details approved</p><p className="mt-1">Changing either detail will require a new admin review and temporarily lock online availability.</p><p className="mt-2 font-semibold">{payoutDetails.upiId} · {payoutDetails.accountHolderName || "Account holder name needs to be added"}</p></div>}
        <label htmlFor="delivery-agent-upi-id" className="block text-sm font-semibold text-[#2B1B12]">UPI ID</label>
        <input id="delivery-agent-upi-id" name="upiId" type="text" inputMode="email" autoComplete="off" required minLength={3} maxLength={320} pattern="[A-Za-z0-9][A-Za-z0-9._+-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}" value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="name@bank" disabled={payoutSubmitting} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-[#2B1B12] outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100" aria-describedby="upi-hint" />
        <label htmlFor="delivery-agent-account-holder-name" className="block text-sm font-semibold text-[#2B1B12]">UPI account holder name</label>
        <input id="delivery-agent-account-holder-name" name="accountHolderName" type="text" autoComplete="name" required minLength={2} maxLength={100} value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} placeholder="Name associated with the UPI account" disabled={payoutSubmitting} className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-[#2B1B12] outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100" aria-describedby="upi-hint" />
        <p id="upi-hint" className="text-xs text-gray-500">Use the name associated with the UPI account. We review the details you submit but do not independently verify the account name. Never enter a PIN, OTP, card number, or password.</p>
        {payoutError && <p role="alert" className="text-sm font-medium text-red-700">{payoutError}</p>}
        {payoutSuccess && <p role="status" className="text-sm font-medium text-emerald-700">{payoutSuccess}</p>}
        <button type="submit" disabled={payoutSubmitting || !upiId.trim() || !accountHolderName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{payoutSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</> : payoutDetails?.verificationStatus === "APPROVED" ? "Update and resubmit" : "Submit for admin review"}</button>
      </form>}
    </section>

    {preview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview(); }}><section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={preview.name}><header className="flex items-center justify-between border-b border-gray-100 px-4 py-3"><p className="truncate pr-4 text-sm font-bold text-[#2B1B12]">{preview.name}</p><button type="button" onClick={closePreview} className="rounded-lg px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100">Close</button></header><div className="flex min-h-64 items-center justify-center overflow-auto bg-gray-50 p-4">{preview.loading ? <div role="status" className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-red-600" />Opening secure document…</div> : preview.error ? <p className="text-sm text-red-700" role="alert">{preview.error}</p> : preview.url && (preview.isPdf ? <iframe title={preview.name} src={preview.url} className="h-[72vh] w-full bg-white" /> : <img src={preview.url} alt={preview.name} className="max-h-[72vh] max-w-full object-contain" />)}</div></section></div>}
  </div>;
};

export default DeliveryAgentProfilePage;
