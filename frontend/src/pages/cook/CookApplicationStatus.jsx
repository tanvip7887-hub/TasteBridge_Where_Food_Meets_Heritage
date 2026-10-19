import { useState } from "react";
import {
  Clock,
  AlertTriangle,
  XCircle,
  ChefHat,
  FileText,
  RefreshCw,
  Edit3,
  ExternalLink,
} from "lucide-react";
import { cookApi } from "../../api/cookApi.js";
import { getCookFssaiStatusMessage } from "../../utils/fssaiStatus.js";

export const CookApplicationStatus = ({
  application,
  onStartRevision,
  onRefresh,
  onBackToOverview,
}) => {
  const [loadingDocumentId, setLoadingDocumentId] = useState(null);
  const [documentError, setDocumentError] = useState("");

  if (!application) return null;

  const {
    businessName,
    specialization,
    cuisines = [],
    city,
    locality,
    cookingCapacity,
    verificationStatus,
    revisionReason,
    rejectionReason,
    fssaiNumber,
    fssaiStatus,
    fssaiExpiryDate,
    fssaiRejectionReason,
    foodSafetyConsentAt,
    user,
  } = application;

  const documents = user?.verificationDocuments || [];

  const handleViewDocument = async (docId) => {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      setDocumentError("Allow pop-ups to view your private document.");
      return;
    }

    setLoadingDocumentId(docId);
    setDocumentError("");
    try {
      const documentBlob = await cookApi.getDocument(docId);
      const documentUrl = URL.createObjectURL(documentBlob);
      const isPdf = documentBlob.type === "application/pdf";
      previewWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Verification Document</title>
            <style>
              body { margin: 0; background: #0f172a; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: system-ui, sans-serif; }
              img { max-width: 95vw; max-height: 95vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
              iframe { width: 100vw; height: 100vh; border: none; }
            </style>
          </head>
          <body>
            ${isPdf ? `<iframe src="${documentUrl}"></iframe>` : `<img src="${documentUrl}" alt="Document" />`}
          </body>
        </html>
      `);
      previewWindow.document.close();
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60_000);
    } catch (error) {
      previewWindow.close();
      setDocumentError(error.message || "The document could not be opened.");
    } finally {
      setLoadingDocumentId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-left">
      {onBackToOverview && (
        <div className="mb-4">
          <button
            type="button"
            onClick={onBackToOverview}
            className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
          >
            ← Back to Overview
          </button>
        </div>
      )}

      {/* 1. STATUS BANNER CARD */}
      {verificationStatus === "PENDING" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200/80 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[10px] uppercase tracking-wider">
                  Status: Under Review
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                  Your Application Is Being Reviewed
                </h1>
              </div>
            </div>

            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Thank you for sharing your home cooking story with TasteBridge! Our curation team is reviewing your kitchen details, regional specialties, and identity verification documents.
          </p>

          <div className="p-4 bg-amber-50/70 border border-amber-200/60 rounded-2xl text-xs text-amber-900">
            <strong>What happens next:</strong> Our curation team typically finishes review within 24 to 48 hours. Once approved, your account role will be updated to Cook and you will receive access to your kitchen dashboard.
          </div>
        </div>
      )}

      {/* 2. NEEDS REVISION BANNER CARD */}
      {verificationStatus === "NEEDS_REVISION" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-300 shadow-md space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[10px] uppercase tracking-wider">
                  Action Required
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                  Revisions Requested by Admin
                </h1>
              </div>
            </div>

            <button
              onClick={onRefresh}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Admin Revision Reason */}
          <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-2xl space-y-1">
            <span className="text-xs font-bold text-amber-900 block">Note from Curation Reviewer:</span>
            <p className="text-xs text-gray-800 leading-relaxed font-medium">
              {revisionReason || "Please verify your uploaded documents and kitchen details."}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              Update your information or replace documents to resubmit for review.
            </p>
            <button
              onClick={onStartRevision}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 hover:scale-[1.02] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit & Resubmit Application</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. REJECTED BANNER CARD */}
      {verificationStatus === "REJECTED" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-red-200 shadow-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 font-extrabold text-[10px] uppercase tracking-wider">
                Application Status: Not Approved
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                Application Not Approved
              </h1>
            </div>
          </div>

          <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-2xl space-y-1">
            <span className="text-xs font-bold text-red-900 block">Reason Provided:</span>
            <p className="text-xs text-gray-800 leading-relaxed font-medium">
              {rejectionReason || "Application did not meet platform verification guidelines."}
            </p>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed">
            TasteBridge maintains strict food safety and verification guidelines. If you believe this decision was made in error or would like to submit corrected documentation, you may contact our support team.
          </p>

          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={onStartRevision}
              className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Submit New Application
            </button>
          </div>
        </div>
      )}

      {/* 2. SUMMARY OF SUBMITTED DETAILS */}
      <div className="mt-8 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
          <ChefHat className="w-4 h-4 text-red-600" /> Submitted Application Overview
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-500 block font-medium">Kitchen Display Name</span>
            <span className="font-bold text-gray-900 text-sm">{businessName}</span>
          </div>

          <div>
            <span className="text-gray-500 block font-medium">Specialization</span>
            <span className="font-bold text-gray-900 text-sm">{specialization || "General"}</span>
          </div>

          <div>
            <span className="text-gray-500 block font-medium">Operating Location</span>
            <span className="font-semibold text-gray-800">{locality}, {city}</span>
          </div>

          <div>
            <span className="text-gray-500 block font-medium">Declared Daily Capacity</span>
            <span className="font-semibold text-gray-800">{cookingCapacity}</span>
          </div>

          <div>
            <span className="text-gray-500 block font-medium">Regional Cuisines</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(Array.isArray(cuisines) ? cuisines : [cuisines]).map((c, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 font-semibold text-[10px]">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div>
            <span className="text-gray-500 block font-medium">FSSAI Registration Status</span>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase mt-1 ${
              fssaiStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" : fssaiStatus === "REJECTED" || fssaiStatus === "EXPIRED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}>
              {getCookFssaiStatusMessage(fssaiStatus, fssaiExpiryDate, fssaiRejectionReason).label}
            </span>
            <p className="mt-1 text-[11px] text-gray-600">{getCookFssaiStatusMessage(fssaiStatus, fssaiExpiryDate, fssaiRejectionReason).nextAction}</p>
            {fssaiNumber && <p className="mt-1 text-[11px] text-gray-500">Registration number: {fssaiNumber}</p>}
          </div>
        </div>

        {/* Uploaded Documents */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <h3 className="text-xs font-bold text-gray-900">Submitted Verification Documents</h3>
          {documentError && <p role="alert" className="text-xs text-red-700">{documentError}</p>}
          {documents.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No documents attached.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <div>
                      <span className="font-bold text-gray-900 block">{doc.documentType}</span>
                      <span className="text-[11px] text-gray-500">Status: {doc.verificationStatus}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleViewDocument(doc.id)}
                    disabled={loadingDocumentId === doc.id}
                    className="px-3 py-1 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 flex items-center gap-1"
                  >
                    {loadingDocumentId === doc.id ? "Opening…" : "View File"}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Food Safety Declaration Record */}
        {foodSafetyConsentAt && (
          <div className="border-t border-gray-100 pt-4 text-[11px] text-gray-500 flex items-center justify-between">
            <span>Food Safety Agreement v1.0 Consent Recorded</span>
            <span>{new Date(foodSafetyConsentAt).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookApplicationStatus;
