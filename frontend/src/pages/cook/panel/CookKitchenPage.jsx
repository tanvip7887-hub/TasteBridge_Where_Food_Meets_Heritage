import { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  ChefHat,
  MapPin,
  ShieldCheck,
  Award,
  CheckCircle2,
  AlertCircle,
  Camera,
  Edit3,
  Save,
  X,
  Loader2,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { updateUserProfile } from "../../../store/slices/authSlice.js";
import { getCookFssaiStatusMessage } from "../../../utils/fssaiStatus.js";

const MissingValue = ({ onAdd }) => <span className="text-gray-500">Not added yet <button type="button" onClick={onAdd} className="ml-1 font-semibold text-[#D2552B] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Add</button></span>;

export const CookKitchenPage = () => {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();

  const [kitchen, setKitchen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
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
      setLoadError(true);
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
      <div role="status" aria-label="Loading kitchen profile" className="space-y-6 text-left animate-pulse">
        <div className="flex items-center gap-4 rounded-xl border border-[#2B1B12]/10 bg-white p-5"><div className="h-20 w-20 rounded-full bg-amber-100" /><div className="flex-1 space-y-3"><div className="h-6 w-48 rounded-lg bg-amber-100/70" /><div className="h-4 w-32 rounded-lg bg-amber-100/50" /></div><div className="h-11 w-32 rounded-xl bg-orange-100" /></div>
        <div className="grid gap-4 md:grid-cols-3"><div className="space-y-4 md:col-span-2"><div className="h-36 rounded-xl border border-[#2B1B12]/10 bg-white" /><div className="h-52 rounded-xl border border-[#2B1B12]/10 bg-white" /><div className="h-24 rounded-xl border border-[#2B1B12]/10 bg-white" /></div><div className="space-y-4"><div className="h-40 rounded-xl border border-[#2B1B12]/10 bg-white" /><div className="h-64 rounded-xl border border-[#2B1B12]/10 bg-white" /></div></div>
      </div>
    );
  }

  if (loadError && !kitchen) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-white p-6 text-left"><p className="text-sm text-red-800">{feedback?.message || "Failed to load kitchen profile."}</p><button type="button" onClick={fetchKitchenProfile} className="mt-4 min-h-11 rounded-lg bg-[#D2552B] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Retry</button></div>;
  }

  const businessName = kitchen?.businessName || user?.name || "Not added yet";
  const city = kitchen?.city || "";
  const locality = kitchen?.locality || "";
  const locationLine = [locality, city].filter(Boolean).join(", ") || "Not added yet";
  const serviceArea = kitchen?.serviceArea || "";
  const cuisines = Array.isArray(kitchen?.cuisines) ? kitchen.cuisines : [];
  const bio = kitchen?.bio || "";
  const whoTaughtCooking = kitchen?.whoTaughtCooking || "";
  const experienceYears = kitchen?.experienceYears ?? "";
  const signatureDishes = kitchen?.signatureDishes || "";
  const isOpen = kitchen?.isOpen !== false;
  const isVerified = kitchen?.verificationStatus === "APPROVED";
  const fssaiStatus = getCookFssaiStatusMessage(kitchen?.fssaiStatus, kitchen?.fssaiExpiryDate, kitchen?.fssaiRejectionReason);
  const fssaiNumber = kitchen?.fssaiNumber || "";
  const maskedFssaiNumber = fssaiNumber ? `••••••••••${fssaiNumber.slice(-4)}` : "Not added yet";

  return (
    <main className="space-y-6 pb-10 text-left animate-in fade-in duration-200">
      {/* Hidden File Input for Kitchen Photo */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/png, image/jpeg, image/jpg, image/webp"
        className="hidden"
      />

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
          <span className="flex-1">{feedback.message}</span>
          {loadError && <button type="button" onClick={() => { setFeedback(null); void fetchKitchenProfile(); }} className="min-h-11 rounded-lg px-3 text-sm font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Retry</button>}
        </div>
      )}

      <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-4 shadow-sm sm:p-6" aria-label="Kitchen profile header">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative shrink-0">
            <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-full border border-[#2B1B12]/10 bg-[#FFF8F0] text-[#F4A52A]">
              {kitchen?.profileImage ? <img src={kitchen.profileImage} alt={businessName} className="h-full w-full object-cover" /> : <ChefHat aria-hidden="true" className="h-9 w-9" />}
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} aria-label="Change kitchen photo" className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-gray-200 bg-white text-[#2B1B12] shadow-sm transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:opacity-60">
              {uploadingPhoto ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Camera aria-hidden="true" className="h-4 w-4" />}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-semibold text-[#2B1B12]">{businessName}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600"><MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-[#D2552B]" />{locationLine}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isVerified && <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />Verified</span>}
              {isOpen && <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Accepting Orders</span>}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!isEditing ? <button type="button" onClick={() => { setIsEditing(true); setFeedback(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white transition hover:bg-[#C4461C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2"><Edit3 aria-hidden="true" className="h-4 w-4" />Edit Kitchen</button> : <button type="button" onClick={() => { setIsEditing(false); setFeedback(null); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#2B1B12]/20 bg-white px-4 text-sm font-semibold text-[#2B1B12] transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X aria-hidden="true" className="h-4 w-4" />Cancel</button>}
          </div>
        </div>
      </section>

      {/* Main profile details */}
      <div>

          {/* VIEW MODE vs EDIT MODE */}
          {!isEditing ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-4 md:col-span-2">
                <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-[#2B1B12]">About</h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#2B1B12]/85">{bio || <MissingValue onAdd={() => setIsEditing(true)} />}</p>
                </section>
                <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-[#2B1B12]">Heritage</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div><p className="text-xs text-gray-500">Culinary mentor / lineage</p><p className="mt-1 text-sm font-medium text-[#2B1B12]">{whoTaughtCooking || <MissingValue onAdd={() => setIsEditing(true)} />}</p></div>
                    <div><p className="text-xs text-gray-500">Cooking experience</p><p className="mt-1 text-sm font-medium text-[#2B1B12]">{experienceYears || <MissingValue onAdd={() => setIsEditing(true)} />}</p></div>
                  </div>
                  <div className="mt-4 border-t border-gray-100 pt-4"><p className="text-xs text-gray-500">Signature dish</p><p className="mt-1 text-sm font-medium text-[#2B1B12]">{signatureDishes || <MissingValue onAdd={() => setIsEditing(true)} />}</p></div>
                </section>
                <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-[#2B1B12]">Cuisines</h2>
                  {cuisines.length ? <div className="mt-3 flex flex-wrap gap-2">{cuisines.map((cuisine, index) => <span key={`cuisine-${index}`} className="inline-flex min-h-8 items-center rounded-full border border-[#2B1B12]/10 bg-[#FFF8F0] px-3 text-sm text-[#2B1B12]/85">{cuisine}</span>)}</div> : <p className="mt-3 text-sm"><MissingValue onAdd={() => setIsEditing(true)} /></p>}
                </section>
              </div>
              <div className="space-y-4">
                <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm">
                  <h2 className="text-sm font-semibold text-[#2B1B12]">Location &amp; Service</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">City</dt><dd className="text-right font-medium text-[#2B1B12]">{city || <MissingValue onAdd={() => setIsEditing(true)} />}</dd></div>
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">Locality</dt><dd className="text-right font-medium text-[#2B1B12]">{locality || <MissingValue onAdd={() => setIsEditing(true)} />}</dd></div>
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">Service radius</dt><dd className="text-right font-medium text-[#2B1B12]">{serviceArea || <MissingValue onAdd={() => setIsEditing(true)} />}</dd></div>
                  </dl>
                </section>
                <section className="rounded-xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-[#2B1B12]"><Award aria-hidden="true" className="h-4 w-4 text-[#D2552B]" />Compliance (FSSAI)</h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><dt className="text-xs text-gray-500">Status</dt><dd><span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${fssaiStatus.status === "APPROVED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{fssaiStatus.label}</span></dd></div>
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">License number</dt><dd className="text-right font-medium text-[#2B1B12]">{maskedFssaiNumber}</dd></div>
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">Expiry date</dt><dd className="text-right font-medium text-[#2B1B12]">{kitchen?.fssaiExpiryDate ? new Date(kitchen.fssaiExpiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Not added yet"}</dd></div>
                    <div className="flex items-start justify-between gap-4"><dt className="text-xs text-gray-500">Safety agreement</dt><dd className="text-right font-medium text-[#2B1B12]">{kitchen?.foodSafetyAgreementVersion || "Not added yet"}</dd></div>
                  </dl>
                  {kitchen?.fssaiRejectionReason && <p className="mt-3 text-sm text-red-700">Review note: {kitchen.fssaiRejectionReason}</p>}
                  <details className="mt-5 border-t border-gray-100 pt-4">
                    <summary className="min-h-11 cursor-pointer list-none rounded-lg text-sm font-semibold text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Update FSSAI details</summary>
                    <div className="pt-3">
                      <form onSubmit={saveFssaiDetails} className="space-y-3">
                        <label className="block text-xs font-medium text-gray-600">Registration type
                          <select aria-label="FSSAI registration type" value={fssaiDetails.fssaiStatusType} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiStatusType: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm text-[#2B1B12] focus:outline-none focus:ring-2 focus:ring-[#D2552B]">
                            <option value="NOT_YET_REGISTERED">Not registered yet</option><option value="APPLIED_ON_FOSCOS">Application in process</option><option value="HAVE_REGISTRATION">I have a registration</option>
                          </select>
                        </label>
                        {fssaiDetails.fssaiStatusType === "HAVE_REGISTRATION" && <label className="block text-xs font-medium text-gray-600">14-digit FSSAI number<input aria-label="14-digit FSSAI number" value={fssaiDetails.fssaiNumber} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiNumber: event.target.value.replace(/\D/g, "").slice(0, 14) }))} maxLength={14} inputMode="numeric" className="mt-1 h-11 w-full rounded-lg border border-orange-200 px-3 text-sm text-[#2B1B12] focus:outline-none focus:ring-2 focus:ring-[#D2552B]" /></label>}
                        {fssaiDetails.fssaiStatusType === "APPLIED_ON_FOSCOS" && <label className="block text-xs font-medium text-gray-600">FoSCoS application reference<input aria-label="FoSCoS application reference" value={fssaiDetails.fssaiApplicationReference} onChange={(event) => setFssaiDetails((current) => ({ ...current, fssaiApplicationReference: event.target.value }))} maxLength={100} className="mt-1 h-11 w-full rounded-lg border border-orange-200 px-3 text-sm text-[#2B1B12] focus:outline-none focus:ring-2 focus:ring-[#D2552B]" /></label>}
                        <button type="submit" disabled={savingFssaiDetails} className="min-h-11 rounded-lg border border-orange-300 px-4 text-sm font-semibold text-[#2B1B12] transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:opacity-60">{savingFssaiDetails ? "Saving…" : "Save"}</button>
                      </form>
                      <input ref={fssaiInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFssaiUpload} className="hidden" />
                      <button type="button" disabled={uploadingFssai} onClick={() => fssaiInputRef.current?.click()} className="mt-3 min-h-11 w-full rounded-lg bg-[#D2552B] px-3 text-sm font-semibold text-white transition hover:bg-[#C4461C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:opacity-60">{uploadingFssai ? "Uploading…" : "Upload / replace FSSAI document"}</button>
                    </div>
                  </details>
                </section>
              </div>
            </div>
          ) : (
            /* =========================================================================
               EDIT MODE FORM
               ========================================================================= */
            <form onSubmit={handleSaveProfile} className="pt-4 border-t border-[#2B1B12]/10 space-y-6">
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
    </main>
  );
};

export default CookKitchenPage;
