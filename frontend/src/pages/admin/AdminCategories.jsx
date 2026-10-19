import { useEffect, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Tag,
  Plus,
  Search,
  Loader2,
  RefreshCw,
  FolderPlus,
  Edit2,
  X,
  Layers,
} from "lucide-react";

export const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

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

  const fetchCategories = async () => {
    try {
      const res = await adminApi.getFoodCategories();
      setCategories(res.data || []);
    } catch (err) {
      setError(err.message || "Failed to load food categories.");
    } finally {
      setLoading(false);
    }
  };

  const refreshCategories = () => {
    setLoading(true);
    setError(null);
    void fetchCategories();
  };

  useEffect(() => {
    let active = true;
    adminApi.getFoodCategories()
      .then((res) => {
        if (active) setCategories(res.data || []);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load food categories.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

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
      message: `Are you sure you want to ${nextState ? "activate" : "deactivate"} '${cat.name}'?`,
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

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Tag className="w-6 h-6 text-red-600" /> Food Category Management
          </h2>
          <p className="text-xs text-gray-500 mt-1">Manage regional cuisines and culinary categories across TasteBridge</p>
        </div>
        <div className="flex items-center gap-3">
          <button
          onClick={refreshCategories}
            className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search categories by name or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-7 h-7 text-red-600 animate-spin" />
          <span className="text-xs text-gray-500 font-medium">Loading food categories...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 rounded-2xl border border-red-200 text-center text-xs text-red-700 font-semibold">
          {error}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-gray-200 text-center space-y-2">
          <Layers className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No Food Categories Found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCategories.map((cat) => (
            <div key={cat.id} className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm text-gray-900 line-clamp-1">{cat.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase shrink-0 ${
                      cat.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {cat.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cat.description || "No description provided."}</p>
                <div className="mt-3 text-xs text-gray-400 font-medium">
                  Associated Dishes: <strong className="text-gray-800">{cat._count?.dishes ?? 0}</strong>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
                <button
                  onClick={() => openEditModal(cat)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleToggleActive(cat)}
                  className={`text-xs font-semibold hover:underline cursor-pointer ${
                    cat.isActive ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  {cat.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-red-600" />
                {editingCategory ? "Edit Food Category" : "Create Regional Food Category"}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Maharashtrian, Punjabi, South Indian..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                placeholder="Brief summary of regional flavors and specialties..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Image URL (Optional)</label>
              <input
                type="url"
                placeholder="https://images.unsplash.com/..."
                value={image}
                onChange={(e) => setImage(e.target.value)}
                className="w-full px-3.5 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
    </div>
  );
};

export default AdminCategories;
