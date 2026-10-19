import { useState } from "react";
import { useSelector } from "react-redux";
import { cookApi } from "../../api/cookApi.js";
import {
  ChefHat,
  User,
  MapPin,
  Clock,
  ShieldCheck,
  FileText,
  Upload,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info,
  ArrowRight,
  ArrowLeft,
  Eye,
  Check,
} from "lucide-react";

// Regional cuisines list
const REGIONAL_CUISINES = [
  "Maharashtrian",
  "Punjabi",
  "Gujarati",
  "Rajasthani",
  "Bengali",
  "South Indian",
  "Kerala",
  "Tamil",
  "Andhra",
  "Goan",
  "Kashmiri",
  "Hyderabadi",
  "North Indian",
  "Awadhi",
  "Chettinad",
  "Bihari",
  "Malvani",
  "Parsi",
];

// Dietary preferences
const DIETARY_OPTIONS = [
  "Pure Vegetarian",
  "Jain Friendly",
  "Non-Vegetarian",
  "Halal Certified Ingredients",
  "Eggetarian",
  "Vegan Options",
];

// Available days
const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// Meal slots
const MEAL_SLOTS = ["Breakfast", "Lunch", "Evening Snacks", "Dinner"];

const WIZARD_STEPS = [
  { id: 1, label: "Personal & Profile", short: "Profile" },
  { id: 2, label: "Operating Area", short: "Location" },
  { id: 3, label: "Capacity & Availability", short: "Schedule" },
  { id: 4, label: "Documents & Verification", short: "Documents" },
  { id: 5, label: "Food Safety & Review", short: "Review" },
];

export const CookApplicationForm = ({
  existingApplication,
  onApplicationSubmitted,
  onCancel,
}) => {
  const { user } = useSelector((state) => state.auth);

  // Current Wizard Step: 1 through 5
  const [currentStep, setCurrentStep] = useState(1);

  // Form State: Persists across all step navigation
  const [formData, setFormData] = useState({
    fullName: existingApplication?.user?.name || user?.name || "",
    phone: existingApplication?.user?.phone || user?.phone || "",
    businessName: existingApplication?.businessName || "",
    bio: existingApplication?.bio || "",
    experienceYears: existingApplication?.experienceYears || "5-10 years",
    specialization: existingApplication?.specialization || "",
    cuisines: Array.isArray(existingApplication?.cuisines)
      ? existingApplication.cuisines
      : ["Maharashtrian"],
    signatureDishes: existingApplication?.signatureDishes || "",
    dietaryPreferences: Array.isArray(existingApplication?.dietaryPreferences)
      ? existingApplication.dietaryPreferences
      : ["Pure Vegetarian"],
    city: existingApplication?.city || "Mumbai",
    locality: existingApplication?.locality || "",
    serviceArea: existingApplication?.serviceArea || "",
    cookingCapacity: existingApplication?.cookingCapacity || "10 - 15 meals daily",
    availableDays: Array.isArray(existingApplication?.availableDays)
      ? existingApplication.availableDays
      : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    availableMealSlots: Array.isArray(existingApplication?.availableMealSlots)
      ? existingApplication.availableMealSlots
      : ["Lunch", "Dinner"],
    prepTimeNotice: existingApplication?.prepTimeNotice || "4 hours in advance",
    isHomeKitchenDeclared: true,
    identityDocumentType: "Aadhaar Card",
    identityDocumentNumber: "",
    fssaiHasRegistration: Boolean(existingApplication?.fssaiNumber),
    fssaiStatusType: existingApplication?.fssaiStatusType || (existingApplication?.fssaiNumber ? "HAVE_REGISTRATION" : "NOT_YET_REGISTERED"),
    fssaiNumber: existingApplication?.fssaiNumber || "",
    fssaiApplicationReference: existingApplication?.fssaiApplicationReference || "",
    // CRITICAL REQUIREMENT: Must be unchecked by default
    foodSafetyConsent: false,
    foodSafetyAgreementVersion: "v1.0",
  });

  // Attached files: Persist across step changes
  const [identityFile, setIdentityFile] = useState(null);
  const [fssaiFile, setFssaiFile] = useState(null);
  const [addressFile, setAddressFile] = useState(null);

  // Submission State & Validation
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  // Toggle array item for tags
  const toggleArrayItem = (fieldName, item) => {
    setFormData((prev) => {
      const currentList = prev[fieldName] || [];
      const updatedList = currentList.includes(item)
        ? currentList.filter((i) => i !== item)
        : [...currentList, item];
      return { ...prev, [fieldName]: updatedList };
    });
    if (validationErrors[fieldName]) {
      setValidationErrors((prev) => ({ ...prev, [fieldName]: null }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    if (validationErrors[name]) {
      setValidationErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Step-by-Step Validation before advancing
  const validateStep = (stepNumber) => {
    const errors = {};

    if (stepNumber === 1) {
      if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
        errors.fullName = "Full legal name is required (at least 2 characters)";
      }
      if (!formData.businessName.trim() || formData.businessName.trim().length < 2) {
        errors.businessName = "Kitchen or cook display name is required";
      }
      if (!formData.bio.trim() || formData.bio.trim().length < 15) {
        errors.bio = "Please write at least 15 characters about your cooking story";
      }
      if (!formData.specialization.trim() || formData.specialization.trim().length < 2) {
        errors.specialization = "Specialization or primary culinary focus is required";
      }
      if (!formData.cuisines || formData.cuisines.length === 0) {
        errors.cuisines = "Please select at least one regional cuisine";
      }
      if (!formData.dietaryPreferences || formData.dietaryPreferences.length === 0) {
        errors.dietaryPreferences = "Please select at least one dietary preference";
      }
    }

    if (stepNumber === 2) {
      if (!formData.city.trim() || formData.city.trim().length < 2) {
        errors.city = "Operating city is required";
      }
      if (!formData.locality.trim() || formData.locality.trim().length < 2) {
        errors.locality = "Locality or neighborhood is required";
      }
    }

    if (stepNumber === 3) {
      if (!formData.availableDays || formData.availableDays.length === 0) {
        errors.availableDays = "Please select at least one available day of the week";
      }
      if (!formData.availableMealSlots || formData.availableMealSlots.length === 0) {
        errors.availableMealSlots = "Please select at least one meal slot";
      }
      if (!formData.isHomeKitchenDeclared) {
        errors.isHomeKitchenDeclared = "Please confirm the home kitchen declaration";
      }
    }

    if (stepNumber === 4) {
      const hasExistingIdentity = existingApplication?.user?.verificationDocuments?.some(
        (d) => d.documentType === "IDENTITY_PROOF"
      );
      if (!identityFile && !hasExistingIdentity) {
        errors.identityFile =
          "Government-issued identity proof document is required (Aadhaar, PAN, Voter ID, or Passport)";
      }
      if (formData.fssaiStatusType === "HAVE_REGISTRATION" && formData.fssaiNumber.trim() && !/^[0-9]{14}$/.test(formData.fssaiNumber.trim())) {
        errors.fssaiNumber = "Enter the 14-digit FSSAI registration number.";
      }
      if (formData.fssaiStatusType === "APPLIED_ON_FOSCOS" && formData.fssaiApplicationReference.trim() && !/^[A-Za-z0-9\-_]{5,100}$/.test(formData.fssaiApplicationReference.trim())) {
        errors.fssaiApplicationReference = "Enter a valid FoSCoS application reference.";
      }
    }

    if (stepNumber === 5) {
      // CRITICAL FOOD SAFETY CONSENT ENFORCEMENT
      if (!formData.foodSafetyConsent) {
        errors.foodSafetyConsent =
          "You must agree to the Food Safety & Hygiene Agreement before submitting your application.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setErrorMessage(null);
      setCurrentStep((prev) => Math.min(prev + 1, 5));
      window.scrollTo({ top: 120, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 200, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 120, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate Step 5
    if (!validateStep(5)) {
      return;
    }

    try {
      setSubmitting(true);

      const submission = new FormData();
      // Text values
      submission.append("fullName", formData.fullName.trim());
      submission.append("phone", formData.phone.trim());
      submission.append("businessName", formData.businessName.trim());
      submission.append("bio", formData.bio.trim());
      submission.append("experienceYears", formData.experienceYears);
      submission.append("specialization", formData.specialization.trim());
      submission.append("cuisines", JSON.stringify(formData.cuisines));
      submission.append("signatureDishes", formData.signatureDishes.trim());
      submission.append("dietaryPreferences", JSON.stringify(formData.dietaryPreferences));
      submission.append("city", formData.city.trim());
      submission.append("locality", formData.locality.trim());
      submission.append("serviceArea", formData.serviceArea.trim());
      submission.append("cookingCapacity", formData.cookingCapacity);
      submission.append("availableDays", JSON.stringify(formData.availableDays));
      submission.append("availableMealSlots", JSON.stringify(formData.availableMealSlots));
      submission.append("prepTimeNotice", formData.prepTimeNotice);
      submission.append("isHomeKitchenDeclared", "true");
      submission.append("identityDocumentType", formData.identityDocumentType);
      submission.append("identityDocumentNumber", formData.identityDocumentNumber.trim());

      // FSSAI values
      submission.append("fssaiStatusType", formData.fssaiStatusType);
      submission.append("fssaiHasRegistration", formData.fssaiStatusType === "HAVE_REGISTRATION" ? "true" : "false");
      if (formData.fssaiStatusType === "HAVE_REGISTRATION" && formData.fssaiNumber.trim()) {
        submission.append("fssaiNumber", formData.fssaiNumber.trim());
      }
      if (formData.fssaiStatusType === "APPLIED_ON_FOSCOS" && formData.fssaiApplicationReference.trim()) {
        submission.append("fssaiApplicationReference", formData.fssaiApplicationReference.trim());
      }

      // Agreement version and explicit consent
      submission.append("foodSafetyConsent", "true");
      submission.append("foodSafetyAgreementVersion", "v1.0");

      // File attachments
      if (identityFile) {
        submission.append("identityProof", identityFile);
      }
      if (fssaiFile) {
        submission.append("fssaiProof", fssaiFile);
      }
      if (addressFile) {
        submission.append("addressProof", addressFile);
      }

      const res = await cookApi.submitApplication(submission);
      if (onApplicationSubmitted) {
        onApplicationSubmitted(res.data);
      }
    } catch (err) {
      setErrorMessage(
        err.message || "Failed to submit cook application. Please try again."
      );
      window.scrollTo({ top: 120, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* =========================================================================
          WIZARD HEADER & PROGRESS INDICATOR (Step X of 5)
          ========================================================================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-100/90 shadow-sm mb-6 text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="px-3 py-1 rounded-full bg-amber-100/80 text-amber-900 text-xs font-bold uppercase tracking-wider inline-block">
              Step {currentStep} of 5
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight mt-1">
              {WIZARD_STEPS[currentStep - 1].label}
            </h1>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors self-start sm:self-auto cursor-pointer"
            >
              ← Back to Overview
            </button>
          )}
        </div>

        {/* Visual Progress Bar */}
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-red-600 to-amber-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 5) * 100}%` }}
          />
        </div>

        {/* Step Indicators Bubble Strip */}
        <div className="grid grid-cols-5 gap-1 pt-1">
          {WIZARD_STEPS.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  if (step.id < currentStep) setCurrentStep(step.id);
                }}
                disabled={step.id > currentStep}
                className={`text-left p-1.5 sm:p-2 rounded-xl transition-all ${
                  isCurrent
                    ? "bg-orange-50 border border-orange-200"
                    : isCompleted
                    ? "cursor-pointer hover:bg-gray-50"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                      isCompleted
                        ? "bg-emerald-600 text-white"
                        : isCurrent
                        ? "bg-red-600 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : step.id}
                  </div>
                  <span
                    className={`hidden sm:inline text-[11px] font-semibold truncate ${
                      isCurrent
                        ? "text-red-700 font-bold"
                        : isCompleted
                        ? "text-gray-800"
                        : "text-gray-400"
                    }`}
                  >
                    {step.short}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Error Alert Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs font-semibold animate-in fade-in text-left">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block text-sm">Submission Error</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 1: PERSONAL & COOK PROFILE
          ========================================================================= */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-red-600" /> Personal Identity & Story
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Introduce yourself and the culinary heritage of your kitchen
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                placeholder="e.g. Sudha Patil"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.fullName ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.fullName && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.fullName}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Contact Phone / WhatsApp *
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="e.g. 9876543210"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Kitchen / Cook Display Name *
            </label>
            <input
              type="text"
              name="businessName"
              value={formData.businessName}
              onChange={handleInputChange}
              placeholder="e.g. Aaji's Rasoi, Amma's Kitchen, Meera's Home Table"
              className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                validationErrors.businessName ? "border-red-500 bg-red-50/30" : "border-gray-200"
              }`}
            />
            {validationErrors.businessName && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.businessName}
              </span>
            )}
            <span className="text-[11px] text-gray-500 mt-1 block">
              This is the kitchen name customers will see on TasteBridge.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Short Introduction & Cooking Story *
            </label>
            <textarea
              name="bio"
              rows={3}
              value={formData.bio}
              onChange={handleInputChange}
              placeholder="Tell us about yourself: who taught you to cook, your family traditions, and what makes your food special..."
              className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                validationErrors.bio ? "border-red-500 bg-red-50/30" : "border-gray-200"
              }`}
            />
            {validationErrors.bio && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.bio}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Cooking Experience *
              </label>
              <select
                name="experienceYears"
                value={formData.experienceYears}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="1-3 years">1 - 3 years (Passionate beginner)</option>
                <option value="3-5 years">3 - 5 years (Seasoned home cook)</option>
                <option value="5-10 years">5 - 10 years (Family culinary staple)</option>
                <option value="10-20 years">10 - 20 years (Master homemaker)</option>
                <option value="20+ years">20+ years (Heirloom heritage cook / Grandmother)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Primary Specialty / Focus *
              </label>
              <input
                type="text"
                name="specialization"
                value={formData.specialization}
                onChange={handleInputChange}
                placeholder="e.g. Traditional Malvani Seafood, Authentic Kathiyawadi Thali"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.specialization ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.specialization && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.specialization}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Regional Cuisines You Prepare * (Select at least one)
            </label>
            <div className="flex flex-wrap gap-2">
              {REGIONAL_CUISINES.map((cuisine) => {
                const selected = formData.cuisines.includes(cuisine);
                return (
                  <button
                    key={cuisine}
                    type="button"
                    onClick={() => toggleArrayItem("cuisines", cuisine)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? "bg-red-600 text-white shadow-xs"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {cuisine} {selected ? "✓" : "+"}
                  </button>
                );
              })}
            </div>
            {validationErrors.cuisines && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.cuisines}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Your Signature Dishes & Specialties
            </label>
            <input
              type="text"
              name="signatureDishes"
              value={formData.signatureDishes}
              onChange={handleInputChange}
              placeholder="e.g. Puran Poli, Solkadhi, Pitla Bhakri, Stuffed Parathas"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Dietary & Food Preferences Handled *
            </label>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((pref) => {
                const selected = formData.dietaryPreferences.includes(pref);
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => toggleArrayItem("dietaryPreferences", pref)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {pref} {selected ? "✓" : "+"}
                  </button>
                );
              })}
            </div>
            {validationErrors.dietaryPreferences && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.dietaryPreferences}
              </span>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 2: OPERATING LOCATION & NEIGHBORHOOD
          ========================================================================= */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" /> Operating Location & Service Area
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Where your home kitchen is located for delivery partner pickups
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                City *
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="e.g. Mumbai, Pune, Bengaluru"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.city ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.city && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.city}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Locality / Area / Ward *
              </label>
              <input
                type="text"
                name="locality"
                value={formData.locality}
                onChange={handleInputChange}
                placeholder="e.g. Dadar West, Kothrud, Indiranagar"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.locality ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.locality && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.locality}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Service Delivery Radius / Landmark
            </label>
            <input
              type="text"
              name="serviceArea"
              value={formData.serviceArea}
              onChange={handleInputChange}
              placeholder="e.g. Within 5-7 km of Shivaji Park / Dadar station"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <span className="text-[11px] text-gray-500 mt-1 block">
              Helps our delivery partners ensure fresh, hot delivery within your neighborhood.
            </span>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 3: COOKING CAPACITY & AVAILABILITY
          ========================================================================= */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" /> Cooking Capacity & Availability
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              You stay in control of your daily routine and portion limits
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Typical Cooking Capacity (Meals / Day) *
              </label>
              <select
                name="cookingCapacity"
                value={formData.cookingCapacity}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="5 - 10 meals daily">5 - 10 meals daily (Cozy & manageable)</option>
                <option value="10 - 15 meals daily">10 - 15 meals daily (Standard home kitchen)</option>
                <option value="15 - 25 meals daily">15 - 25 meals daily (Active family kitchen)</option>
                <option value="25+ meals daily">25+ meals daily (High capacity)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Typical Preparation Notice Required *
              </label>
              <select
                name="prepTimeNotice"
                value={formData.prepTimeNotice}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="2 hours in advance">2 hours in advance (Same day)</option>
                <option value="4 hours in advance">4 hours in advance</option>
                <option value="Same day morning (by 10 AM)">Same day morning (by 10 AM)</option>
                <option value="1 day prior advance notice">1 day prior (Pre-order only)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Available Days of the Week *
            </label>
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const selected = formData.availableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleArrayItem("availableDays", day)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? "bg-amber-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {day} {selected ? "✓" : "+"}
                  </button>
                );
              })}
            </div>
            {validationErrors.availableDays && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.availableDays}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Meal Slots Offered *
            </label>
            <div className="flex flex-wrap gap-2">
              {MEAL_SLOTS.map((slot) => {
                const selected = formData.availableMealSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => toggleArrayItem("availableMealSlots", slot)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      selected
                        ? "bg-red-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {slot} {selected ? "✓" : "+"}
                  </button>
                );
              })}
            </div>
            {validationErrors.availableMealSlots && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.availableMealSlots}
              </span>
            )}
          </div>

          {/* Home Kitchen Readiness Declaration */}
          <div className="p-4 bg-orange-50/70 border border-orange-200 rounded-2xl flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950">
              <span className="font-bold block text-sm">Domestic Home Kitchen Readiness</span>
              <span>
                By proceeding, you declare that you prepare meals in a hygienic, domestic home kitchen with clean drinking water, fresh ingredients, and safe food storage practices.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 4: IDENTITY DOCUMENTS & FSSAI VERIFICATION
          ========================================================================= */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Identity & FSSAI Compliance
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Documents are stored securely and never made public.
            </p>
          </div>

          {/* 1. Government Identity Proof */}
          <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-red-600" /> 1. Government Identity Proof *
              </label>
              <span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded">
                Required
              </span>
            </div>

            <p className="text-[11px] text-gray-500">
              Upload one accepted document: Aadhaar Card, PAN Card, Voter ID, or Passport. (PDF, JPG, or PNG, max 5MB).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Document Type
                </label>
                <select
                  name="identityDocumentType"
                  value={formData.identityDocumentType}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-200 text-xs"
                >
                  <option value="Aadhaar Card">Aadhaar Card</option>
                  <option value="PAN Card">PAN Card</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Passport">Passport</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                  Document Number (Optional)
                </label>
                <input
                  type="text"
                  name="identityDocumentNumber"
                  value={formData.identityDocumentNumber}
                  onChange={handleInputChange}
                  placeholder="e.g. XXXX-XXXX-1234"
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-200 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                Upload File *
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  id="identityFile"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setIdentityFile(e.target.files[0])}
                  className="hidden"
                />
                <label
                  htmlFor="identityFile"
                  className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{identityFile ? identityFile.name : "Choose Identity File"}</span>
                </label>
                {identityFile && (
                  <span className="text-[11px] text-emerald-600 font-semibold">
                    ✓ {(identityFile.size / 1024 / 1024).toFixed(2)} MB selected
                  </span>
                )}
              </div>
              {validationErrors.identityFile && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.identityFile}
                </span>
              )}
            </div>
          </div>

          {/* 2. FSSAI Registration / FoSCoS Notice */}
          <div className="space-y-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> 2. FSSAI Registration / Licence (FoSCoS)
              </label>
              <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                Compliance Required to Sell
              </span>
            </div>

            <div className="p-3 bg-blue-100/60 rounded-xl text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <strong>Current FoSCoS Legal Requirement:</strong> Under Indian food safety regulations, all food businesses must register with FSSAI. Selling on TasteBridge will be enabled once your 14-digit FSSAI licence/registration is verified.
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Your Current FSSAI Status
              </label>
              <select
                name="fssaiStatusType"
                value={formData.fssaiStatusType}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-200 text-xs"
              >
                <option value="HAVE_REGISTRATION">I already hold an active 14-digit FSSAI Registration / Licence</option>
                <option value="APPLIED_ON_FOSCOS">I have applied on FoSCoS (Application in progress)</option>
                <option value="NOT_YET_REGISTERED">I don't have it yet (I will apply with TasteBridge assistance)</option>
              </select>
            </div>

            {formData.fssaiStatusType !== "NOT_YET_REGISTERED" && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    {formData.fssaiStatusType === "HAVE_REGISTRATION" ? "14-Digit FSSAI Registration Number" : "FoSCoS Application Reference"}
                  </label>
                  <input
                    type="text"
                    name={formData.fssaiStatusType === "HAVE_REGISTRATION" ? "fssaiNumber" : "fssaiApplicationReference"}
                    value={formData.fssaiStatusType === "HAVE_REGISTRATION" ? formData.fssaiNumber : formData.fssaiApplicationReference}
                    onChange={handleInputChange}
                    placeholder={formData.fssaiStatusType === "HAVE_REGISTRATION" ? "e.g. 10022000000000" : "e.g. FoSCoS-XXXX"}
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-xs ${
                      validationErrors[formData.fssaiStatusType === "HAVE_REGISTRATION" ? "fssaiNumber" : "fssaiApplicationReference"] ? "border-red-500" : "border-gray-200"
                    }`}
                  />
                  {validationErrors[formData.fssaiStatusType === "HAVE_REGISTRATION" ? "fssaiNumber" : "fssaiApplicationReference"] && (
                    <span className="text-[11px] text-red-600 mt-1 block">
                      {validationErrors[formData.fssaiStatusType === "HAVE_REGISTRATION" ? "fssaiNumber" : "fssaiApplicationReference"]}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Upload FSSAI Certificate / Acknowledgement Slip
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="fssaiFile"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setFssaiFile(e.target.files[0])}
                      className="hidden"
                    />
                    <label
                      htmlFor="fssaiFile"
                      className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{fssaiFile ? fssaiFile.name : "Choose FSSAI Document"}</span>
                    </label>
                    {fssaiFile && (
                      <span className="text-[11px] text-emerald-600 font-semibold">
                        ✓ {(fssaiFile.size / 1024 / 1024).toFixed(2)} MB selected
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Operating Address Proof (Optional) */}
          <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900">
                3. Operating Kitchen Address Proof (Optional)
              </label>
              <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Only required if your kitchen address is different from your government ID (e.g., electricity bill, rental agreement).
            </p>

            <div className="flex items-center gap-3 pt-1">
              <input
                type="file"
                id="addressFile"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setAddressFile(e.target.files[0])}
                className="hidden"
              />
              <label
                htmlFor="addressFile"
                className="px-4 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{addressFile ? addressFile.name : "Choose Address Proof File"}</span>
              </label>
              {addressFile && (
                <span className="text-[11px] text-emerald-600 font-semibold">
                  ✓ {(addressFile.size / 1024 / 1024).toFixed(2)} MB selected
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 5: REVIEW ALL DETAILS & REQUIRED FOOD SAFETY AGREEMENT
          ========================================================================= */}
      {currentStep === 5 && (
        <form onSubmit={handleSubmit} className="space-y-6 text-left animate-in fade-in">
          {/* Review Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-5">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-red-600" /> Application Summary Review
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Verify your information before final submission
                </p>
              </div>
            </div>

            {/* Profile Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-orange-50/40 p-4 rounded-2xl border border-orange-100">
              <div>
                <span className="text-gray-500 block font-medium">Applicant Name</span>
                <span className="font-bold text-gray-900">{formData.fullName} ({formData.phone})</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Kitchen Display Name</span>
                <span className="font-bold text-gray-900">{formData.businessName}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Specialization & Experience</span>
                <span className="font-semibold text-gray-800">{formData.specialization} • {formData.experienceYears}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Location</span>
                <span className="font-semibold text-gray-800">{formData.locality}, {formData.city}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-gray-500 block font-medium mb-1">Cuisines Selected</span>
                <div className="flex flex-wrap gap-1">
                  {formData.cuisines.map((c, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-semibold text-[10px]">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Daily Capacity</span>
                <span className="font-semibold text-gray-800">{formData.cookingCapacity}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Notice Lead Time</span>
                <span className="font-semibold text-gray-800">{formData.prepTimeNotice}</span>
              </div>
            </div>

            {/* Documents Overview */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2 text-xs">
              <span className="font-bold text-gray-900 block">Attached Verification Documents</span>
              <div className="space-y-1 text-gray-700">
                <p>• Government ID: <strong>{formData.identityDocumentType}</strong> {identityFile ? `(${identityFile.name})` : "(Saved)"}</p>
                <p>• FSSAI: <strong>{formData.fssaiNumber || "Registration Pending"}</strong> {fssaiFile ? `(${fssaiFile.name})` : ""}</p>
                {addressFile && <p>• Address Proof: <strong>{addressFile.name}</strong></p>}
              </div>
            </div>
          </div>

          {/* =========================================================================
              REQUIRED FOOD-SAFETY AGREEMENT
              ========================================================================= */}
          <div className="bg-[#FFF9F2] rounded-3xl p-6 sm:p-8 border border-orange-200/80 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-red-600" /> Food Safety & Hygiene Agreement
            </h3>

            <div
              className={`p-4 rounded-2xl border transition-all ${
                validationErrors.foodSafetyConsent
                  ? "bg-red-50/60 border-red-300 ring-2 ring-red-400"
                  : "bg-white border-orange-200"
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                {/* Checkbox: Unchecked by default */}
                <input
                  type="checkbox"
                  name="foodSafetyConsent"
                  id="foodSafetyConsentCheckbox"
                  checked={formData.foodSafetyConsent}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500 mt-0.5 shrink-0 cursor-pointer"
                />
                <div className="space-y-1">
                  <span className="text-xs sm:text-sm font-semibold text-gray-900 leading-relaxed block">
                    “I agree to follow all applicable food safety and hygiene requirements, provide accurate information, and maintain any registrations or licences required to prepare and sell food through TasteBridge.”
                  </span>
                  <span className="text-[11px] text-gray-500 block">
                    Agreement Version v1.0 • Your timestamped consent will be saved in accordance with food regulatory guidelines.
                  </span>
                </div>
              </label>

              {validationErrors.foodSafetyConsent && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-red-600 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{validationErrors.foodSafetyConsent}</span>
                </div>
              )}
            </div>
          </div>

          {/* Final Submit & Back Buttons */}
          <div className="pt-2 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Edit Documents</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-red-600/25 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Application...</span>
                </>
              ) : (
                <>
                  <ChefHat className="w-4 h-4" />
                  <span>
                    {existingApplication?.verificationStatus === "NEEDS_REVISION"
                      ? "Resubmit Revised Application"
                      : "Submit Cook Application"}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          WIZARD STEP NAVIGATION FOOTER (FOR STEPS 1 THROUGH 4)
          ========================================================================= */}
      {currentStep < 5 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handlePrevStep}
              className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNextStep}
            className="px-7 py-3.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-red-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer ml-auto"
          >
            <span>Continue to Step {currentStep + 1}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CookApplicationForm;
