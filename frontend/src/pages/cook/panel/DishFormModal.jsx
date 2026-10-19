import { useState, useEffect, useRef } from "react";
import {
  X,
  Camera,
  UtensilsCrossed,
  BookOpen,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { buildDishStoryPayload } from "../../../utils/dishSubmission.js";

export const DishFormModal = ({
  isOpen,
  onClose,
  onSuccess,
  dishToEdit = null,
  categories = [],
}) => {
  const [activeTab, setActiveTab] = useState("details"); // 'details' | 'story' | 'photo'
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [fetchedCategories, setFetchedCategories] = useState([]);

  useEffect(() => {
    if (categories?.length || !isOpen) return undefined;

    let active = true;
    cookApi
      .getCategories()
      .then((res) => {
        const catList = res.data?.data || res.data || [];
        if (active) setFetchedCategories(catList);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [categories, isOpen]);
  const internalCategories = categories?.length ? categories : fetchedCategories;

  // Form State
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [isVegetarian, setIsVegetarian] = useState(true);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState("30");
  const [availableQuantity, setAvailableQuantity] = useState("10");
  const [lowStockThreshold, setLowStockThreshold] = useState("3");
  const [ingredientsText, setIngredientsText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dietaryTags, setDietaryTags] = useState([]);

  // Story State
  const [whoTaught, setWhoTaught] = useState("");
  const [occasion, setOccasion] = useState("");
  const [culturalSignificance, setCulturalSignificance] = useState("");
  const [storyText, setStoryText] = useState("");
  const [storyVisibility, setStoryVisibility] = useState("PUBLIC");

  // Photo State
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const fileInputRef = useRef(null);

  const availableTags = [
    "Jain",
    "Vegan",
    "Gluten-Free",
    "Halal",
    "Nut-Free",
    "Dairy-Free",
    "High Protein",
    "Heirloom Recipe",
  ];

  // Initialize or reset form when modal opens or dishToEdit changes
  useEffect(() => {
    if (dishToEdit) {
      setName(dishToEdit.name || "");
      setDescription(dishToEdit.description || "");
      setCuisine(dishToEdit.cuisine || "");
      setCategoryId(dishToEdit.categoryId || "");
      setPrice(String(dishToEdit.price || ""));
      setIsVegetarian(dishToEdit.isVegetarian !== false);
      setPrepTimeMinutes(String(dishToEdit.prepTimeMinutes || "30"));
      setAvailableQuantity(String(dishToEdit.availableQuantity ?? "10"));
      setLowStockThreshold(String(dishToEdit.lowStockThreshold ?? "3"));
      setIngredientsText(
        Array.isArray(dishToEdit.ingredients)
          ? dishToEdit.ingredients.join(", ")
          : dishToEdit.ingredients || ""
      );
      setInstructions(dishToEdit.instructions || "");
      setDietaryTags(Array.isArray(dishToEdit.dietaryTags) ? dishToEdit.dietaryTags : []);

      // Pre-fill story
      const story = dishToEdit.story;
      setWhoTaught(story?.whoTaught || "");
      setOccasion(story?.occasion || "");
      setCulturalSignificance(story?.culturalSignificance || "");
      setStoryText(story?.storyText || "");
      setStoryVisibility(story?.visibility || "PUBLIC");

      setPreviewUrl(dishToEdit.image || "");
    } else {
      setName("");
      setDescription("");
      setCuisine("Maharashtrian");
      setCategoryId(categories[0]?.id || "");
      setPrice("");
      setIsVegetarian(true);
      setPrepTimeMinutes("30");
      setAvailableQuantity("10");
      setLowStockThreshold("3");
      setIngredientsText("");
      setInstructions("");
      setDietaryTags([]);
      setWhoTaught("");
      setOccasion("");
      setCulturalSignificance("");
      setStoryText("");
      setStoryVisibility("PUBLIC");
      setSelectedFile(null);
      setPreviewUrl("");
    }
    setActiveTab("details");
    setErrorMessage(null);
  }, [dishToEdit, categories, isOpen]);

  if (!isOpen) return null;

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setErrorMessage("Please select a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image file must be under 5MB.");
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMessage(null);
  };

  const toggleTag = (tag) => {
    setDietaryTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Cooks may save a draft or submit a dish for Admin approval.
  const handleSubmit = async (targetStatus) => {
    try {
      setLoading(true);
      setErrorMessage(null);

      // Validate common basic fields
      if (!name.trim()) {
        setActiveTab("details");
        throw new Error("Dish name is required.");
      }
      if (!price || Number(price) <= 0) {
        setActiveTab("details");
        throw new Error("Price must be greater than 0.");
      }
      if (!cuisine.trim()) {
        setActiveTab("details");
        throw new Error("Cuisine is required.");
      }
      if (!categoryId) {
        setActiveTab("details");
        throw new Error("Please select a category.");
      }

      if (!["DRAFT", "PENDING_APPROVAL"].includes(targetStatus)) {
        throw new Error("Cooks can save drafts or submit dishes for Admin review.");
      }

      let storyPayload;
      try {
        storyPayload = buildDishStoryPayload({
          whoTaught,
          occasion,
          culturalSignificance,
          storyText,
          visibility: storyVisibility,
        });
      } catch (storyError) {
        setActiveTab("story");
        throw storyError;
      }

      const ingredientsList = ingredientsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        cuisine: cuisine.trim(),
        categoryId,
        price: Number(price),
        isVegetarian,
        prepTimeMinutes: Number(prepTimeMinutes) || 30,
        availableQuantity: Number(availableQuantity) || 0,
        lowStockThreshold: Number(lowStockThreshold) || 3,
        ingredients: ingredientsList,
        instructions: instructions.trim() || null,
        dietaryTags,
        status: targetStatus,
        ...(storyPayload ? { story: storyPayload } : {}),
      };

      let savedDish;
      if (dishToEdit) {
        // Edit existing dish
        const res = await cookApi.updateDish(dishToEdit.id, payload);
        savedDish = res.data?.data || res.data;

        // If new photo selected, upload it
        if (selectedFile) {
          const photoRes = await cookApi.uploadDishPhoto(dishToEdit.id, selectedFile);
          savedDish = photoRes.data?.data || savedDish;
        }

      } else {
        // Create new dish
        const res = await cookApi.createDish(payload);
        savedDish = res.data?.data || res.data;

        // If photo selected, upload it
        if (selectedFile && savedDish?.id) {
          const photoRes = await cookApi.uploadDishPhoto(savedDish.id, selectedFile);
          savedDish = photoRes.data?.data || savedDish;
        }
      }

      onSuccess(
        targetStatus === "PENDING_APPROVAL"
          ? "Dish submitted for Admin approval. It will stay hidden from customers until approved."
          : "Dish saved as draft successfully."
      );
      onClose();
    } catch (err) {
      console.error("Dish submit error", err);
      setErrorMessage(
        err.response?.data?.message || err.message || "Failed to save dish."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FFF8F0] w-full max-w-3xl rounded-3xl shadow-2xl border border-[#2B1B12]/15 flex flex-col max-h-[92vh] overflow-hidden text-left">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-white border-b border-[#2B1B12]/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D2552B]/10 text-[#D2552B] flex items-center justify-center">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-[#2B1B12] leading-tight">
                {dishToEdit ? "Edit Dish & Story" : "Add New Dish"}
              </h2>
              <p className="text-xs text-[#2B1B12]/60">
                {dishToEdit
                  ? "Update recipe details, stock quantities, or origin story"
                  : "List an authentic family recipe with its cultural heritage"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-white border-b border-[#2B1B12]/10 flex gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              activeTab === "details"
                ? "border-[#D2552B] text-[#D2552B] bg-orange-50/50"
                : "border-transparent text-[#2B1B12]/60 hover:text-[#2B1B12]"
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>1. Dish Details & Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("story")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              activeTab === "story"
                ? "border-[#D2552B] text-[#D2552B] bg-orange-50/50"
                : "border-transparent text-[#2B1B12]/60 hover:text-[#2B1B12]"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>2. Cultural Story</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-[#F4A52A]/20 text-amber-800 rounded font-semibold">
              Required for Admin approval
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("photo")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border-b-2 ${
              activeTab === "photo"
                ? "border-[#D2552B] text-[#D2552B] bg-orange-50/50"
                : "border-transparent text-[#2B1B12]/60 hover:text-[#2B1B12]"
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>3. Dish Photo</span>
            {previewUrl && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 text-red-700 border border-red-200 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: DISH DETAILS & STOCK */}
          {activeTab === "details" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Row 1: Dish Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Dish Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Heirloom Puran Poli"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B] focus:ring-1 focus:ring-[#D2552B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Regional Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B] focus:ring-1 focus:ring-[#D2552B]"
                  >
                    <option value="">Select Category</option>
                    {internalCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Cuisine, Price, Veg/Non-veg */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Cuisine / Tradition <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={cuisine}
                    onChange={(e) => setCuisine(e.target.value)}
                    placeholder="e.g. Maharashtrian"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="e.g. 180"
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Food Classification
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsVegetarian(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        isVegetarian
                          ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                          : "bg-white text-stone-500 border-stone-200"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span>Veg</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsVegetarian(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                        !isVegetarian
                          ? "bg-red-50 text-red-800 border-red-300"
                          : "bg-white text-stone-500 border-stone-200"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-600" />
                      <span>Non-Veg</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 3: Stock Management & Prep Notice */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-white rounded-2xl border border-[#2B1B12]/10">
                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Available Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={availableQuantity}
                    onChange={(e) => setAvailableQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFF8F0] border border-[#2B1B12]/15 rounded-xl text-xs font-bold text-[#2B1B12]"
                  />
                  <p className="text-[10px] text-[#2B1B12]/50 mt-1">
                    Portions ready or cookable today
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFF8F0] border border-[#2B1B12]/15 rounded-xl text-xs font-bold text-[#2B1B12]"
                  />
                  <p className="text-[10px] text-[#2B1B12]/50 mt-1">
                    Alert trigger level
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                    Prep Time (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={prepTimeMinutes}
                    onChange={(e) => setPrepTimeMinutes(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FFF8F0] border border-[#2B1B12]/15 rounded-xl text-xs font-bold text-[#2B1B12]"
                  />
                  <p className="text-[10px] text-[#2B1B12]/50 mt-1">
                    Cooking & packing notice
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Dish Description
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Share a sensory description of the flavors, spices, and textures..."
                  className="w-full p-3 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Ingredients */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Key Ingredients (comma separated)
                </label>
                <input
                  type="text"
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                  placeholder="e.g. Chana dal, Jaggery, Wheat flour, Pure ghee, Cardamom"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Preparation / Recipe Notes */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Cooking Notes & Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Special cooking techniques, tempering secrets, or reheating guidance..."
                  className="w-full p-3 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Dietary Tags */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1.5">
                  Dietary Attributes
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                        dietaryTags.includes(t)
                          ? "bg-[#D2552B] text-white border-[#D2552B]"
                          : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CULTURAL STORY */}
          {activeTab === "story" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-2xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#D2552B] shrink-0 mt-0.5" />
                <div className="text-xs text-[#2B1B12]/80 leading-relaxed">
                  <strong className="text-[#2B1B12] font-bold block mb-0.5">
                    The TasteBridge Heritage Requirement
                  </strong>
                  TasteBridge is where food meets heritage. Every published dish
                  must be anchored to authentic culinary roots. Sharing who
                  taught you the dish and its cultural significance connects
                  diners to your traditions.
                </div>
              </div>

              {/* Who taught cooking */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Who taught you this recipe? <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={whoTaught}
                  onChange={(e) => setWhoTaught(e.target.value)}
                  placeholder="e.g. My grandmother Aaji Shantabai, Mother, Royal culinary elder"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Occasion */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Special Occasion or Festive Tradition
                </label>
                <input
                  type="text"
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                  placeholder="e.g. Gudi Padwa feast, Sunday family gathering, Monsoon special"
                  className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Cultural Significance */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Cultural & Regional Significance
                </label>
                <textarea
                  rows={2}
                  value={culturalSignificance}
                  onChange={(e) => setCulturalSignificance(e.target.value)}
                  placeholder="Why is this dish special to your region? (e.g. Symbolizes prosperity, cooked in traditional brass cookware, native crops used)..."
                  className="w-full p-3 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
              </div>

              {/* Written Story */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Heritage Story <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  placeholder="Share the memory or lore: 'Every winter morning in our ancestral home, the scent of freshly roasted jaggery would fill the courtyard as Aaji kneaded the puran...'"
                  className="w-full p-3 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                />
                <span className="text-[10px] text-[#2B1B12]/50 mt-1 block">
                  Minimum 10 characters required for Admin approval.
                </span>
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-xs font-bold text-[#2B1B12] mb-1">
                  Story Visibility
                </label>
                <select
                  value={storyVisibility}
                  onChange={(e) => setStoryVisibility(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/15 rounded-xl text-xs text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                >
                  <option value="PUBLIC">Public (Visible to all diners in marketplace)</option>
                  <option value="PRIVATE">Private (Visible only to customers after ordering)</option>
                  <option value="ARCHIVE_ONLY">Archive Only</option>
                </select>
              </div>
            </div>
          )}

          {/* TAB 3: PHOTO UPLOAD */}
          {activeTab === "photo" && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handlePhotoChange}
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#2B1B12]/20 hover:border-[#D2552B] bg-white rounded-3xl p-8 text-center cursor-pointer transition-colors space-y-3"
              >
                {previewUrl ? (
                  <div className="space-y-3">
                    <img
                      src={previewUrl}
                      alt="Dish preview"
                      className="w-48 h-48 object-cover rounded-2xl mx-auto shadow-md"
                    />
                    <p className="text-xs font-bold text-[#D2552B]">
                      Click to choose another photo
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-orange-50 text-[#D2552B] flex items-center justify-center mx-auto">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-[#2B1B12]">
                      Upload Dish Photo
                    </p>
                    <p className="text-[11px] text-[#2B1B12]/50 max-w-xs mx-auto">
                      JPEG, PNG, or WebP up to 5MB. Clear, well-lit photos of authentic plating attract the most diners.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 bg-white border-t border-[#2B1B12]/10 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-stone-600 hover:text-stone-900 cursor-pointer"
          >
            Cancel
          </button>

          {dishToEdit?.status !== "PUBLISHED" && (
            <p className="w-full text-xs text-stone-600">
              Submitted dishes stay hidden from customers until an Admin approves them.
            </p>
          )}

          <div className="flex items-center gap-2.5">
            {dishToEdit?.status === "PUBLISHED" ? (
              <p className="max-w-sm text-right text-xs text-stone-600">
                This Admin-approved listing stays available. Request an Admin-reviewed update before changing its recipe or photo.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmit("DRAFT")}
                  disabled={loading}
                  className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save as Draft"}
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmit("PENDING_APPROVAL")}
                  disabled={loading}
                  className="px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? "Submitting..." : "Submit for Admin Review"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DishFormModal;
