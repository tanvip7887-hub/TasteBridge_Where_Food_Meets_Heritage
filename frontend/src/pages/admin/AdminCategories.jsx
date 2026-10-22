import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Tag,
  Plus,
  Search,
  Loader2,
  FolderPlus,
  Edit2,
  X,
  Layers,
  Utensils,
  Check,
  EyeOff,
} from "lucide-react";

const CategorySkeleton = () => <div className="min-h-52 animate-pulse rounded-2xl border border-gray-200 bg-white p-5"><div className="flex items-center justify-between"><div className="h-10 w-10 rounded-xl bg-gray-100" /><div className="h-6 w-16 rounded-full bg-gray-100" /></div><div className="mt-4 h-5 w-36 max-w-full rounded bg-gray-100" /><div className="mt-3 h-3 w-full rounded bg-gray-100" /><div className="mt-2 h-3 w-3/4 rounded bg-gray-100" /><div className="mt-6 h-8 w-24 rounded-full bg-gray-100" /></div>;

export const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // null for create, category object for edit
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  const fetchCategories = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.getFoodCategories();
      setCategories(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load food categories.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCategories = () => {
    setLoading(true);
    setError(null);
    void fetchCategories();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchCategories(); }, 0);
    const refetchWhenVisible = () => { if (document.visibilityState === "visible") void fetchCategories(); };
    window.addEventListener("focus", refetchWhenVisible);
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      window.clearTimeout(initialRequest);
      window.removeEventListener("focus", refetchWhenVisible);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
    };
  }, [fetchCategories]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setImage("");
    setModalOpen(true);
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setName(cat.name || "");
    setDescription(cat.description || "");
    setImage(cat.image || "");
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert("Category name is required.");

    try {
      setSubmitting(true);
      if (editingCategory) {
        await adminApi.updateFoodCategory(editingCategory.id, {
          name: name.trim(),
          description: description.trim(),
          image: image.trim() || undefined,
        });
      } else {
        await adminApi.createFoodCategory({
          name: name.trim(),
          description: description.trim(),
          image: image.trim() || undefined,
        });
      }
      setModalOpen(false);
      refreshCategories();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = (cat) => {
    const nextState = !cat.isActive;
    setConfirmModal({
      isOpen: true,
      title: `${nextState ? "Activate" : "Deactivate"} Category`,
      message: `Are you sure you want to ${nextState ? "activate" : "deactivate"} '${cat.name}'?${!nextState && (cat._count?.dishes || 0) > 0 ? ` This category has ${cat._count.dishes} associated ${cat._count.dishes === 1 ? "dish" : "dishes"}.` : ""}`,
      confirmVariant: nextState ? "emerald" : "warning",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateFoodCategory(cat.id, { isActive: nextState });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          refreshCategories();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const counts = categories.reduce((result, category) => {
    const key = category.isActive ? "ACTIVE" : "INACTIVE";
    result[key] += 1;
    result.NO_DISHES += (category._count?.dishes ?? 0) === 0 ? 1 : 0;
    return result;
  }, { ACTIVE: 0, INACTIVE: 0, NO_DISHES: 0 });
  const filteredCategories = useMemo(() => categories.filter((category) => {
    const query = debouncedSearch.toLowerCase();
    const matchesSearch = !query || category.name?.toLowerCase().includes(query) || category.description?.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "ALL" || (statusFilter === "ACTIVE" ? category.isActive : !category.isActive);
    return matchesSearch && matchesStatus;
  }), [categories, debouncedSearch, statusFilter]);
  const filtersActive = Boolean(search || statusFilter !== "ALL");
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setStatusFilter("ALL"); };

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
      <section aria-label="Category summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && categories.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-20 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : <>
          <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">Total categories</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-[#D2552B]"><Tag className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{categories.length}</p><p className="mt-2 text-[13px] text-gray-500">Regional cuisines</p></article>
          <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">Active</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{counts.ACTIVE}</p><p className="mt-2 text-[13px] text-gray-500">Visible to customers</p></article>
          <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">Inactive</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600"><EyeOff className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{counts.INACTIVE}</p><p className="mt-2 text-[13px] text-gray-500">Hidden from customers</p></article>
          <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">Without dishes</span><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Utensils className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{counts.NO_DISHES}</p><p className="mt-2 text-[13px] text-gray-500">No dishes yet</p></article>
        </>}
      </section>

      <section aria-label="Category tools" className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(380px,38vw)]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Search categories" placeholder="Search categories" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
              {search && <button type="button" onClick={() => { setSearch(""); setDebouncedSearch(""); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
            </form>
            <div role="group" aria-label="Filter categories by status" className="flex max-w-full gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ label: "All", value: "ALL", count: categories.length }, { label: "Active", value: "ACTIVE", count: counts.ACTIVE }, { label: "Inactive", value: "INACTIVE", count: counts.INACTIVE }].map((filter) => <button key={filter.value} type="button" aria-pressed={statusFilter === filter.value} onClick={() => setStatusFilter(filter.value)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === filter.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{filter.label}<span className={`text-xs ${statusFilter === filter.value ? "text-white/80" : "text-gray-400"}`}>{filter.count}</span></button>)}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:justify-end"><p className="whitespace-nowrap text-sm text-gray-500">Showing {filteredCategories.length} of {categories.length} categories</p><button type="button" onClick={openCreateModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] sm:ml-2"><Plus className="h-4 w-4" />Add Category</button></div>
        </div>

        {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshCategories} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></section> : loading ? <section aria-label="Loading categories" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <CategorySkeleton key={index} />)}</section> : filteredCategories.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Layers className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No categories found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or add a new category.</p><div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">{filtersActive && <button type="button" onClick={clearFilters} className="min-h-11 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button>}<button type="button" onClick={openCreateModal} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Plus className="h-4 w-4" />Add Category</button></div></section> : <section aria-label="Food categories" className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCategories.map((category) => <article key={category.id} className={`flex min-h-56 flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md ${category.isActive ? "" : "text-gray-500"}`}>
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#D2552B]"><Tag className="h-5 w-5" /></span><h2 className="min-w-0 flex-1 truncate text-base font-semibold text-[#2B1B12]" title={category.name}>{category.name}</h2><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${category.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-600"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{category.isActive ? "Active" : "Inactive"}</span></div>
            <p className={`mt-4 line-clamp-2 min-h-10 text-sm leading-5 ${category.isActive ? "text-gray-600" : "text-gray-500"}`} title={category.description || "No description"}>{category.description || "No description"}</p>
            <span className={`mt-4 inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-medium ${category._count?.dishes ? "border-orange-100 bg-orange-50 text-[#9C3E20]" : "border-gray-200 bg-gray-50 text-gray-500"}`}>{category._count?.dishes ?? 0} {(category._count?.dishes ?? 0) === 1 ? "dish" : "dishes"}</span>
            <footer className="mt-auto flex items-center justify-between gap-3 border-t border-gray-100 pt-4"><button type="button" onClick={() => openEditModal(category)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Edit2 className="h-4 w-4" />Edit</button><button type="button" onClick={() => handleToggleActive(category)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{category.isActive ? <EyeOff className="h-4 w-4" /> : <Check className="h-4 w-4" />}{category.isActive ? "Deactivate" : "Activate"}</button></footer>
          </article>)}
        </section>}
      </section>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-[#D2552B]" />
                {editingCategory ? "Edit Food Category" : "Create Regional Food Category"}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} aria-label="Close category form" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label htmlFor="category-name" className="mb-1 block text-sm font-semibold text-gray-700">Category Name *</label>
              <input
                id="category-name"
                type="text"
                required
                placeholder="e.g. Maharashtrian, Punjabi, South Indian..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div>
              <label htmlFor="category-description" className="mb-1 block text-sm font-semibold text-gray-700">Description</label>
              <textarea
                id="category-description"
                placeholder="Brief summary of regional flavors and specialties..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-red-100"
                rows={3}
              />
            </div>

            <div>
              <label htmlFor="category-image" className="mb-1 block text-sm font-semibold text-gray-700">Image URL (Optional)</label>
              <input
                id="category-image"
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingCategory ? "Update Category" : "Create Category"}</span>
              </button>
            </div>
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
    </main>
  );
};

export default AdminCategories;
