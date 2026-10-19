import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  UtensilsCrossed,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Ban,
} from "lucide-react";

const DishCardImage = ({ dish }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showFallback = !dish.image || imageFailed;

  return (
    <div className="-mx-5 -mt-5 flex h-44 items-center justify-center overflow-hidden bg-[#2B1B12]">
      {showFallback ? (
        <div className="p-4 text-center">
          <UtensilsCrossed className="mx-auto mb-1 h-10 w-10 text-[#F4A52A]/60" />
          <span className="text-[10px] text-white/60">No photo available</span>
        </div>
      ) : (
        <img
          src={dish.image}
          alt={dish.name ? `${dish.name} dish` : "Dish"}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
};

export const AdminDishes = () => {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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

  const fetchDishes = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllDishes({
        search: searchRef.current,
        status: statusFilter || undefined,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setDishes(res.data.dishes || []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load dishes list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [statusFilter]);

  const refreshDishes = () => {
    setLoading(true);
    setError(null);
    void fetchDishes();
  };

  useEffect(() => {
    fetchDishes();
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchDishes]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    refreshDishes();
  };

  const handleUpdateDishStatus = (dishId, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `Update Dish Status to ${newStatus}`,
      message: `Are you sure you want to change this dish's status to ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateDishStatus(dishId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          refreshDishes();
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
            <UtensilsCrossed className="w-6 h-6 text-red-600" /> Dish Management & Moderation
          </h2>
          <p className="text-xs text-gray-500 mt-1">Review home kitchen menu items, approve new dishes, and unpublish non-compliant listings</p>
        </div>
        <button
          onClick={refreshDishes}
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
            placeholder="Search dish name, description, cuisine..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </form>

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
            <option value="PUBLISHED">Published</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="UNPUBLISHED">Unpublished</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Dishes Grid */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading dishes...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : dishes.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <UtensilsCrossed className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Dishes Found</p>
          <p className="text-xs text-gray-500">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dishes.map((dish) => (
            <div key={dish.id} className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs space-y-3 flex flex-col justify-between">
              <DishCardImage key={`${dish.id}:${dish.image || "no-image"}`} dish={dish} />
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-gray-900 line-clamp-1">{dish.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase shrink-0 ${
                      dish.status === "PUBLISHED"
                        ? "bg-emerald-100 text-emerald-800"
                        : dish.status === "PENDING_APPROVAL"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {dish.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{dish.description || "No description provided."}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="font-extrabold text-red-600 text-sm">₹{dish.price}</span>
                  <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">{dish.cuisine}</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-2 font-medium">
                  Cook Kitchen: <span className="text-gray-900 font-bold">{dish.cook?.businessName}</span>
                </p>
                {dish.status === "PENDING_APPROVAL" && (
                  <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    <summary className="cursor-pointer font-semibold">Review recipe and story</summary>
                    <div className="mt-2 space-y-2">
                      <p><strong>Ingredients:</strong> {dish.ingredients?.length ? dish.ingredients.join(", ") : "Not provided"}</p>
                      <p><strong>Instructions:</strong> {dish.instructions || "Not provided"}</p>
                      <p><strong>Recipe taught by:</strong> {dish.story?.whoTaught || "Not provided"}</p>
                      <p><strong>Story:</strong> {dish.story?.storyText || "Not provided"}</p>
                    </div>
                  </details>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
                {dish.status === "PENDING_APPROVAL" && (
                  <button
                    onClick={() => handleUpdateDishStatus(dish.id, "PUBLISHED")}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Approve & Publish
                  </button>
                )}
                {dish.status === "PUBLISHED" && (
                  <button
                    onClick={() => handleUpdateDishStatus(dish.id, "UNPUBLISHED")}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> Unpublish
                  </button>
                )}
                {dish.status === "PENDING_APPROVAL" && (
                  <button
                    onClick={() => handleUpdateDishStatus(dish.id, "REJECTED")}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject Listing
                  </button>
                )}
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

export default AdminDishes;
