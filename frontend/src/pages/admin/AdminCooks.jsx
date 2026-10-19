import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import DocumentPreviewButton from "../../components/admin/DocumentPreviewButton.jsx";
import { getLatestFssaiDocument, getOtherVerificationDocuments } from "../../utils/adminCookDocuments.js";
import {
  ChefHat,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Loader2,
  RefreshCw,
  FileText,
  Ban,
  ShieldCheck,
  X,
} from "lucide-react";

export const AdminCooks = () => {
  const [cooks, setCooks] = useState([]);
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

  // Detail Modal State
  const [selectedCook, setSelectedCook] = useState(null);
  const [fssaiDecision, setFssaiDecision] = useState({ action: null, reason: "", expiryDate: "", loading: false });

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchCooks = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllCooks({
        search: searchRef.current,
        verificationStatus: verificationFilter || undefined,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setCooks(res.data.cooks || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load cooks list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [verificationFilter]);

  const refreshCooks = () => {
    setLoading(true);
    setError(null);
    void fetchCooks();
  };

  useEffect(() => {
    fetchCooks();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchCooks]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    refreshCooks();
  };

  const openCookDetail = async (cookId) => {
    try {
      const res = await adminApi.getCookById(cookId);
      setSelectedCook(res.data);
    } catch (err) {
      alert("Failed to load cook details: " + err.message);
    }
  };

  // Decision Modal State for verification (reasons & FSSAI approval)
  const [decisionModal, setDecisionModal] = useState({
    isOpen: false,
    cookId: null,
    cookName: "",
    status: null,
    reason: "",
    isApprovedToSell: false,
    loading: false,
  });

  const openDecisionModal = (cook, status) => {
    setDecisionModal({
      isOpen: true,
      cookId: cook.id,
      cookName: cook.businessName || cook.user?.name || "Cook",
      status,
      reason: "",
      isApprovedToSell: cook.isApprovedToSell === true,
      loading: false,
    });
  };

  const handleConfirmDecision = async (e) => {
    e.preventDefault();
    const { cookId, status, reason, isApprovedToSell } = decisionModal;
    if (!cookId || !status) return;

    if (status !== "APPROVED" && !reason.trim()) {
      return alert(`Please provide a reason when ${status === "REJECTED" ? "rejecting" : "requesting revisions for"} an application.`);
    }

    try {
      setDecisionModal((prev) => ({ ...prev, loading: true }));
      await adminApi.updateCookVerification(cookId, {
        verificationStatus: status,
        revisionReason: status === "NEEDS_REVISION" ? reason.trim() : undefined,
        rejectionReason: status === "REJECTED" ? reason.trim() : undefined,
        isApprovedToSell: status === "APPROVED" ? isApprovedToSell : false,
      });

      setDecisionModal({ isOpen: false, cookId: null, cookName: "", status: null, reason: "", isApprovedToSell: false, loading: false });
      if (selectedCook && selectedCook.id === cookId) {
        openCookDetail(cookId);
      }
      refreshCooks();
    } catch (err) {
      alert("Error updating verification: " + err.message);
      setDecisionModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const submitFssaiDecision = async (event) => {
    event.preventDefault();
    if (!selectedCook || !fssaiDecision.action) return;
    if (fssaiDecision.action !== "APPROVE" && !fssaiDecision.reason.trim()) return;
    const document = getLatestFssaiDocument(selectedCook.user?.verificationDocuments || []);
    try {
      setFssaiDecision((current) => ({ ...current, loading: true }));
      await adminApi.reviewCookFssai(selectedCook.id, {
        action: fssaiDecision.action,
        documentId: document?.id,
        rejectionReason: fssaiDecision.reason.trim() || undefined,
        fssaiExpiryDate: fssaiDecision.action === "APPROVE" ? fssaiDecision.expiryDate || undefined : undefined,
      });
      setFssaiDecision({ action: null, reason: "", expiryDate: "", loading: false });
      await openCookDetail(selectedCook.id);
    } catch (err) {
      alert("Could not save FSSAI review: " + (err.response?.data?.message || err.message));
      setFssaiDecision((current) => ({ ...current, loading: false }));
    }
  };

  const handleToggleAccountStatus = (cookId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Cook Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this cook account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateCookAccountStatus(cookId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedCook && selectedCook.id === cookId) {
            openCookDetail(cookId);
          }
          refreshCooks();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const verificationDocuments = selectedCook?.user?.verificationDocuments || [];
  const latestFssaiDocument = getLatestFssaiDocument(verificationDocuments);
  const otherVerificationDocuments = getOtherVerificationDocuments(verificationDocuments);
  const latestFssaiIsPending = latestFssaiDocument?.verificationStatus === "PENDING";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-amber-500" /> Cook Management
          </h2>
          <p className="text-xs text-gray-500 mt-1">Verify kitchen applications, manage profiles and monitor status</p>
        </div>
        <button
          onClick={refreshCooks}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by kitchen name, cook name, email..."
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

      {/* Cooks Table */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading cooks...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : cooks.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <ChefHat className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Cooks Found</p>
          <p className="text-xs text-gray-500">Try clearing filters or search terms.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3.5">Kitchen / Cook</th>
                  <th className="px-4 py-3.5">Specialization</th>
                  <th className="px-4 py-3.5">Verification</th>
                  <th className="px-4 py-3.5">Account Status</th>
                  <th className="px-4 py-3.5">Dishes / Orders</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cooks.map((cook) => (
                  <tr key={cook.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-4 py-3.5">
                      <span className="font-bold text-gray-900 block">{cook.businessName}</span>
                      <span className="text-[11px] text-gray-500">{cook.user?.name} ({cook.user?.email})</span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-gray-800">{cook.specialization || "General"}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                          cook.verificationStatus === "APPROVED"
                            ? "bg-emerald-100 text-emerald-800"
                            : cook.verificationStatus === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : cook.verificationStatus === "NEEDS_REVISION"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {cook.verificationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          cook.user?.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        }`}
                      >
                        {cook.user?.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-700 font-medium">
                      {cook._count?.dishes ?? 0} Dishes • {cook._count?.orders ?? 0} Orders
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openCookDetail(cook.id)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cook Detail Modal */}
      {selectedCook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedCook.businessName}</h3>
                <p className="text-xs text-gray-500">Cook Profile ID: {selectedCook.id}</p>
              </div>
              <button
                onClick={() => setSelectedCook(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Application Overview Sections */}
            <div className="space-y-4 text-xs">
              {/* 1. Basic & Culinary Profile */}
              <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 space-y-2">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5 text-amber-800">
                  <ChefHat className="w-4 h-4 text-amber-600" /> Cook & Kitchen Profile
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">Owner Name</span>
                    <span className="font-bold text-gray-900">{selectedCook.user?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Contact Details</span>
                    <span className="font-bold text-gray-900">{selectedCook.user?.email} • {selectedCook.user?.phone || "No phone"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Cooking Experience</span>
                    <span className="font-bold text-gray-900">{selectedCook.experienceYears || "Not specified"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Specialization</span>
                    <span className="font-bold text-gray-900">{selectedCook.specialization || "General"}</span>
                  </div>
                </div>

                {selectedCook.bio && (
                  <div className="pt-2 border-t border-orange-100/60">
                    <span className="text-gray-500 block font-medium">Introduction / Story</span>
                    <p className="text-gray-800 italic mt-0.5 whitespace-pre-line">{selectedCook.bio}</p>
                  </div>
                )}

                {/* Regional Cuisines & Dietary Preferences */}
                <div className="pt-2 border-t border-orange-100/60 flex flex-wrap gap-4">
                  {selectedCook.cuisines?.length > 0 && (
                    <div>
                      <span className="text-gray-500 block font-medium mb-1">Regional Cuisines</span>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(selectedCook.cuisines) ? selectedCook.cuisines : [selectedCook.cuisines]).map((c, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCook.dietaryPreferences?.length > 0 && (
                    <div>
                      <span className="text-gray-500 block font-medium mb-1">Dietary Preferences</span>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(selectedCook.dietaryPreferences) ? selectedCook.dietaryPreferences : [selectedCook.dietaryPreferences]).map((d, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-semibold text-[10px]">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCook.signatureDishes && (
                    <div className="w-full">
                      <span className="text-gray-500 block font-medium">Signature Dishes</span>
                      <span className="text-gray-800 font-semibold">{selectedCook.signatureDishes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Operations, Location & Availability */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                <h4 className="font-bold text-gray-900 text-xs">Operations & Operating Area</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">City & Locality</span>
                    <span className="font-bold text-gray-900">{selectedCook.locality || "N/A"}, {selectedCook.city || "N/A"}</span>
                  </div>
                  <div><span className="text-gray-500 block font-medium">Registration type</span><span className="font-semibold text-gray-900">{selectedCook.fssaiStatusType?.replaceAll("_", " ") || "Not specified"}</span></div>
                  <div><span className="text-gray-500 block font-medium">FoSCoS application reference</span><span className="font-semibold text-gray-900">{selectedCook.fssaiApplicationReference || "Not recorded"}</span></div>
                  <div><span className="text-gray-500 block font-medium">Expiry date</span><span className="font-semibold text-gray-900">{selectedCook.fssaiExpiryDate ? new Date(selectedCook.fssaiExpiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Not recorded"}</span></div>
                  <div>
                    <span className="text-gray-500 block font-medium">Daily Capacity</span>
                    <span className="font-bold text-gray-900">{selectedCook.cookingCapacity || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Preparation Lead Notice</span>
                    <span className="font-bold text-gray-900">{selectedCook.prepTimeNotice || "N/A"}</span>
                  </div>
                </div>
                {latestFssaiDocument ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-blue-100">
                    <DocumentPreviewButton document={latestFssaiDocument} label={`Preview current FSSAI document (${latestFssaiDocument.fileName || "file"})`} />
                    <span className="text-xs text-gray-600">Latest document: {latestFssaiDocument.verificationStatus?.replaceAll("_", " ") || "Status unavailable"}</span>
                    {latestFssaiIsPending && <>
                      <button type="button" onClick={() => setFssaiDecision({ action: "APPROVE", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Approve FSSAI</button>
                      <button type="button" onClick={() => setFssaiDecision({ action: "REJECT", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Reject</button>
                      <button type="button" onClick={() => setFssaiDecision({ action: "REQUEST_NEW_DOCUMENT", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold">Request new document</button>
                    </>}
                    {(latestFssaiDocument.rejectionReason || selectedCook.fssaiRejectionReason) && (
                      <p className="w-full text-xs text-red-700">Review reason: {latestFssaiDocument.rejectionReason || selectedCook.fssaiRejectionReason}</p>
                    )}
                  </div>
                ) : (
                  <p className="pt-2 border-t border-blue-100 text-xs text-gray-500">No FSSAI document has been uploaded.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200/50">
                  <div>
                    <span className="text-gray-500 block font-medium">Available Days</span>
                    <span className="font-semibold text-gray-800">
                      {Array.isArray(selectedCook.availableDays) ? selectedCook.availableDays.join(", ") : (selectedCook.availableDays || "All days")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Meal Slots</span>
                    <span className="font-semibold text-gray-800">
                      {Array.isArray(selectedCook.availableMealSlots) ? selectedCook.availableMealSlots.join(", ") : (selectedCook.availableMealSlots || "Lunch, Dinner")}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between">
                  <span className="text-gray-600 font-medium">Hygienic Home Kitchen Declared:</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${selectedCook.isHomeKitchenDeclared ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    {selectedCook.isHomeKitchenDeclared ? "YES, VERIFIED BY APPLICANT" : "PENDING"}
                  </span>
                </div>
              </div>

              {/* 3. FSSAI & Legal Compliance */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2">
                <h4 className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> FSSAI Compliance & Selling Status
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">FSSAI registration number</span>
                    <span className="font-bold text-gray-900">{selectedCook.fssaiNumber || "Not registered / pending"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">FSSAI Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      selectedCook.fssaiStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" : selectedCook.fssaiStatus === "REJECTED" || selectedCook.fssaiStatus === "EXPIRED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {selectedCook.fssaiStatus || "NOT_SUBMITTED"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Selling Authorized</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      selectedCook.isApprovedToSell ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}>
                      {selectedCook.isApprovedToSell ? "AUTHORIZED TO SELL" : "BLOCKED (FSSAI REQUIRED)"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-100/60 flex items-center justify-between text-[11px]">
                  <span className="text-gray-600">
                    Food Safety Consent: <strong className="text-gray-900">{selectedCook.foodSafetyConsent ? "Accepted" : "No"}</strong>
                    {selectedCook.foodSafetyAgreementVersion ? ` (${selectedCook.foodSafetyAgreementVersion})` : ""}
                  </span>
                  {selectedCook.foodSafetyConsentAt && (
                    <span className="text-gray-500">
                      Timestamp: {new Date(selectedCook.foodSafetyConsentAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Revision / Rejection Note */}
              {(selectedCook.revisionReason || selectedCook.rejectionReason) && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                  <span className="font-bold block">
                    {selectedCook.revisionReason ? "Admin Revision Reason:" : "Admin Rejection Reason:"}
                  </span>
                  <p className="text-xs">{selectedCook.revisionReason || selectedCook.rejectionReason}</p>
                </div>
              )}
            </div>

            {/* Submitted Documents */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" /> Submitted Documents
              </h4>
              {otherVerificationDocuments.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No other verification documents uploaded. The latest FSSAI document is shown above.</p>
              ) : (
                <div className="space-y-2">
                  {otherVerificationDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{doc.documentType}</span>
                        {doc.documentNumber && <span className="text-gray-500 block text-[11px]">Number: {doc.documentNumber}</span>}
                        <span className="text-gray-500 block text-[11px]">Status: {doc.verificationStatus}</span>
                        {doc.rejectionReason && (
                          <span className="text-red-600 block text-[11px] font-medium">Note: {doc.rejectionReason}</span>
                        )}
                      </div>
                      <DocumentPreviewButton document={doc} label="Preview Document" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => openDecisionModal(selectedCook, "APPROVED")}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Cook
              </button>
              <button
                onClick={() => openDecisionModal(selectedCook, "NEEDS_REVISION")}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5" /> Request Revision
              </button>
              <button
                onClick={() => openDecisionModal(selectedCook, "REJECTED")}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Cook
              </button>
              <button
                onClick={() => handleToggleAccountStatus(selectedCook.id, selectedCook.user?.status)}
                className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" /> {selectedCook.user?.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Decision Modal */}
      {decisionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <form onSubmit={handleConfirmDecision} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {decisionModal.status === "APPROVED"
                  ? `Approve Cook: ${decisionModal.cookName}`
                  : decisionModal.status === "REJECTED"
                  ? `Reject Application: ${decisionModal.cookName}`
                  : `Request Revisions: ${decisionModal.cookName}`}
              </h3>
              <button
                type="button"
                onClick={() => setDecisionModal((p) => ({ ...p, isOpen: false }))}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {decisionModal.status === "APPROVED" ? (
              <div className="space-y-3 text-xs">
                <p className="text-gray-600">
                  Approving will upgrade the user's account role to <strong>COOK</strong> and activate their culinary profile.
                </p>

                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                  <p className="text-blue-900">Cook Panel access and FSSAI verification are reviewed separately.</p>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={decisionModal.isApprovedToSell}
                      onChange={(e) => setDecisionModal((p) => ({ ...p, isApprovedToSell: e.target.checked }))}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span className="font-semibold text-gray-800">
                      Enable Selling on TasteBridge (Cook is permitted to receive customer orders)
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                  Reason for {decisionModal.status === "REJECTED" ? "Rejection" : "Revision Request"} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={decisionModal.reason}
                  onChange={(e) => setDecisionModal((p) => ({ ...p, reason: e.target.value }))}
                  placeholder={`Provide clear guidance for ${decisionModal.cookName} on what needs correction...`}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDecisionModal((p) => ({ ...p, isOpen: false }))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={decisionModal.loading}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  decisionModal.status === "APPROVED"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : decisionModal.status === "REJECTED"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {decisionModal.loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Decision
              </button>
            </div>
          </form>
        </div>
      )}

      {fssaiDecision.action && selectedCook && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <form onSubmit={submitFssaiDecision} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900">{fssaiDecision.action === "APPROVE" ? "Approve FSSAI details" : fssaiDecision.action === "REJECT" ? "Reject FSSAI details" : "Request a new FSSAI document"}</h3>
            {fssaiDecision.action === "APPROVE" ? <label className="block text-xs font-semibold">Expiry date *<input required type="date" value={fssaiDecision.expiryDate} onChange={(e) => setFssaiDecision((state) => ({ ...state, expiryDate: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label> : <label className="block text-xs font-semibold">Reason (required)<textarea required value={fssaiDecision.reason} onChange={(e) => setFssaiDecision((state) => ({ ...state, reason: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" rows={3} /></label>}
            <div className="flex justify-end gap-2"><button type="button" disabled={fssaiDecision.loading} onClick={() => setFssaiDecision({ action: null, reason: "", expiryDate: "", loading: false })} className="rounded-lg bg-gray-100 px-3 py-2 text-xs">Cancel</button><button disabled={fssaiDecision.loading} className="rounded-lg bg-[#D2552B] px-3 py-2 text-xs font-bold text-white">{fssaiDecision.loading ? "Saving..." : "Confirm"}</button></div>
          </form>
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

export default AdminCooks;
