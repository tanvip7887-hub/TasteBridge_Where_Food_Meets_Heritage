import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  ChefHat,
  MapPin,
  ShieldCheck,
  Award,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Camera,
  Edit3,
  Save,
  X,
  Loader2,
  Power,
  UtensilsCrossed,
  Clock,
  Heart,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { updateUserProfile } from "../../../store/slices/authSlice.js";
import { getCookFssaiStatusMessage } from "../../../utils/fssaiStatus.js";

export const CookKitchenPage = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  const [kitchen, setKitchen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }
  const fileInputRef = useRef(null);
  const fssaiInputRef = useRef(null);

  // Form state for editable fields
  const [formData, setFormData] = useState({
    businessName: "",
    bio: "",
    whoTaughtCooking: "",
    experienceYears: "",
    specialization: "",
    signatureDishes: "",
    city: "",
    locality: "",
    serviceArea: "",
    isOpen: true,
    cuisines: [],
    dietaryPreferences: [],
  });

  const [cuisineInput, setCuisineInput] = useState("");
  const [uploadingFssai, setUploadingFssai] = useState(false);
  const [savingFssaiDetails, setSavingFssaiDetails] = useState(false);
  const [fssaiDetails, setFssaiDetails] = useState({ fssaiStatusType: "NOT_YET_REGISTERED", fssaiNumber: "", fssaiApplicationReference: "" });

  const saveFssaiDetails = async (event) => {
    event.preventDefault();
    try {
      setSavingFssaiDetails(true);
      await cookApi.updateKitchenProfile(fssaiDetails);
      setFeedback({ type: "success", message: "FSSAI details saved." });
      await fetchKitchenProfile();
    } catch (err) {
      setFeedback({ type: "error", message: err.response?.data?.message || "Could not save FSSAI details." });
    } finally {
      setSavingFssaiDetails(false);
    }
  };

  const handleFssaiUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploadingFssai(true);
      await cookApi.submitFssaiDocument(file);
      setFeedback({ type: "success", message: "FSSAI document submitted. It will be reviewed by the compliance team." });
      await fetchKitchenProfile();
    } catch (err) {
      setFeedback({ type: "error", message: err.response?.data?.message || "Could not upload the FSSAI document." });
    } finally {
      setUploadingFssai(false);
      event.target.value = "";
    }
  };

  // Fetch kitchen profile from backend
  const fetchKitchenProfile = async () => {
    try {
      setLoading(true);
      const res = await cookApi.getKitchenProfile();
      const data = res.data?.data || res.data;
      if (data) {
        setKitchen(data);
        setFssaiDetails({
          fssaiStatusType: data.fssaiStatusType || "NOT_YET_REGISTERED",
          fssaiNumber: data.fssaiNumber || "",
          fssaiApplicationReference: data.fssaiApplicationReference || "",
        });
        setFormData({
          businessName: data.businessName || "",
          bio: data.bio || "",
          whoTaughtCooking: data.whoTaughtCooking || "",
          experienceYears: data.experienceYears || "",
          specialization: data.specialization || "",
          signatureDishes: data.signatureDishes || "",
          city: data.city || "",
          locality: data.locality || "",
          serviceArea: data.serviceArea || "",
          isOpen: data.isOpen !== false,
          cuisines: Array.isArray(data.cuisines) ? data.cuisines : [],
          dietaryPreferences: Array.isArray(data.dietaryPreferences) ? data.dietaryPreferences : [],
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || err.message || "Failed to load kitchen profile.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKitchenProfile();
  }, []);

  // Handle direct toggle of Open/Closed status
  const handleToggleStatus = async () => {
    if (!kitchen || saving) return;
    const newStatus = !kitchen.isOpen;
    try {
      setSaving(true);
      const res = await cookApi.updateKitchenProfile({ isOpen: newStatus });
      const updated = res.data?.data || res.data;
      setKitchen(updated);
      setFormData((prev) => ({ ...prev, isOpen: newStatus }));
      
      // Update global auth user state so header & marketplace stay synchronized
      if (user?.cookProfile) {
        dispatch(
          updateUserProfile({
            cookProfile: {
              ...user.cookProfile,
              isOpen: newStatus,
            },
          })
        );
      }

      setFeedback({
        type: "success",
        message: newStatus ? "Kitchen is now Open for customer orders!" : "Kitchen is now Closed for orders.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to update kitchen status.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Photo File Upload
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (max 5MB)
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setFeedback({
        type: "error",
        message: "Please choose a JPG, PNG, or WebP image file.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({
        type: "error",
        message: "Image file size must be under 5MB.",
      });
      return;
    }

    try {
      setUploadingPhoto(true);
      setFeedback(null);
      const res = await cookApi.uploadKitchenPhoto(file);
      const updated = res.data?.data || res.data;
      setKitchen(updated);

      // Update Redux state with new photo URL
      if (user?.cookProfile) {
        dispatch(
          updateUserProfile({
            cookProfile: {
              ...user.cookProfile,
              profileImage: updated.profileImage,
            },
          })
        );
      }

      setFeedback({
        type: "success",
        message: "Kitchen profile photo updated successfully!",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to upload photo. Please try again.",
      });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Handle Form Submit
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!formData.businessName.trim()) {
      setFeedback({ type: "error", message: "Kitchen display name is required." });
      return;
    }

    try {
      setSaving(true);
      setFeedback(null);
      const res = await cookApi.updateKitchenProfile(formData);
      const updated = res.data?.data || res.data;
      setKitchen(updated);
      setIsEditing(false);

      // Synchronize redux auth user state
      if (user?.cookProfile) {
        dispatch(
          updateUserProfile({
            cookProfile: {
              ...user.cookProfile,
              businessName: updated.businessName,
              isOpen: updated.isOpen,
              city: updated.city,
              locality: updated.locality,
            },
          })
        );
      }

      setFeedback({
        type: "success",
        message: "Kitchen profile changes saved successfully!",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to save kitchen profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Cuisine tag helpers
  const handleAddCuisine = () => {
    const trimmed = cuisineInput.trim();
    if (trimmed && !formData.cuisines.includes(trimmed)) {
      setFormData((prev) => ({
        ...prev,
        cuisines: [...prev.cuisines, trimmed],
      }));
      setCuisineInput("");
    }
  };

  const handleRemoveCuisine = (item) => {
    setFormData((prev) => ({
      ...prev,
      cuisines: prev.cuisines.filter((c) => c !== item),
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6 text-left animate-pulse">
        <div className="h-8 bg-amber-100/60 rounded-xl w-64" />
        <div className="h-4 bg-amber-100/40 rounded-lg w-96" />
        <div className="h-80 bg-white rounded-3xl border border-[#2B1B12]/10 p-6 flex flex-col justify-between">
          <div className="h-32 bg-orange-100/40 rounded-2xl w-full" />
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-2xl bg-amber-200/50" />
            <div className="space-y-2 flex-1">
              <div className="h-6 bg-amber-100/60 rounded-lg w-48" />
              <div className="h-4 bg-amber-100/40 rounded-lg w-32" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const businessName = kitchen?.businessName || user?.name || "Authentic Home Kitchen";
  const city = kitchen?.city || "Local City";
  const locality = kitchen?.locality || "Neighborhood";
  const serviceArea = kitchen?.serviceArea || "Within 5 km radius";
  const cuisines = Array.isArray(kitchen?.cuisines) && kitchen.cuisines.length > 0
    ? kitchen.cuisines
    : ["Traditional Home Recipes", "Regional Heritage"];
  const bio = kitchen?.bio || "Preparing treasured ancestral recipes handed down through generations with fresh, wholesome ingredients.";
  const whoTaughtCooking = kitchen?.whoTaughtCooking || "Learned traditional family heritage recipes passed down over generations.";
  const experienceYears = kitchen?.experienceYears || "5+ Years";
  const signatureDishes = kitchen?.signatureDishes || "Heritage specialties prepared fresh daily.";
  const isOpen = kitchen?.isOpen !== false;

  return (
    <div className="space-y-8 text-left animate-in fade-in duration-200 pb-12">
      {/* Hidden File Input for Kitchen Photo */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

      {/* Header with Title and Mode Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12] tracking-tight">
            Kitchen profile
          </h2>
          <p className="text-xs sm:text-sm text-[#2B1B12]/70 mt-1">
            Manage your home kitchen identity, cooking heritage, operating status, and menu presence.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Quick Open/Closed Status Toggle */}
          <button
            type="button"
            onClick={handleToggleStatus}
            disabled={saving}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer border ${
              isOpen
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                : "bg-stone-100 text-stone-700 border-stone-300 hover:bg-stone-200"
            }`}
            title="Click to toggle kitchen ordering status"
          >
            <Power className={`w-3.5 h-3.5 ${isOpen ? "text-emerald-600" : "text-stone-500"}`} />
            <span>{isOpen ? "Kitchen Open" : "Kitchen Closed"}</span>
          </button>

          {!isEditing ? (
            <button
              onClick={() => {
                setIsEditing(true);
                setFeedback(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Kitchen</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setIsEditing(false);
                setFeedback(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#2B1B12]/20 hover:bg-stone-50 text-[#2B1B12] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-xs transition-all ${
            feedback.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Kitchen Card */}
      <div className="bg-white rounded-3xl border border-[#2B1B12]/10 overflow-hidden shadow-xs">
        {/* Cover Graphic Banner */}
        <div className="h-36 sm:h-48 bg-gradient-to-r from-[#D2552B] via-[#E27042] to-[#F4A52A] relative flex items-end p-6">
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full text-white text-xs font-semibold select-none cursor-default">
            {kitchen?.verificationStatus === "APPROVED" ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Verified Cook</span>
              </>
            ) : kitchen?.verificationStatus === "PENDING" ? (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Pending Verification</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-stone-300" />
                <span>Cook Profile</span>
              </>
            )}
          </div>

          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md text-white shadow-xs bg-black/30">
            <span
              className={`w-2 h-2 rounded-full ${
                isOpen ? "bg-emerald-400 animate-pulse" : "bg-stone-300"
              }`}
            />
            <span>{isOpen ? "Accepting Orders" : "Closed for Orders"}</span>
          </div>
        </div>

        {/* Profile Info Header Row */}
        <div className="p-6 sm:p-8 pt-0 relative">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-16 mb-6">
            <div className="flex items-end gap-4">
              {/* Kitchen Photo / Avatar with Cloudinary Upload Trigger */}
              <div className="relative group">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#2B1B12] text-[#FFF8F0] border-4 border-white flex items-center justify-center text-3xl font-extrabold shadow-lg shrink-0 overflow-hidden">
                  {kitchen?.profileImage ? (
                    <img
                      src={kitchen.profileImage}
                      alt={businessName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ChefHat className="w-10 h-10 text-[#F4A52A]" />
                  )}
                </div>

                {/* Upload Button Overlay */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute inset-0 bg-black/50 rounded-2xl flex flex-col items-center justify-center text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border-4 border-white"
                  title="Upload kitchen profile photo"
                >
                  {uploadingPhoto ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-4 h-4 mb-0.5" />
                      <span>Change</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12]">
                  {businessName}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#2B1B12]/70">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#D2552B] shrink-0" />
                    {locality}, {city}
                  </span>
                  <span>&bull;</span>
                  <span className="text-[#3E5B3A] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {kitchen?.isApprovedToSell ? "Approved to Sell" : "Application Approved"}
                  </span>
                </div>
              </div>
            </div>

            {/* Photo upload status notice */}
            {uploadingPhoto && (
              <div className="flex items-center gap-2 text-xs text-[#D2552B] font-semibold animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Uploading to Cloudinary...</span>
              </div>
            )}
          </div>

          {/* VIEW MODE vs EDIT MODE */}
          {!isEditing ? (
            /* =========================================================================
               VIEW MODE
               ========================================================================= */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-[#2B1B12]/10">
              {/* Left Column: Story, Mentorship & Specialties */}
              <div className="lg:col-span-2 space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2B1B12]/60 mb-2">
                    Kitchen Story & Heritage
                  </h4>
                  <p className="text-sm text-[#2B1B12]/85 leading-relaxed bg-[#FFF8F0] p-4 rounded-2xl border border-[#2B1B12]/5 font-normal">
                    {bio}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100/70 space-y-1">
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#2B1B12]/60 flex items-center gap-1.5">
                      <Heart className="w-3.5 h-3.5 text-[#D2552B]" />
                      <span>Culinary Mentor / Lineage</span>
                    </h5>
                    <p className="text-xs font-semibold text-[#2B1B12] mt-1">
                      {whoTaughtCooking}
                    </p>
                  </div>

                  <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-100/70 space-y-1">
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#2B1B12]/60 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F4A52A]" />
                      <span>Cooking Experience</span>
                    </h5>
                    <p className="text-xs font-semibold text-[#2B1B12] mt-1">
                      {experienceYears}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-[#2B1B12]/10 space-y-1">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#2B1B12]/60 flex items-center gap-1.5">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-[#D2552B]" />
                    <span>Signature Dish</span>
                  </h5>
                  <p className="text-xs font-semibold text-[#2B1B12] mt-1">
                    {signatureDishes}
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2B1B12]/60 mb-2">
                    Regional Cuisines & Traditions
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {cuisines.map((c, i) => (
                      <span
                        key={`cuisine-${i}`}
                        className="px-3 py-1.5 bg-[#D2552B]/10 text-[#D2552B] border border-[#D2552B]/20 rounded-xl text-xs font-bold"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Location, Service Area & Read-Only Compliance */}
              <div className="space-y-4">
                {/* Location & Service Area */}
                <div className="p-5 bg-white rounded-2xl border border-[#2B1B12]/10 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2B1B12]/70 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#D2552B]" />
                    <span>Location & Service Radius</span>
                  </h4>
                  <div className="space-y-2 text-xs text-[#2B1B12]/80">
                    <div className="flex justify-between">
                      <span className="text-[#2B1B12]/60">City:</span>
                      <span className="font-semibold">{city}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#2B1B12]/60">Locality:</span>
                      <span className="font-semibold">{locality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#2B1B12]/60">Service Area:</span>
                      <span className="font-semibold">{serviceArea}</span>
                    </div>
                  </div>
                </div>

                {/* Admin-managed verification with cook-managed FSSAI submission */}
                <div className="p-5 bg-orange-50/50 rounded-2xl border border-orange-100/80 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2B1B12]/70 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-[#D2552B]" />
                    <span>Compliance & Food Safety</span>
                  </h4>
                  <div className="space-y-2.5 text-xs text-[#2B1B12]/80">
                    <div className="flex items-center justify-between">
                      <span>Verification Status:</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {kitchen?.verificationStatus || "APPROVED"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>FSSAI License:</span>
                      <span className="font-bold text-[#3E5B3A] flex items-center gap-1">
                        {kitchen?.fssaiNumber || "Number not provided"}
                      </span>
                    </div>
                    <div className="flex justify-between"><span>Registration type:</span><span className="font-semibold">{kitchen?.fssaiStatusType?.replaceAll("_", " ") || "Not specified"}</span></div>
                    <div className="flex justify-between"><span>FSSAI status:</span><span className="font-semibold">{getCookFssaiStatusMessage(kitchen?.fssaiStatus, kitchen?.fssaiExpiryDate, kitchen?.fssaiRejectionReason).label}</span></div>
                    <div className="flex justify-between"><span>Expiry date:</span><span className="font-semibold">{kitchen?.fssaiExpiryDate ? new Date(kitchen.fssaiExpiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Not recorded"}</span></div>
                    <div className="flex items-center justify-between">
                      <span>Safety Agreement:</span>
                      <span className="font-semibold text-gray-700">
                        {kitchen?.foodSafetyAgreementVersion || "v1.0"} Signed
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Selling Status:</span>
                      <span className="font-bold text-emerald-700">
                        {kitchen?.isApprovedToSell ? "Authorized" : "Pending Verification"}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#2B1B12]/75">{getCookFssaiStatusMessage(kitchen?.fssaiStatus, kitchen?.fssaiExpiryDate, kitchen?.fssaiRejectionReason).nextAction}</p>
                  {kitchen?.fssaiRejectionReason && <p className="text-[11px] text-red-700">Review note: {kitchen.fssaiRejectionReason}</p>}
                  <form onSubmit={saveFssaiDetails} className="grid gap-2 sm:grid-cols-2 pt-2">
                    <label className="text-[11px] font-semibold">Registration status
                      <select value={fssaiDetails.fssaiStatusType} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiStatusType: event.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-orange-200 bg-white">
                        <option value="NOT_YET_REGISTERED">Not registered yet</option>
                        <option value="APPLIED_ON_FOSCOS">Application in process</option>
                        <option value="HAVE_REGISTRATION">I have a registration</option>
                      </select>
                    </label>
                    {fssaiDetails.fssaiStatusType === "HAVE_REGISTRATION" && <label className="text-[11px] font-semibold">14-digit FSSAI number
                      <input value={fssaiDetails.fssaiNumber} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiNumber: event.target.value }))} maxLength={14} inputMode="numeric" className="mt-1 w-full px-3 py-2 rounded-lg border border-orange-200" />
                    </label>}
                    {fssaiDetails.fssaiStatusType === "APPLIED_ON_FOSCOS" && <label className="text-[11px] font-semibold">FoSCoS application reference
                      <input value={fssaiDetails.fssaiApplicationReference} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiApplicationReference: event.target.value }))} maxLength={100} className="mt-1 w-full px-3 py-2 rounded-lg border border-orange-200" />
                    </label>}
                    <button type="submit" disabled={savingFssaiDetails} className="sm:col-span-2 justify-self-start px-3 py-2 rounded-lg border border-orange-300 text-xs font-bold disabled:opacity-60">{savingFssaiDetails ? "Saving…" : "Save FSSAI details"}</button>
                  </form>
                  <div className="pt-2 border-t border-orange-100 flex flex-wrap items-center gap-2">
                    <input ref={fssaiInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFssaiUpload} className="hidden" />
                    <button type="button" disabled={uploadingFssai} onClick={() => fssaiInputRef.current?.click()} className="px-3 py-2 rounded-lg bg-[#D2552B] text-white text-xs font-bold disabled:opacity-60">
                      {uploadingFssai ? "Uploading..." : "Upload / replace FSSAI document"}
                    </button>
                  </div>
                  <p className="text-[10px] text-[#2B1B12]/50 italic pt-1 border-t border-orange-100">
                    Admin verification badges are managed exclusively by TasteBridge compliance curators.
                  </p>
                </div>

                {/* Certified Chef Tag */}
                <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-1.5 text-xs">
                  <h5 className="font-bold text-[#3E5B3A] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#3E5B3A]" />
                    <span>Heritage Home Cook</span>
                  </h5>
                  <p className="text-[#3E5B3A]/85 text-[11px] leading-relaxed">
                    Identity verified and approved to share regional ancestral dishes directly with customers.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* =========================================================================
               EDIT MODE FORM
               ========================================================================= */
            <form onSubmit={handleSaveProfile} className="pt-4 border-t border-[#2B1B12]/10 space-y-6">
              <div className="bg-[#FFF8F0] p-4 rounded-2xl border border-[#2B1B12]/5">
                <p className="text-xs font-semibold text-[#2B1B12]/80">
                  Update your kitchen details below. Changes are saved directly to your live marketplace presence.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Kitchen Display Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Kitchen Display Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Alka's Kitchen"
                  />
                </div>

                {/* Open/Closed Ordering Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Ordering Status
                  </label>
                  <select
                    value={formData.isOpen ? "true" : "false"}
                    onChange={(e) => setFormData({ ...formData, isOpen: e.target.value === "true" })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                  >
                    <option value="true">Open — Accepting Customer Orders</option>
                    <option value="false">Closed — Not Accepting Orders Currently</option>
                  </select>
                </div>

                {/* Who Taught You To Cook */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Who Taught You to Cook?
                  </label>
                  <input
                    type="text"
                    value={formData.whoTaughtCooking}
                    onChange={(e) => setFormData({ ...formData, whoTaughtCooking: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Grandmother, Mother, Self-Taught, Heritage Guru"
                  />
                </div>

                {/* Cooking Experience */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Cooking Experience
                  </label>
                  <input
                    type="text"
                    value={formData.experienceYears}
                    onChange={(e) => setFormData({ ...formData, experienceYears: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., 5+ Years, 10+ Years, Lifelong Cook"
                  />
                </div>

                {/* Signature Dish */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Signature Dish
                  </label>
                  <input
                    type="text"
                    value={formData.signatureDishes}
                    onChange={(e) => setFormData({ ...formData, signatureDishes: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Awadhi Dum Biryani, Dal Baati Churma"
                  />
                </div>

                {/* Culinary Specialization */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Culinary Specialization
                  </label>
                  <input
                    type="text"
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Slow-cooked curries, Traditional breads"
                  />
                </div>

                {/* City */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Pune, Mumbai, Delhi"
                  />
                </div>

                {/* Locality */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Locality / Neighborhood
                  </label>
                  <input
                    type="text"
                    value={formData.locality}
                    onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Kothrud, Bibewadi, Bandra"
                  />
                </div>

                {/* Service Area */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Service Radius / Delivery Coverage
                  </label>
                  <input
                    type="text"
                    value={formData.serviceArea}
                    onChange={(e) => setFormData({ ...formData, serviceArea: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                    placeholder="e.g., Within 5 km radius, Across South Pune"
                  />
                </div>

                {/* Introduction & Cooking Story */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Introduction & Cooking Story
                  </label>
                  <textarea
                    rows={4}
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B] leading-relaxed"
                    placeholder="Tell food lovers about your culinary journey, cooking techniques, and ingredients..."
                  />
                </div>

                {/* Regional Cuisines Tags Editor */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-[#2B1B12]">
                    Regional Cuisines
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cuisineInput}
                      onChange={(e) => setCuisineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCuisine();
                        }
                      }}
                      className="flex-1 px-3.5 py-2 bg-white border border-[#2B1B12]/20 rounded-xl text-xs font-medium text-[#2B1B12] focus:outline-none focus:border-[#D2552B]"
                      placeholder="Add cuisine (e.g., North Indian, Awadhi, Rajasthani)..."
                    />
                    <button
                      type="button"
                      onClick={handleAddCuisine}
                      className="px-4 py-2 bg-[#2B1B12] text-white rounded-xl text-xs font-bold hover:bg-[#3E2B20] cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {formData.cuisines.map((item, idx) => (
                      <span
                        key={`cuisine-tag-${idx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#D2552B]/10 text-[#D2552B] border border-[#D2552B]/20 rounded-xl text-xs font-bold"
                      >
                        <span>{item}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCuisine(item)}
                          className="hover:text-red-700 cursor-pointer"
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2B1B12]/10">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  className="px-4 py-2.5 bg-white border border-[#2B1B12]/20 hover:bg-stone-50 text-[#2B1B12] rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Kitchen Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CookKitchenPage;
