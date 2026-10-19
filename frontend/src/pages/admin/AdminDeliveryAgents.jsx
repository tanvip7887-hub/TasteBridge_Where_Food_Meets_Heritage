import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Truck,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  Loader2,
  RefreshCw,
  FileText,
  Ban,
  X,
} from "lucide-react";

export const AdminDeliveryAgents = () => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const searchRef = useRef(search);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const [selectedAgent, setSelectedAgent] = useState(null);
  const [payoutReviewReason, setPayoutReviewReason] = useState("");
  const [payoutReviewError, setPayoutReviewError] = useState("");
  const [payoutReviewing, setPayoutReviewing] = useState(false);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchAgents = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllDeliveryAgents({
        search: searchRef.current,
        verificationStatus: verificationFilter || undefined,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setAgents(res.data.agents || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load delivery agents list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [verificationFilter]);

  const refreshAgents = () => {
    setLoading(true);
    setError(null);
    void fetchAgents();
  };

  useEffect(() => {
    fetchAgents();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchAgents]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    refreshAgents();
  };

  const openAgentDetail = async (agentId) => {
    try {
      setPayoutReviewReason("");
      setPayoutReviewError("");
      const res = await adminApi.getDeliveryAgentById(agentId);
      setSelectedAgent(res.data);
    } catch (err) {
      alert("Failed to load delivery agent details: " + err.message);
    }
  };

  const handleUpdateVerification = (agentId, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "APPROVED" ? "Approve" : newStatus === "REJECTED" ? "Reject" : "Request Revision"} Delivery Agent`,
      message: `Are you sure you want to mark this delivery agent's verification status as ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateDeliveryAgentVerification(agentId, { verificationStatus: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedAgent && selectedAgent.id === agentId) {
            openAgentDetail(agentId);
          }
          refreshAgents();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const handleToggleAccountStatus = (agentId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Agent Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this agent account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateDeliveryAgentAccountStatus(agentId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedAgent && selectedAgent.id === agentId) {
            openAgentDetail(agentId);
          }
          refreshAgents();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const reviewPayoutDetails = async (action) => {
    if (!selectedAgent?.payoutDetails || (action === "REJECT" && !payoutReviewReason.trim())) return;
    setPayoutReviewing(true);
    setPayoutReviewError("");
    try {
      const result = await adminApi.reviewDeliveryAgentPayoutDetails(selectedAgent.id, {
        action,
        ...(action === "REJECT" ? { rejectionReason: payoutReviewReason.trim() } : {}),
      });
      setSelectedAgent((current) => current ? { ...current, payoutDetails: result.data } : current);
      setPayoutReviewReason("");
      refreshAgents();
    } catch (reviewError) {
      setPayoutReviewError(reviewError.message || "Payout details could not be reviewed.");
    } finally {
      setPayoutReviewing(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" /> Delivery Agent Management
          </h2>
          <p className="text-xs text-gray-500 mt-1">Review vehicle registration, driving licenses, and manage courier accounts</p>
        </div>
        <button
          onClick={refreshAgents}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by agent name, license number, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={verificationFilter}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setVerificationFilter(e.target.value);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Verification Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="NEEDS_REVISION">Needs Revision</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Agents Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading delivery agents...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : agents.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <Truck className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Delivery Agents Found</p>
          <p className="text-xs text-gray-500">Try clearing filters or search terms.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3.5">Agent Name</th>
                  <th className="px-4 py-3.5">Vehicle Type</th>
                  <th className="px-4 py-3.5">License Number</th>
                  <th className="px-4 py-3.5">Verification</th>
                  <th className="px-4 py-3.5">Account Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-gray-900">
                      {agent.user?.name}
                      <span className="text-[11px] text-gray-500 block font-normal">{agent.user?.email}</span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-800">{agent.vehicleType || "Not specified"}</td>
                    <td className="px-4 py-3.5 font-mono text-xs">{agent.licenseNumber || "N/A"}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          agent.verificationStatus === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : agent.verificationStatus === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {agent.verificationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          agent.user?.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {agent.user?.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openAgentDetail(agent.id)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="delivery-agent-detail-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 id="delivery-agent-detail-title" className="text-xl font-bold text-gray-900">{selectedAgent.user?.name}</h3>
                <p className="text-xs text-gray-500">Delivery Agent ID: {selectedAgent.id}</p>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block font-medium">Vehicle Type</span>
                <span className="font-bold text-gray-900">{selectedAgent.vehicleType || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Driving License</span>
                <span className="font-bold text-gray-900 font-mono">{selectedAgent.licenseNumber || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Email / Phone</span>
                <span className="font-bold text-gray-900">{selectedAgent.user?.email} • {selectedAgent.user?.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Verification Status</span>
                <span className="font-bold text-emerald-600 uppercase">{selectedAgent.verificationStatus}</span>
              </div>
            </div>

            <section className="space-y-3 border-t border-gray-100 pt-4" aria-labelledby="agent-payout-review-heading">
              <div className="flex items-center justify-between gap-3">
                <h4 id="agent-payout-review-heading" className="text-sm font-bold text-gray-900">Delivery-fee payment details</h4>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-700">{selectedAgent.payoutDetails?.verificationStatus?.replaceAll("_", " ") || "NOT SUBMITTED"}</span>
              </div>
              {selectedAgent.payoutDetails ? <>
                <div className="rounded-xl bg-gray-50 p-3 text-xs">
                  <span className="block text-gray-500">UPI ID</span>
                  <span className="mt-1 block break-all font-semibold text-gray-900">{selectedAgent.payoutDetails.upiId}</span>
                  <span className="mt-2 block text-gray-500">UPI account holder name</span>
                  <span className="mt-1 block break-words font-semibold text-gray-900">{selectedAgent.payoutDetails.accountHolderName || "Not provided"}</span>
                  {selectedAgent.payoutDetails.rejectionReason && <p className="mt-2 text-red-700">Reason: {selectedAgent.payoutDetails.rejectionReason}</p>}
                </div>
                {selectedAgent.payoutDetails.verificationStatus === "PENDING"
                  && (!selectedAgent.payoutDetails.upiId || !selectedAgent.payoutDetails.accountHolderName?.trim())
                  && <p className="text-xs text-amber-800">The agent must submit both the UPI ID and account holder name before approval.</p>}
                {selectedAgent.payoutDetails.verificationStatus === "PENDING" && <>
                  <label htmlFor="payout-rejection-reason" className="block text-xs font-semibold text-gray-700">Rejection reason (required to reject)</label>
                  <textarea id="payout-rejection-reason" value={payoutReviewReason} onChange={(event) => setPayoutReviewReason(event.target.value)} maxLength={2000} rows={2} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Explain what the agent should correct" />
                  {payoutReviewError && <p role="alert" className="text-xs font-medium text-red-700">{payoutReviewError}</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={payoutReviewing || !payoutReviewReason.trim()} onClick={() => reviewPayoutDetails("REJECT")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">{payoutReviewing ? "Saving…" : "Reject details"}</button>
                    <button type="button" disabled={payoutReviewing || !selectedAgent.payoutDetails.upiId || !selectedAgent.payoutDetails.accountHolderName?.trim()} onClick={() => reviewPayoutDetails("APPROVE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{payoutReviewing ? "Saving…" : "Approve details"}</button>
                  </div>
                </>}
                <p className="text-[11px] leading-5 text-gray-500">Approval records admin review of these submitted details; it does not independently verify account ownership or initiate a payout.</p>
              </> : <p className="text-xs text-gray-500">The agent has not submitted payout details.</p>}
            </section>

            {/* Documents */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" /> Verification Documents
              </h4>
              {selectedAgent.user?.verificationDocuments?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No verification documents found.</p>
              ) : (
                <div className="space-y-2">
                  {selectedAgent.user?.verificationDocuments?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{doc.documentType}</span>
                        <span className="text-gray-500 block text-[11px]">Status: {doc.verificationStatus}</span>
                      </div>
                      <a
                        href={doc.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100"
                      >
                        View Document
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => handleUpdateVerification(selectedAgent.id, "APPROVED")}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Agent
              </button>
              <button
                onClick={() => handleUpdateVerification(selectedAgent.id, "REJECTED")}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Agent
              </button>
              <button
                onClick={() => handleToggleAccountStatus(selectedAgent.id, selectedAgent.user?.status)}
                className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" /> {selectedAgent.user?.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmVariant={confirmModal.confirmVariant || "danger"}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </div>
  );
};

export default AdminDeliveryAgents;
