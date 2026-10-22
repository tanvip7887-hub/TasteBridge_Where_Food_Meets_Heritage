import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  UtensilsCrossed,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Ban,
  ChevronLeft,
  ChevronRight,
  X,
  ChefHat,
} from "lucide-react";

const statusOptions = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING_APPROVAL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Unpublished", value: "UNPUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Rejected", value: "REJECTED" },
];

const statusClasses = (status) => ({
  PUBLISHED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING_APPROVAL: "border-amber-200 bg-amber-50 text-amber-800",
  UNPUBLISHED: "border-gray-200 bg-gray-50 text-gray-700",
  DRAFT: "border-gray-200 bg-gray-50 text-gray-700",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const DishSkeleton = () => <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="aspect-[4/3] animate-pulse bg-gray-100" /><div className="space-y-3 p-4"><div className="h-5 w-3/4 animate-pulse rounded bg-gray-100" /><div className="h-3 w-full animate-pulse rounded bg-gray-100" /><div className="h-3 w-2/3 animate-pulse rounded bg-gray-100" /><div className="h-10 w-full animate-pulse rounded-xl bg-gray-100" /></div></div>;

const DishCardImage = ({ dish }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const showFallback = !dish.image || imageFailed;

  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-orange-50">
      {showFallback ? (
        <div className="p-4 text-center">
          <UtensilsCrossed className="mx-auto h-10 w-10 text-[#D2552B]/50" />
        </div>
      ) : (
        <img
          src={dish.image}
          alt={dish.name || "Dish"}
          loading="lazy"
          width="480"
          height="360"
          className={`h-full w-full object-cover ${dish.status === "UNPUBLISHED" ? "opacity-70 grayscale-[20%]" : ""}`}
          onError={() => setImageFailed(true)}
        />
      )}
      <span className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/95 px-2.5 py-1 text-xs font-semibold shadow-sm ${statusClasses(dish.status)}`} aria-label={`Dish status: ${dish.status?.replaceAll("_", " ") || "Unknown"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{dish.status?.replaceAll("_", " ") || "Unknown"}</span>
      {dish.status === "PENDING_APPROVAL" && <span className="absolute left-0 top-0 h-full w-[3px] bg-amber-400" aria-hidden="true" />}
    </div>
  );
};

export const AdminDishes = () => {
  const [dishes, setDishes] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageLimit = 10;
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();
      if (nextSearch !== debouncedSearch) {
        setLoading(true);
        setError(null);
        setDebouncedSearch(nextSearch);
        setPage(1);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const fetchDishes = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllDishes({
        search: debouncedSearch,
        status: statusFilter || undefined,
        page,
        limit: pageLimit,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setDishes(res.data.dishes || []);
      setPagination(res.data.pagination || null);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load dishes list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, page]);

  const refreshDishes = () => {
    setLoading(true);
    setError(null);
    void fetchDishes();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchDishes(); }, 0);
    const refetchWhenVisible = () => { if (document.visibilityState === "visible") void fetchDishes(); };
    window.addEventListener("focus", refetchWhenVisible);
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      window.clearTimeout(initialRequest);
      window.removeEventListener("focus", refetchWhenVisible);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchDishes]);

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

  const pageCount = Math.max(1, pagination?.pages || 1);
  const currentPage = Math.min(page, pageCount);
  const fullResultLoaded = pagination?.pages === 1 || pagination?.total === 0;
  const countsByStatus = dishes.reduce((counts, dish) => {
    counts[dish.status] = (counts[dish.status] || 0) + 1;
    return counts;
  }, {});
  const totalDishes = pagination?.total ?? dishes.length;
  const summaryCanCount = fullResultLoaded && !debouncedSearch && !statusFilter;
  const summaryCards = [
    { label: "Total dishes", value: totalDishes, caption: "Across all kitchens", icon: UtensilsCrossed, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Published", value: summaryCanCount ? countsByStatus.PUBLISHED || 0 : "—", caption: summaryCanCount ? "Live on marketplace" : "Count unavailable across pages", icon: CheckCircle, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending review", value: summaryCanCount ? countsByStatus.PENDING_APPROVAL || 0 : "—", caption: summaryCanCount ? "Waiting for approval" : "Count unavailable across pages", icon: Loader2, tint: summaryCanCount && (countsByStatus.PENDING_APPROVAL || 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600", pending: summaryCanCount && (countsByStatus.PENDING_APPROVAL || 0) > 0 },
    { label: "Unpublished", value: summaryCanCount ? (countsByStatus.UNPUBLISHED || 0) + (countsByStatus.DRAFT || 0) + (countsByStatus.REJECTED || 0) : "—", caption: summaryCanCount ? "Hidden from customers" : "Count unavailable across pages", icon: Ban, tint: "bg-gray-100 text-gray-600" },
  ];
  const filtersActive = Boolean(search || statusFilter);
  const clearFilters = () => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setStatusFilter(""); setPage(1); };
  const rangeStart = dishes.length ? (currentPage - 1) * (pagination?.limit || pageLimit) + 1 : 0;
  const rangeEnd = Math.min(currentPage * (pagination?.limit || pageLimit), pagination?.total ?? dishes.length);
  const kitchenName = (dish) => dish.cook?.businessName || "Kitchen not listed";

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
      <section aria-label="Dish summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && dishes.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-20 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-gray-600">{card.pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Pending dishes need review" />}{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
      </section>

      <section aria-label="Dish filters" className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Search by dish, cuisine or kitchen" placeholder="Search by dish, cuisine or kitchen" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
              {search && <button type="button" onClick={() => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
            </form>
            <p className="whitespace-nowrap text-sm text-gray-500">Showing {dishes.length ? rangeStart : 0}–{rangeEnd} of {pagination?.total ?? dishes.length} dishes</p>
          </div>
          <div role="group" aria-label="Filter dishes by status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {statusOptions.map((option) => <button key={option.value || "ALL"} type="button" aria-pressed={statusFilter === option.value} onClick={() => { setLoading(true); setError(null); setStatusFilter(option.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === option.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{option.label}{summaryCanCount && <span className={`text-xs ${statusFilter === option.value ? "text-white/80" : "text-gray-400"}`}>{option.value ? countsByStatus[option.value] || 0 : totalDishes}</span>}{option.value === "PENDING_APPROVAL" && summaryCanCount && (countsByStatus.PENDING_APPROVAL || 0) > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Pending dishes need review" />}</button>)}
          </div>
        </div>

        {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshDishes} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></section> : loading ? <section aria-label="Loading dishes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <DishSkeleton key={index} />)}</section> : dishes.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><UtensilsCrossed className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No dishes found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Clear filters</button>}</section> : <section aria-label="Dish listings" className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dishes.map((dish) => <article key={dish.id} className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${dish.status === "PENDING_APPROVAL" ? "border-t-[3px] border-t-amber-400" : ""}`}>
            <DishCardImage key={`${dish.id}:${dish.image || "no-image"}`} dish={dish} />
            <div className="flex flex-1 flex-col p-4">
              <div className="flex min-w-0 items-start justify-between gap-3"><h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[#2B1B12]" title={dish.name}>{dish.name}</h2><span className="shrink-0 text-sm font-bold text-[#2B1B12]">₹{Number(dish.price || 0).toFixed(2)}</span></div>
              <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-gray-600" title={dish.description || "No description"}>{dish.description || "No description"}</p>
              <div className="mt-3 flex min-w-0 items-center gap-2"><span className="max-w-[60%] truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm text-gray-600" title={dish.category?.name || dish.cuisine}>{dish.category?.name || dish.cuisine || "Cuisine not added"}</span>{typeof dish.isVegetarian === "boolean" && <span className={`shrink-0 rounded-full border px-2.5 py-1 text-sm ${dish.isVegetarian ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-800"}`}>{dish.isVegetarian ? "Vegetarian" : "Non-vegetarian"}</span>}</div>
              <div className="mt-4 flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-50 text-[#D2552B]">{dish.cook?.profileImage ? <img src={dish.cook.profileImage} alt={`${kitchenName(dish)} kitchen`} loading="lazy" className="h-full w-full object-cover" /> : <ChefHat className="h-4 w-4" />}</span><span className="truncate text-sm font-semibold text-gray-800" title={kitchenName(dish)}>{kitchenName(dish)}</span></div>
              {dish.status === "PENDING_APPROVAL" && <details className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"><summary className="min-h-8 cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Review recipe and story</summary><div className="mt-2 space-y-2"><p className="break-words"><strong>Ingredients:</strong> {dish.ingredients?.length ? dish.ingredients.join(", ") : "Not provided"}</p><p className="break-words"><strong>Instructions:</strong> {dish.instructions || "Not provided"}</p><p className="break-words"><strong>Recipe taught by:</strong> {dish.story?.whoTaught || "Not provided"}</p><p className="break-words"><strong>Story:</strong> {dish.story?.storyText || "Not provided"}</p></div></details>}
              <footer className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">{dish.status === "PENDING_APPROVAL" && <><button type="button" onClick={() => handleUpdateDishStatus(dish.id, "PUBLISHED")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#D2552B] px-3 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><CheckCircle className="h-4 w-4" />Approve</button><button type="button" onClick={() => handleUpdateDishStatus(dish.id, "REJECTED")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><XCircle className="h-4 w-4" />Reject</button></>}{dish.status === "PUBLISHED" && <button type="button" onClick={() => handleUpdateDishStatus(dish.id, "UNPUBLISHED")} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Ban className="h-4 w-4" />Unpublish</button>}</footer>
            </div>
          </article>)}
        </section>}
        {!loading && !error && dishes.length > 0 && <footer className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {rangeStart}–{rangeEnd} of {pagination?.total ?? dishes.length} dishes</p><nav aria-label="Dish list pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setLoading(true); setPage(pageNumber); }} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>}
      </section>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </main>
  );
};

export default AdminDishes;
