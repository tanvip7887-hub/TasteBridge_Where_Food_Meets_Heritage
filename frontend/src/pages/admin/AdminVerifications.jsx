import { useEffect, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import DocumentPreviewButton from "../../components/admin/DocumentPreviewButton.jsx";
import {
  FileCheck,
  ChefHat,
  Truck,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

export const AdminVerifications = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State for document decision
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [decisionType, setDecisionType] = useState(null); // 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [fssaiExpiryDate, setFssaiExpiryDate] = useState("");

  const fetchVerifications = async () => {
    try {
      const res = await adminApi.getPendingVerifications();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load verification center.");
    } finally {
      setLoading(false);
    }
  };

  const refreshVerifications = () => {
    setLoading(true);
    setError(null);
    void fetchVerifications();
  };

  useEffect(() => {
    let active = true;
    adminApi.getPendingVerifications()
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load verification center.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const openDecisionModal = (doc, type) => {
    setSelectedDoc(doc);
    setDecisionType(type);
    setRejectionReason("");
    setFssaiExpiryDate("");
  };

  const handleConfirmDecision = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !decisionType) return;
    if (decisionType !== "APPROVED" && !rejectionReason.trim()) {
      return alert("Please provide a reason for rejection or requesting revision.");
    }

    try {
      setActionLoading(true);
      const fssaiCookId = selectedDoc.documentType === "FSSAI_LICENSE" && selectedDoc.user?.cookProfile?.id;
      if (fssaiCookId) {
        await adminApi.reviewCookFssai(fssaiCookId, {
          action: decisionType === "APPROVED" ? "APPROVE" : decisionType === "REJECTED" ? "REJECT" : "REQUEST_NEW_DOCUMENT",
          documentId: selectedDoc.id,
          rejectionReason: rejectionReason.trim() || undefined,
          fssaiExpiryDate: decisionType === "APPROVED" ? fssaiExpiryDate || undefined : undefined,
        });
      } else {
        await adminApi.updateDocumentVerification(selectedDoc.id, {
          verificationStatus: decisionType,
          rejectionReason: rejectionReason.trim() || undefined,
        });
      }

      // Also update cook or agent overall status if applicable
      if (!fssaiCookId && selectedDoc.user?.role === "COOK") {
        const cookProfiles = data?.pendingCooks || [];
        const cook = cookProfiles.find((c) => c.userId === selectedDoc.userId);
        if (cook) {
          await adminApi.updateCookVerification(cook.id, {
            verificationStatus: decisionType,
            rejectionReason: rejectionReason.trim() || undefined,
          });
        }
      } else if (!fssaiCookId && selectedDoc.user?.role === "DELIVERY_AGENT") {
        const agentProfiles = data?.pendingAgents || [];
        const agent = agentProfiles.find((a) => a.userId === selectedDoc.userId);
        if (agent) {
          await adminApi.updateDeliveryAgentVerification(agent.id, {
            verificationStatus: decisionType,
            rejectionReason: rejectionReason.trim() || undefined,
          });
        }
      }

      setSelectedDoc(null);
      setDecisionType(null);
      setRejectionReason("");
      refreshVerifications();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
        <span className="text-xs text-gray-500 font-medium">Loading verification requests...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center text-xs text-red-700 font-semibold">
        {error}
      </div>
    );
  }

  const { pendingCooks = [], pendingAgents = [], pendingDocuments = [] } = data || {};

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <FileCheck className="w-6 h-6 text-red-600" /> Verification Center
          </h2>
          <p className="text-xs text-gray-500 mt-1">Central portal for pending cook & delivery agent credential approvals</p>
        </div>
        <button
          onClick={refreshVerifications}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Summary Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-amber-900">{pendingCooks.length}</span>
            <span className="text-xs font-semibold text-amber-700 block">Pending Cooks</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-blue-900">{pendingAgents.length}</span>
            <span className="text-xs font-semibold text-blue-700 block">Pending Delivery Agents</span>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 p-4 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-2xl font-extrabold text-purple-900">{pendingDocuments.length}</span>
            <span className="text-xs font-semibold text-purple-700 block">Documents to Review</span>
          </div>
        </div>
      </div>

      {/* Pending Documents List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-gray-900">Pending Verification Documents</h3>

        {pendingDocuments.length === 0 ? (
          <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-bold text-gray-800">Verification Queue Clear!</p>
            <p className="text-xs text-gray-500">No pending document verification requests at this time.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingDocuments.map((doc) => (
              <div key={doc.id} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-gray-900">{doc.user?.name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-extrabold">
                      {doc.user?.role}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{doc.user?.email}</p>

                  <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-gray-900 block">{doc.documentType}</span>
                      <span className="text-gray-500 text-[11px]">Submitted {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                    <DocumentPreviewButton document={doc} label="Preview" />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => openDecisionModal(doc, "APPROVED")}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => openDecisionModal(doc, "NEEDS_REVISION")}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <AlertCircle className="w-3.5 h-3.5" /> Request Revision
                  </button>
                  <button
                    onClick={() => openDecisionModal(doc, "REJECTED")}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Verification Decision Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <form onSubmit={handleConfirmDecision} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {decisionType === "APPROVED" ? "Approve Document" : decisionType === "REJECTED" ? "Reject Document" : "Request Document Revision"}
              </h3>
              <button type="button" onClick={() => setSelectedDoc(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-gray-500 block">User: <strong className="text-gray-900">{selectedDoc.user?.name} ({selectedDoc.user?.email})</strong></span>
              <span className="text-gray-500 block">Document Type: <strong className="text-gray-900">{selectedDoc.documentType}</strong></span>
              {selectedDoc.documentType === "FSSAI_LICENSE" && <>
                <span className="text-gray-500 block">FSSAI status: <strong className="text-gray-900">{selectedDoc.user?.cookProfile?.fssaiStatus || "SUBMITTED"}</strong></span>
                <span className="text-gray-500 block">Registration type: <strong className="text-gray-900">{selectedDoc.user?.cookProfile?.fssaiStatusType?.replaceAll("_", " ") || "Not specified"}</strong></span>
                <span className="text-gray-500 block">FoSCoS application reference: <strong className="text-gray-900">{selectedDoc.user?.cookProfile?.fssaiApplicationReference || "Not recorded"}</strong></span>
                <span className="text-gray-500 block">Certificate expiry: <strong className="text-gray-900">{selectedDoc.expiryDate ? new Date(selectedDoc.expiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Not recorded; enter the expiry date when approving"}</strong></span>
                {selectedDoc.user?.cookProfile?.fssaiRejectionReason && <span className="text-red-700 block">Review reason: <strong>{selectedDoc.user.cookProfile.fssaiRejectionReason}</strong></span>}
                {selectedDoc.rejectionReason && <span className="text-red-700 block">Document reason: <strong>{selectedDoc.rejectionReason}</strong></span>}
              </>}
            </div>

            {decisionType !== "APPROVED" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason for {decisionType === "REJECTED" ? "Rejection" : "Revision Request"} *
                </label>
                <textarea
                  required
                  placeholder="Provide clear explanation for the applicant..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                  rows={3}
                />
              </div>
            )}
            {selectedDoc.documentType === "FSSAI_LICENSE" && decisionType === "APPROVED" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">FSSAI expiry date *</label>
                <input required type="date" value={fssaiExpiryDate} onChange={(e) => setFssaiExpiryDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs" />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  decisionType === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : decisionType === "REJECTED" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Decision</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminVerifications;
