import { useState, useEffect } from "react";
import {
  UtensilsCrossed,
  Plus,
  Search,
  Sparkles,
  Edit3,
  Trash2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Clock,
  RotateCw,
  EyeOff,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import DishFormModal from "./DishFormModal.jsx";

export const CookDishesPage = () => {
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [dishToEdit, setDishToEdit] = useState(null);

  // In-flight action tracking
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  // Fetch dishes and categories
  const fetchData = async () => {
    try {
      setLoading(true);
      setFeedback(null);
      const [dishesRes, categoriesRes] = await Promise.all([
        cookApi.getDishes(),
        cookApi.getCategories(),
      ]);

      const dishesData = dishesRes.data?.data?.dishes || dishesRes.data?.dishes || [];
      const categoriesData = categoriesRes.data?.data || categoriesRes.data || [];

      setDishes(dishesData);
      setCategories(categoriesData);
    } catch (err) {
      console.error("Failed to load dishes", err);
      setFeedback({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to load dishes.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([cookApi.getDishes(), cookApi.getCategories()])
      .then(([dishesRes, categoriesRes]) => {
        if (!active) return;
        const dishesData = dishesRes.data?.data?.dishes || dishesRes.data?.dishes || [];
        const categoriesData = categoriesRes.data?.data || categoriesRes.data || [];
        setDishes(dishesData);
        setCategories(categoriesData);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load dishes", err);
        setFeedback({
          type: "error",
          message: err.response?.data?.message || err.message || "Failed to load dishes.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  // Filtered dishes
  const filteredDishes = dishes.filter((dish) => {
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = dish.name?.toLowerCase().includes(q);
      const matchCuisine = dish.cuisine?.toLowerCase().includes(q);
      const matchDesc = dish.description?.toLowerCase().includes(q);
      if (!matchName && !matchCuisine && !matchDesc) return false;
    }

    // Category filter
    if (selectedCategory !== "ALL" && dish.categoryId !== selectedCategory) {
      return false;
    }

    // Status filter
    if (selectedStatus !== "ALL" && dish.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  // Real Counts
  const counts = {
    ALL: dishes.length,
    PUBLISHED: dishes.filter((d) => d.status === "PUBLISHED").length,
    PENDING_APPROVAL: dishes.filter((d) => d.status === "PENDING_APPROVAL").length,
    DRAFT: dishes.filter((d) => d.status === "DRAFT").length,
    UNPUBLISHED: dishes.filter((d) => d.status === "UNPUBLISHED").length,
  };

  // Toggle Availability
  const handleToggleAvailability = async (dish) => {
    if (actionLoadingId) return;
    try {
      setActionLoadingId(dish.id);
      const res = await cookApi.updateDishAvailability(dish.id, !dish.isAvailable);
      const updated = res.data?.data || res.data;

      setDishes((prev) =>
        prev.map((d) => (d.id === dish.id ? { ...d, isAvailable: updated.isAvailable } : d))
      );
      setFeedback({
        type: "success",
        message: updated.isAvailable
          ? `"${dish.name}" is now available for customer ordering.`
          : `"${dish.name}" is marked unavailable for orders.`,
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to update availability.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Only the Admin can publish. Cooks can unpublish their own live listings.
  const handleTogglePublish = async (dish) => {
    if (actionLoadingId) return;

    if (dish.status !== "PUBLISHED") {
      if (dish.status === "PENDING_APPROVAL") return;
      setDishToEdit(dish);
      setModalOpen(true);
      return;
    }

    try {
      setActionLoadingId(dish.id);
      const res = await cookApi.unpublishDish(dish.id);
      const updated = res.data?.data || res.data;
      setDishes((prev) => prev.map((d) => (d.id === dish.id ? { ...d, status: updated.status } : d)));
      setFeedback({ type: "success", message: `"${dish.name}" unpublished from active menu.` });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to change publication status.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete / Archive Dish
  const handleDeleteDish = async (dish) => {
    if (!window.confirm(`Are you sure you want to remove "${dish.name}" from your kitchen?`)) {
      return;
    }

    try {
      setActionLoadingId(dish.id);
      const res = await cookApi.deleteDish(dish.id);
      const msg = res.data?.data?.message || res.data?.message || "Dish removed.";
      setDishes((prev) => prev.filter((d) => d.id !== dish.id));
      setFeedback({
        type: "success",
        message: msg,
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to remove dish.",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12] tracking-tight">
            My dishes
          </h2>
          <p className="text-xs sm:text-sm text-[#2B1B12]/70 mt-1">
            Manage your regional recipes, available portions, and cultural origin stories.
          </p>
        </div>

        {/* Primary CTA */}
        <button
          id="cook-add-dish-btn"
          data-testid="cook-add-dish-btn"
          type="button"
          onClick={() => {
            setDishToEdit(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold shadow-md shadow-[#D2552B]/20 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Dish</span>
        </button>
      </div>

      {/* Feedback Toast */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold shadow-xs animate-in fade-in duration-150 ${
            feedback.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#2B1B12]/10 space-y-3 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-[#2B1B12]/5">
          {[
            { id: "ALL", label: `All Dishes (${counts.ALL})` },
            { id: "PUBLISHED", label: `Published (${counts.PUBLISHED})` },
            { id: "PENDING_APPROVAL", label: `Pending approval (${counts.PENDING_APPROVAL})` },
            { id: "DRAFT", label: `Drafts (${counts.DRAFT})` },
            { id: "UNPUBLISHED", label: `Unpublished (${counts.UNPUBLISHED})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === tab.id
                  ? "bg-[#D2552B] text-white shadow-2xs"
                  : "bg-stone-50 text-[#2B1B12]/70 hover:bg-stone-100 hover:text-[#2B1B12]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Category Dropdown */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes by name, cuisine, ingredients..."
              className="w-full pl-9.5 pr-4 py-2 bg-[#FFF8F0]/50 border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B] placeholder:text-stone-400"
            />
          </div>

          <div className="w-full sm:w-auto">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-auto px-3.5 py-2 bg-[#FFF8F0]/50 border border-[#2B1B12]/15 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* DISH LISTING */}
      {loading ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div
              key={`skel-dish-${i}`}
              className="h-80 bg-white rounded-3xl border border-orange-100/60 p-5 space-y-4"
            >
              <div className="h-40 bg-orange-100/40 rounded-2xl" />
              <div className="h-5 bg-orange-100/60 rounded-md w-3/4" />
              <div className="h-4 bg-orange-100/40 rounded-md w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredDishes.length > 0 ? (
        /* Dish Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDishes.map((dish) => {
            const hasStory = Boolean(
              dish.story?.whoTaught && dish.story?.storyText
            );
            const isLowStock =
              dish.availableQuantity <= dish.lowStockThreshold &&
              dish.availableQuantity > 0;
            const isOutOfStock = dish.availableQuantity === 0;

            return (
              <div
                key={dish.id}
                className="bg-white rounded-3xl border border-[#2B1B12]/10 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                {/* Card Image Area */}
                <div className="h-44 bg-[#2B1B12] relative overflow-hidden flex items-center justify-center">
                  {dish.image ? (
                    <img
                      src={dish.image}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <UtensilsCrossed className="w-10 h-10 text-[#F4A52A]/60 mx-auto mb-1" />
                      <span className="text-[10px] text-white/50">
                        No photo uploaded
                      </span>
                    </div>
                  )}

                  {/* Veg / Non-Veg Indicator */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-xs text-[10px] font-extrabold shadow-xs">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        dish.isVegetarian ? "bg-emerald-600" : "bg-red-600"
                      }`}
                    />
                    <span
                      className={
                        dish.isVegetarian ? "text-emerald-800" : "text-red-800"
                      }
                    >
                      {dish.isVegetarian ? "Veg" : "Non-Veg"}
                    </span>
                  </div>

                  {/* Publication Status Badge */}
                  <div className="absolute top-3 right-3">
                    {dish.status === "PUBLISHED" ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                        Published
                      </span>
                    ) : dish.status === "PENDING_APPROVAL" ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                        Pending Admin approval
                      </span>
                    ) : dish.status === "DRAFT" ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                        Draft
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-stone-600/90 text-white text-[10px] font-bold backdrop-blur-xs shadow-xs">
                        Unpublished
                      </span>
                    )}
                  </div>

                  {dish.status === "PUBLISHED" && (
                    <div className="absolute top-11 right-3 flex max-w-[75%] flex-col items-end gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold shadow-xs ${dish.customerVisibility?.isVisible ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}`}>
                        {dish.customerVisibility?.isVisible ? "Visible to customers" : "Hidden from customers"}
                      </span>
                      {!dish.customerVisibility?.isVisible && dish.customerVisibility?.reasons?.map((reason) => (
                        <span key={reason} className="px-2 py-1 rounded-md bg-white/95 text-red-800 text-[10px] leading-tight text-right shadow-xs">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stock Tag Overlay */}
                  <div className="absolute bottom-3 left-3">
                    {isOutOfStock ? (
                      <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold shadow-xs">
                        Out of Stock
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold shadow-xs">
                        Low Stock: {dish.availableQuantity} left
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-semibold backdrop-blur-xs">
                        {dish.availableQuantity} in stock
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content Area */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    {/* Category & Cuisine */}
                    <div className="flex items-center justify-between text-[11px] text-[#2B1B12]/60 font-semibold">
                      <span>{dish.category?.name || "General"}</span>
                      <span>&bull;</span>
                      <span>{dish.cuisine}</span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {dish.prepTimeMinutes || 30}m
                      </span>
                    </div>

                    {/* Dish Name */}
                    <h3 className="text-base font-extrabold text-[#2B1B12] leading-tight group-hover:text-[#D2552B] transition-colors">
                      {dish.name}
                    </h3>

                    {/* Price */}
                    <div className="text-lg font-extrabold text-[#D2552B]">
                      ₹{Number(dish.price).toFixed(2)}
                    </div>

                    {/* Description */}
                    {dish.description && (
                      <p className="text-xs text-[#2B1B12]/70 line-clamp-2 leading-relaxed">
                        {dish.description}
                      </p>
                    )}

                    {/* Cultural Story Snippet */}
                    <div className="pt-2 border-t border-[#2B1B12]/5">
                      {hasStory ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-[#3E5B3A] font-semibold">
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            Taught by: {dish.story.whoTaught}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-semibold bg-amber-50 p-1.5 rounded-lg">
                          <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                          <span>Story required for Admin approval</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Controls & Actions */}
                  <div className="pt-3 border-t border-[#2B1B12]/10 space-y-3">
                    {/* Ordering Availability Switch */}
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-[#2B1B12]/70">Available to Order</span>
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(dish)}
                        disabled={actionLoadingId === dish.id}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-all cursor-pointer ${
                          dish.isAvailable
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-stone-100 text-stone-600 border-stone-300"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            dish.isAvailable ? "bg-emerald-500" : "bg-stone-400"
                          }`}
                        />
                        <span>{dish.isAvailable ? "Available" : "Paused"}</span>
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {/* Publish / Unpublish Button */}
                      {dish.status === "PENDING_APPROVAL" ? (
                        <span className="flex-1 flex items-center justify-center py-2 rounded-xl text-xs font-bold border border-amber-200 bg-amber-50 text-amber-900">
                          Awaiting Admin review
                        </span>
                      ) : dish.status === "PUBLISHED" ? (
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(dish)}
                          disabled={actionLoadingId === dish.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border bg-white text-stone-700 border-stone-200 hover:bg-stone-50 disabled:opacity-50"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-stone-500" />
                          <span>Unpublish</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setDishToEdit(dish);
                            setModalOpen(true);
                          }}
                          disabled={actionLoadingId === dish.id}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer border bg-[#D2552B] text-white border-[#D2552B] hover:bg-[#C4461C] shadow-2xs disabled:opacity-50"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Edit &amp; submit for Admin review</span>
                        </button>
                      )}

                      {dish.status === "PUBLISHED" ? (
                        <span className="max-w-44 text-right text-[10px] leading-tight text-stone-500">Approved content changes require an Admin-reviewed update.</span>
                      ) : dish.status === "PENDING_APPROVAL" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDishToEdit(dish);
                            setModalOpen(true);
                          }}
                          className="p-2 rounded-xl bg-white border border-[#2B1B12]/15 text-[#2B1B12] hover:border-[#D2552B] hover:text-[#D2552B] transition-colors cursor-pointer"
                          title="Edit recipe & story"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      ) : null}

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteDish(dish)}
                        disabled={actionLoadingId === dish.id}
                        className="p-2 rounded-xl bg-white border border-[#2B1B12]/15 text-stone-400 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                        title="Delete dish"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-3xl border border-[#2B1B12]/10 p-8 sm:p-14 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-[#D2552B]/10 text-[#D2552B] flex items-center justify-center mx-auto shadow-inner">
            <UtensilsCrossed className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-[#2B1B12]">
              {dishes.length === 0
                ? "No dishes added to your menu yet"
                : "No dishes match your current filter"}
            </h3>
            <p className="text-xs sm:text-sm text-[#2B1B12]/60 leading-relaxed font-normal">
              {dishes.length === 0
                ? "Share the culinary traditions your family cherishes by listing your first regional recipe with photos, origin stories, and ingredients."
                : "Try resetting your search query or selecting a different category."}
            </p>
          </div>

          <div className="pt-2">
            {dishes.length === 0 ? (
              <button
                id="cook-add-first-dish-btn"
                data-testid="cook-add-first-dish-btn"
                type="button"
                onClick={() => {
                  setDishToEdit(null);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold shadow-md shadow-[#D2552B]/20 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Your First Dish</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategory("ALL");
                  setSelectedStatus("ALL");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dish Form Modal (Add / Edit / Photo / Cultural Story) */}
      <DishFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setDishToEdit(null);
        }}
        onSuccess={(msg) => {
          fetchData();
          setFeedback({ type: "success", message: msg });
        }}
        dishToEdit={dishToEdit}
        categories={categories}
      />
    </div>
  );
};

export default CookDishesPage;
