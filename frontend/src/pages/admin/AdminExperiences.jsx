import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import {
  Sparkles,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  MapPin,
  Clock,
  Users,
} from "lucide-react";

export const AdminExperiences = ({ experienceType = "HOME_DINING" }) => {
  const isWorkshopPage = experienceType === "WORKSHOP";
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState({});
  const searchRef = useRef(search);
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchExperiences = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllExperiences({
        type: experienceType,
        status: statusFilter || undefined,
        search: searchRef.current,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setExperiences(res.data || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load experiences list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter, experienceType]);

  const refreshExperiences = () => {
    setLoading(true);
    setError(null);
    void fetchExperiences();
  };

  useEffect(() => {
    fetchExperiences();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchExperiences]);

  const handleUpdateStatus = (id, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `Update Experience Status to ${newStatus}`,
      message: `Are you sure you want to mark this experience as ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          if (isWorkshopPage) {
            const rejectionReason = rejectionReasons[id]?.trim();
            await adminApi.reviewWorkshop(id, {
              action: newStatus === "PUBLISHED" ? "APPROVE" : "REJECT",
              ...(newStatus === "REJECTED" ? { rejectionReason } : {}),
            });
          } else {
            await adminApi.updateExperienceStatus(id, { status: newStatus });
          }
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          refreshExperiences();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" /> {isWorkshopPage ? "Workshop Review" : "Dine Management"}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{isWorkshopPage ? "Review workshop submissions from home cooks." : "View home-dining experiences and their current status."}</p>
        </div>
        <button
          onClick={refreshExperiences}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search ${isWorkshopPage ? "workshop" : "Dine experience"} title, location, kitchen...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && refreshExperiences()}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setStatusFilter(e.target.value);
            }}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="">All Statuses</option>
            {isWorkshopPage ? <>
              <option value="PENDING">Pending review</option>
              <option value="PUBLISHED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </> : <>
              <option value="PUBLISHED">Published</option>
              <option value="PAUSED">Paused</option>
              <option value="DRAFT">Draft</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </>}
          </select>
        </div>
      </div>

      {/* Experiences Grid */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading experiences...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : experiences.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No {isWorkshopPage ? "workshops" : "Dine experiences"} found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {experiences.map((exp) => (
            <div key={exp.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base text-gray-900 leading-snug">{exp.title}</h3>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                      ["APPROVED", "PUBLISHED"].includes(exp.status)
                        ? "bg-emerald-100 text-emerald-800"
                        : exp.status === "PENDING"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {exp.status}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-1 line-clamp-2">{exp.description}</p>

                {isWorkshopPage && (exp.image || exp.photos?.length > 0) && <img src={exp.photos?.[0] || exp.image} alt={`${exp.title} workshop`} className="mt-3 h-40 w-full rounded-xl object-cover" />}

                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-100">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-red-500" /> {exp.location}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-amber-500" /> {exp.durationMinutes} mins</span>
                  {isWorkshopPage && <span>Workshop theme / category: {exp.theme || "—"}</span>}
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-blue-500" /> Max {exp.maxGuests} guests</span>
                  <span className="font-bold text-gray-900">₹{exp.pricePerPerson} / person</span>
                </div>

                {isWorkshopPage && <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p><strong>What will be taught:</strong> {exp.teachingContent || "—"}</p>
                  <p><strong>Participants will learn:</strong> {exp.learningOutcomes || "—"}</p>
                  {exp.materialsToBring && <p><strong>Bring:</strong> {exp.materialsToBring}</p>}
                  <p className="font-semibold text-gray-800">Schedule and availability</p>
                  {exp.slots?.length ? exp.slots.map((slot) => <p key={slot.id}>{formatIstDateTime(slot.startsAt)} – {formatIstDateTime(slot.endsAt)} · {slot.availableSeats}/{slot.capacity} seats · {slot.status}</p>) : <p>No scheduled dates</p>}
                </div>}

                {isWorkshopPage && exp.status === "REJECTED" && exp.reviewRejectionReason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800"><strong>Rejection reason:</strong> {exp.reviewRejectionReason}</p>}

                <p className="text-[11px] text-gray-500 mt-2 font-medium">
                  Host Cook: <span className="font-bold text-gray-900">{exp.cook?.businessName}</span>{exp.cook?.user?.name ? ` · ${exp.cook.user.name}` : ""}
                </p>
              </div>

              {isWorkshopPage && exp.status === "PENDING" && <label className="block space-y-1 text-xs font-semibold text-gray-700">
                Rejection reason (required to reject)
                <textarea value={rejectionReasons[exp.id] || ""} onChange={(event) => setRejectionReasons((current) => ({ ...current, [exp.id]: event.target.value }))} maxLength={2000} rows={2} className="w-full rounded-lg border border-gray-200 p-2 font-normal" />
              </label>}

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                {isWorkshopPage && exp.status === "PENDING" && <>
                  <button onClick={() => handleUpdateStatus(exp.id, "PUBLISHED")} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1"> <CheckCircle className="w-3.5 h-3.5" /> Approve and publish</button>
                  <button disabled={(rejectionReasons[exp.id] || "").trim().length < 5} onClick={() => handleUpdateStatus(exp.id, "REJECTED")} className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 disabled:cursor-not-allowed disabled:opacity-50"><XCircle className="w-3.5 h-3.5" /> Reject</button>
                </>}
                {!isWorkshopPage && ["PENDING", "APPROVED", "REJECTED"].includes(exp.status) && <>
                  {exp.status !== "APPROVED" && <button onClick={() => handleUpdateStatus(exp.id, "APPROVED")} className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" />Approve</button>}
                  {exp.status !== "REJECTED" && <button onClick={() => handleUpdateStatus(exp.id, "REJECTED")} className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Reject</button>}
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </div>
  );
};

export default AdminExperiences;
