import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bike, CheckCircle2, Clock3, Eye, FileText, Loader2, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
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

export const DeliveryAgentProfilePage = () => {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
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
      const response = await deliveryAgentApi.getDocument(document.id);
      const blob = response?.data instanceof Blob ? response.data : response;
      if (!(blob instanceof Blob)) throw new Error("The document response was not a file.");
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

  if (loading) return <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-red-600" />Loading profile…</div>;
  if (error) return <section className="mx-auto max-w-2xl rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-8 w-8 text-red-600" /><h1 className="mt-3 text-xl font-bold text-[#2B1B12]">Profile unavailable</h1><p className="mt-2 text-sm text-gray-600">{error}</p><button type="button" onClick={loadProfile} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"><RefreshCw className="h-4 w-4" />Try again</button></section>;
  if (!application) return <section className="rounded-2xl border border-orange-100 bg-white p-6 text-sm text-gray-600">No delivery-agent profile was found.</section>;

  const user = application.user || {};
  const documents = user.verificationDocuments || [];
  const payoutDetails = application.payoutDetails;
  const payoutDetailsComplete = !getDeliveryAgentPayoutValidationError(payoutDetails);
  const payoutAwaitingReview = payoutDetails?.verificationStatus === "PENDING" && payoutDetailsComplete;
  const address = application.address;
  const addressText = address && [address.addressLine1, address.addressLine2, address.locality, address.city, address.state, address.pincode].filter(Boolean).join(", ");

  return <div className="mx-auto max-w-5xl space-y-5">
    <header><p className="text-sm font-semibold text-[#D2552B]">Account</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">My profile</h1><p className="mt-2 text-sm text-gray-600">Your submitted delivery profile and verification documents.</p></header>

    <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-orange-100 pb-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-3 text-red-700"><Bike className="h-5 w-5" /></span><div><h2 className="text-lg font-extrabold text-[#2B1B12]">Personal profile</h2><p className="text-sm text-gray-600">{user.name || "Delivery agent"}</p></div></div><span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${statusStyle(application.verificationStatus)}`}>{application.verificationStatus === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}{application.verificationStatus?.replaceAll("_", " ") || "Not submitted"}</span></div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</dt><dd className="mt-1 break-all font-medium text-[#2B1B12]">{user.email || "Not provided"}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Phone</dt><dd className="mt-1 font-medium text-[#2B1B12]">{user.phone || "Not provided"}</dd></div>
        <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delivery mode</dt><dd className="mt-1 font-medium text-[#2B1B12]">{application.deliveryType?.replaceAll("_", " ") || application.vehicleType || "Not provided"}</dd></div>
        {application.vehicleNumber && <div><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vehicle number</dt><dd className="mt-1 font-medium text-[#2B1B12]">{application.vehicleNumber}</dd></div>}
        {addressText && <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Service address</dt><dd className="mt-1 flex items-start gap-1.5 font-medium text-[#2B1B12]"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />{addressText}</dd></div>}
      </dl>
    </section>

    <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="documents-heading">
      <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-red-600" /><h2 id="documents-heading" className="text-lg font-extrabold text-[#2B1B12]">Verification documents</h2></div>
      {documents.length === 0 ? <p className="mt-4 text-sm text-gray-600">No documents have been submitted.</p> : <ul className="mt-4 divide-y divide-gray-100">{documents.map((document) => <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="font-semibold text-[#2B1B12]">{documentLabels[document.documentType] || document.documentType?.replaceAll("_", " ")}</p><p className="mt-0.5 truncate text-xs text-gray-500">{document.fileName || "Uploaded document"}{document.rejectionReason ? ` · ${document.rejectionReason}` : ""}</p></div><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusStyle(document.verificationStatus)}`}>{document.verificationStatus?.replaceAll("_", " ") || "Unknown"}</span><button type="button" onClick={() => openPreview(document)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-[#2B1B12] transition-colors hover:border-red-300 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><Eye className="h-3.5 w-3.5" />Preview</button></div></li>)}</ul>}
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
