import { useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  User,
  AlertCircle,
  X,
  Loader2,
  Eye,
} from "lucide-react";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";
import { populateStandaloneDocumentPreview } from "../../utils/documentPreview.js";

export const DeliveryAgentApplicationStatus = ({
  application,
  onRefresh,
  onStartRevision,
  onBackToOverview,
}) => {
  // Document preview modal state
  const [previewDoc, setPreviewDoc] = useState(null);

  const handleOpenPreview = async (doc) => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }

    const isPdf =
      doc.mimeType === "application/pdf" ||
      doc.fileName?.toLowerCase().endsWith(".pdf");

    setPreviewDoc({
      id: doc.id,
      fileName: doc.fileName || doc.documentType || "Verification Document",
      documentType: doc.documentType,
      verificationStatus: doc.verificationStatus,
      isPdf,
      url: null,
      loading: true,
      error: null,
    });

    try {
      const documentBlob = await deliveryAgentApi.getDocument(doc.id);
      const objectUrl = URL.createObjectURL(documentBlob);

      setPreviewDoc((prev) => {
        if (!prev || prev.id !== doc.id) {
          URL.revokeObjectURL(objectUrl);
          return prev;
        }
        return {
          ...prev,
          url: objectUrl,
          loading: false,
          error: null,
        };
      });
    } catch (err) {
      setPreviewDoc((prev) => {
        if (!prev || prev.id !== doc.id) return prev;
        return {
          ...prev,
          loading: false,
          error: err.message || "Failed to load the document from secure storage.",
        };
      });
    }
  };

  const handleClosePreview = useCallback(() => {
    if (previewDoc?.url) {
      URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  }, [previewDoc?.url]);

  const handleOpenInNewTab = () => {
    if (!previewDoc?.url) return;
    const newWin = window.open("", "_blank");
    if (!newWin) return;
    populateStandaloneDocumentPreview(newWin, previewDoc);
  };

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && previewDoc) {
        handleClosePreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewDoc, handleClosePreview]);

  if (!application) return null;

  const {
    verificationStatus,
    vehicleType,
    licenseNumber,
    dateOfBirth,
    emergencyContactName,
    emergencyContactPhone,
    address,
    user,
  } = application;

  const documents = user?.verificationDocuments || [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 text-left">
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
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-amber-200/90 shadow-md space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[10px] uppercase tracking-wider inline-block">
                  Status: Under Review
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                  Your Application Is Under Review
                </h1>
              </div>
            </div>

            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer shrink-0"
                title="Refresh Status"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Thank you for registering as a TasteBridge Delivery Partner! Our operations curation team is currently verifying your submitted identity and vehicle documents. Verification is typically completed within <strong>24 to 48 hours</strong>.
          </p>

          <div className="p-3.5 bg-amber-50/70 border border-amber-200/70 rounded-2xl text-xs text-amber-950 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Pending Review State:</strong> In accordance with safety policies, delivery partner privileges and order assignments are granted only after manual verification approval by our administrative team.
            </span>
          </div>
        </div>
      )}

      {verificationStatus === "APPROVED" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-200 shadow-md space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-extrabold text-[10px] uppercase tracking-wider inline-block">
                Status: Verified & Approved
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                You Are an Approved Delivery Partner!
              </h1>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Congratulations! Your documents have been verified and your delivery agent account is now active. You can now accept deliveries from home kitchens in your neighborhood.
          </p>
        </div>
      )}

      {verificationStatus === "REJECTED" && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-red-200 shadow-md space-y-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-800 flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 font-extrabold text-[10px] uppercase tracking-wider inline-block">
                Status: Application Rejected
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 mt-1">
                Application Needs Revision
              </h1>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Our operations team was unable to verify your registration documents. Please review your details and re-submit with clear, valid government documents.
          </p>

          {onStartRevision && (
            <button
              type="button"
              onClick={onStartRevision}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Update Details & Resubmit
            </button>
          )}
        </div>
      )}

      {/* 2. REGISTRATION SUMMARY CARD */}
      <div className="mt-6 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-5">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <User className="w-4 h-4 text-red-600" /> Submitted Partner Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-500 block">Full Legal Name</span>
            <span className="font-bold text-gray-900">{user?.name || "N/A"}</span>
          </div>

          <div>
            <span className="text-gray-500 block">Contact Mobile Number</span>
            <span className="font-bold text-gray-900">{user?.phone || "N/A"}</span>
          </div>

          <div>
            <span className="text-gray-500 block">Registered Email</span>
            <span className="font-bold text-gray-900">{user?.email || "N/A"}</span>
          </div>

          <div>
            <span className="text-gray-500 block">Delivery Mode & Vehicle</span>
            <span className="font-bold text-gray-900">{vehicleType || "Not specified"}</span>
          </div>

          {licenseNumber && (
            <div>
              <span className="text-gray-500 block">Driving Licence Number</span>
              <span className="font-bold text-gray-900 font-mono">{licenseNumber}</span>
            </div>
          )}

          {dateOfBirth && (
            <div>
              <span className="text-gray-500 block">Date of Birth</span>
              <span className="font-bold text-gray-900">{dateOfBirth}</span>
            </div>
          )}

          {address && (
            <div className="sm:col-span-2">
              <span className="text-gray-500 block">Delivery Cluster / Address</span>
              <span className="font-bold text-gray-900">
                {address.addressLine1}, {address.locality}, {address.city}, {address.state} - {address.pincode}
              </span>
            </div>
          )}

          {emergencyContactName && (
            <div className="sm:col-span-2">
              <span className="text-gray-500 block">Emergency Contact</span>
              <span className="font-bold text-gray-900">
                {emergencyContactName} {emergencyContactPhone && `(${emergencyContactPhone})`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3. UPLOADED DOCUMENTS SECTION */}
      <div className="mt-6 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-600" /> Submitted Verification Documents
        </h2>

        {documents.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No verification documents on file.</p>
        ) : (
          <div className="space-y-2.5">
            {documents.map((doc) => {
              const isLoadingThis = previewDoc?.id === doc.id && previewDoc?.loading;
              let label = "Verification Document";
              if (doc.documentType === "IDENTITY_PROOF") label = "Government Identity Proof";
              else if (doc.documentType === "DRIVING_LICENSE") label = "Driving Licence";
              else if (doc.documentType === "VEHICLE_REGISTRATION") label = "Vehicle Registration (RC)";
              else if (doc.documentType === "ADDRESS_PROOF") label = "Address Proof";
              else if (doc.documentType === "OTHER") label = "Profile Photo / Other";

              return (
                <div
                  key={doc.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 hover:border-gray-300 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-900">{label}</span>
                      <span
                        className={`text-[9px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                          doc.verificationStatus === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : doc.verificationStatus === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {doc.verificationStatus}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 block">
                      {doc.fileName || "Uploaded document"} {doc.fileSize && `• ${(doc.fileSize / 1024 / 1024).toFixed(2)} MB`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenPreview(doc)}
                    disabled={isLoadingThis}
                    className="self-start sm:self-auto px-4 py-2 bg-white border border-gray-300 hover:border-red-400 text-gray-800 hover:text-red-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow-sm"
                  >
                    {isLoadingThis ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-red-600" />
                        <span>View Document</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. ACTIONS & NEXT STEPS */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {onBackToOverview ? (
          <button
            type="button"
            onClick={onBackToOverview}
            className="w-full sm:w-auto px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            ← Return to Landing Page
          </button>
        ) : (
          <div />
        )}

        <Link
          to="/"
          className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all text-center shadow-md shadow-red-600/20"
        >
          Explore Food Marketplace
        </Link>
      </div>

      {/* =========================================================================
          INTERACTIVE DOCUMENT PREVIEW MODAL
          Never opens a blank window; streams document directly into an in-page modal
          ========================================================================= */}
      {previewDoc &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleClosePreview();
            }}
          >
            <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-gray-100">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/80">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">
                      {previewDoc.fileName}
                    </h3>
                    <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider block">
                      {previewDoc.documentType} • Status: {previewDoc.verificationStatus}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {previewDoc.url && (
                    <button
                      type="button"
                      onClick={handleOpenInNewTab}
                      className="px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 hover:text-red-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      title="Open full resolution in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Open in New Tab</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClosePreview}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-xl transition-colors cursor-pointer"
                    title="Close preview (Esc)"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center min-h-[350px] bg-gray-100/40">
                {previewDoc.loading && (
                  <div className="flex flex-col items-center justify-center space-y-3 py-16">
                    <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
                    <p className="text-xs font-semibold text-gray-600">
                      Loading secure document from cloud storage...
                    </p>
                  </div>
                )}

                {previewDoc.error && (
                  <div className="max-w-md mx-auto p-6 bg-white rounded-2xl border border-red-200 text-center space-y-3 shadow-sm">
                    <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
                    <h4 className="text-sm font-bold text-gray-900">Unable to Preview Document</h4>
                    <p className="text-xs text-gray-600">{previewDoc.error}</p>
                    <button
                      type="button"
                      onClick={() => handleOpenPreview({ id: previewDoc.id, fileName: previewDoc.fileName, documentType: previewDoc.documentType })}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Try Again
                    </button>
                  </div>
                )}

                {!previewDoc.loading && !previewDoc.error && previewDoc.url && (
                  <div className="w-full flex items-center justify-center">
                    {previewDoc.isPdf ? (
                      <iframe
                        src={previewDoc.url}
                        title={previewDoc.fileName}
                        className="w-full h-[72vh] rounded-2xl border border-gray-200 bg-white shadow-sm"
                      />
                    ) : (
                      <img
                        src={previewDoc.url}
                        alt={previewDoc.fileName}
                        className="max-h-[72vh] max-w-full rounded-2xl object-contain shadow-lg border border-gray-200/80 bg-white"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs text-gray-500">
                <span>Private verification document • Only accessible by you and authorized reviewers</span>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          globalThis.document.body
        )}
    </div>
  );
};

export default DeliveryAgentApplicationStatus;
