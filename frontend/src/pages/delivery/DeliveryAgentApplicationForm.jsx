import { useState } from "react";
import { useSelector } from "react-redux";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";
import {
  Bike,
  User,
  MapPin,
  ShieldCheck,
  FileText,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Phone,
  Mail,
  Camera,
} from "lucide-react";

const WIZARD_STEPS = [
  { id: 1, label: "Personal Information", short: "Personal" },
  { id: 2, label: "Residential Address", short: "Address" },
  { id: 3, label: "Delivery & Vehicle", short: "Vehicle" },
  { id: 4, label: "Document Verification", short: "Documents" },
  { id: 5, label: "Declaration & Submit", short: "Submit" },
];

const DELIVERY_MODES = [
  {
    id: "TWO_WHEELER",
    title: "Two-Wheeler",
    desc: "Motorcycle, scooter, or EV scooter. Required for wider delivery radius.",
    requiresVehicleDetails: true,
  },
  {
    id: "BICYCLE",
    title: "Bicycle",
    desc: "Eco-friendly, zero fuel costs. Perfect for dense local neighborhoods.",
    requiresVehicleDetails: false,
  },
  {
    id: "WALKING",
    title: "Walking / On-Foot",
    desc: "Hyper-local cluster delivery within immediate home kitchen vicinity.",
    requiresVehicleDetails: false,
  },
];

export const DeliveryAgentApplicationForm = ({
  existingApplication,
  onApplicationSubmitted,
  onCancel,
}) => {
  const { user } = useSelector((state) => state.auth);

  const [currentStep, setCurrentStep] = useState(1);

  // Form Data State
  const [formData, setFormData] = useState({
    // Personal Information
    fullName: existingApplication?.user?.name || user?.name || "",
    email: existingApplication?.user?.email || user?.email || "",
    phone: existingApplication?.user?.phone || user?.phone || "",
    dateOfBirth: existingApplication?.dateOfBirth || "",
    gender: existingApplication?.gender || "",

    // Address Information
    addressLine1: existingApplication?.address?.addressLine1 || "",
    locality: existingApplication?.address?.locality || "",
    city: existingApplication?.address?.city || "Mumbai",
    state: existingApplication?.address?.state || "Maharashtra",
    pincode: existingApplication?.address?.pincode || "",

    // Delivery and Vehicle Information
    deliveryType: existingApplication?.deliveryType || "TWO_WHEELER",
    vehicleType: existingApplication?.rawVehicleType || "Motorcycle",
    vehicleNumber: existingApplication?.vehicleNumber || "",
    licenseNumber: existingApplication?.licenseNumber || "",
    emergencyContactName: existingApplication?.emergencyContactName || "",
    emergencyContactPhone: existingApplication?.emergencyContactPhone || "",

    // Identity Document Info
    identityDocumentType: "Aadhaar Card",
    identityDocumentNumber: "",

    // Consent Declarations
    accurateInfoDeclaration: false,
    termsConsent: false,
  });

  // Attached Files State
  const [identityFile, setIdentityFile] = useState(null);
  const [drivingLicenseFile, setDrivingLicenseFile] = useState(null);
  const [vehicleRegistrationFile, setVehicleRegistrationFile] = useState(null);
  const [addressFile, setAddressFile] = useState(null);
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);

  // Status and Validation
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

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

  const handleProfilePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setValidationErrors((prev) => ({
          ...prev,
          profilePhoto: "Profile photo must be less than 5MB",
        }));
        return;
      }
      setProfilePhotoFile(file);
      const previewUrl = URL.createObjectURL(file);
      setProfilePhotoPreview(previewUrl);
      setValidationErrors((prev) => ({ ...prev, profilePhoto: null }));
    }
  };

  const removeProfilePhoto = () => {
    if (profilePhotoPreview) {
      URL.revokeObjectURL(profilePhotoPreview);
    }
    setProfilePhotoFile(null);
    setProfilePhotoPreview(null);
  };

  const validateStep = (stepNumber) => {
    const errors = {};

    if (stepNumber === 1) {
      if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
        errors.fullName = "Full legal name is required (at least 2 characters)";
      }
      if (!formData.phone.trim() || !/^\+?[0-9]{10,14}$/.test(formData.phone.trim())) {
        errors.phone = "Valid 10-14 digit mobile number is required";
      }
      if (!formData.dateOfBirth) {
        errors.dateOfBirth = "Date of birth is required";
      } else {
        const birthDate = new Date(formData.dateOfBirth);
        if (isNaN(birthDate.getTime())) {
          errors.dateOfBirth = "Please enter a valid date of birth";
        } else {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age < 18) {
            errors.dateOfBirth = "Delivery partners must be at least 18 years old";
          }
        }
      }
    }

    if (stepNumber === 2) {
      if (!formData.addressLine1.trim() || formData.addressLine1.trim().length < 3) {
        errors.addressLine1 = "House/flat number and street name are required";
      }
      if (!formData.locality.trim() || formData.locality.trim().length < 2) {
        errors.locality = "Area or locality is required";
      }
      if (!formData.city.trim() || formData.city.trim().length < 2) {
        errors.city = "City is required";
      }
      if (!formData.state.trim() || formData.state.trim().length < 2) {
        errors.state = "State is required";
      }
      if (!formData.pincode.trim() || !/^[1-9][0-9]{5}$/.test(formData.pincode.trim())) {
        errors.pincode = "Valid 6-digit Indian PIN code is required";
      }
    }

    if (stepNumber === 3) {
      if (formData.deliveryType === "TWO_WHEELER") {
        if (!formData.vehicleType || !formData.vehicleType.trim()) {
          errors.vehicleType = "Vehicle type is required for two-wheeler delivery";
        }
        if (!formData.vehicleNumber || !formData.vehicleNumber.trim()) {
          errors.vehicleNumber = "Vehicle registration number is required";
        }
        if (!formData.licenseNumber || !formData.licenseNumber.trim()) {
          errors.licenseNumber = "Driving license number is required";
        }
      }
      if (!formData.emergencyContactName.trim() || formData.emergencyContactName.trim().length < 2) {
        errors.emergencyContactName = "Emergency contact name is required";
      }
      if (!formData.emergencyContactPhone.trim() || !/^\+?[0-9]{10,14}$/.test(formData.emergencyContactPhone.trim())) {
        errors.emergencyContactPhone = "Valid emergency contact phone number is required";
      }
    }

    if (stepNumber === 4) {
      const hasExistingIdentity = existingApplication?.user?.verificationDocuments?.some(
        (d) => d.documentType === "IDENTITY_PROOF"
      );
      if (!identityFile && !hasExistingIdentity) {
        errors.identityProof = "Government-issued identity proof document is required";
      }

      if (formData.deliveryType === "TWO_WHEELER") {
        const hasExistingDl = existingApplication?.user?.verificationDocuments?.some(
          (d) => d.documentType === "DRIVING_LICENSE"
        );
        if (!drivingLicenseFile && !hasExistingDl) {
          errors.drivingLicense = "Driving license document is required for two-wheeler delivery";
        }

        const hasExistingRc = existingApplication?.user?.verificationDocuments?.some(
          (d) => d.documentType === "VEHICLE_REGISTRATION"
        );
        if (!vehicleRegistrationFile && !hasExistingRc) {
          errors.vehicleRegistration = "Vehicle registration certificate (RC) is required";
        }
      }
    }

    if (stepNumber === 5) {
      if (!formData.accurateInfoDeclaration) {
        errors.accurateInfoDeclaration = "You must confirm that your details are accurate.";
      }
      if (!formData.termsConsent) {
        errors.termsConsent = "You must agree to the delivery partner terms and privacy policy.";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setErrorMessage(null);
      setCurrentStep((prev) => Math.min(prev + 1, 5));
      window.scrollTo({ top: 100, behavior: "smooth" });
    } else {
      window.scrollTo({ top: 180, behavior: "smooth" });
    }
  };

  const handlePrevStep = () => {
    setErrorMessage(null);
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 100, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateStep(5)) {
      return;
    }

    try {
      setSubmitting(true);

      const payload = new FormData();
      // Personal
      payload.append("fullName", formData.fullName.trim());
      payload.append("phone", formData.phone.trim());
      payload.append("dateOfBirth", formData.dateOfBirth);
      if (formData.gender) payload.append("gender", formData.gender);

      // Address
      payload.append("addressLine1", formData.addressLine1.trim());
      payload.append("locality", formData.locality.trim());
      payload.append("city", formData.city.trim());
      payload.append("state", formData.state.trim());
      payload.append("pincode", formData.pincode.trim());

      // Delivery & Vehicle
      payload.append("deliveryType", formData.deliveryType);
      if (formData.deliveryType === "TWO_WHEELER") {
        payload.append("vehicleType", formData.vehicleType.trim());
        payload.append("vehicleNumber", formData.vehicleNumber.trim());
        payload.append("licenseNumber", formData.licenseNumber.trim());
      } else {
        payload.append("vehicleType", formData.deliveryType === "BICYCLE" ? "Bicycle" : "Walking");
        payload.append("vehicleNumber", "");
        payload.append("licenseNumber", "");
      }
      payload.append("emergencyContactName", formData.emergencyContactName.trim());
      payload.append("emergencyContactPhone", formData.emergencyContactPhone.trim());

      // Documents info
      payload.append("identityDocumentType", formData.identityDocumentType);
      if (formData.identityDocumentNumber) {
        payload.append("identityDocumentNumber", formData.identityDocumentNumber.trim());
      }

      // Declarations
      payload.append("accurateInfoDeclaration", "true");
      payload.append("termsConsent", "true");

      // File attachments
      if (identityFile) {
        payload.append("identityProof", identityFile);
      }
      if (drivingLicenseFile && formData.deliveryType === "TWO_WHEELER") {
        payload.append("drivingLicense", drivingLicenseFile);
      }
      if (vehicleRegistrationFile && formData.deliveryType === "TWO_WHEELER") {
        payload.append("vehicleRegistration", vehicleRegistrationFile);
      }
      if (addressFile) {
        payload.append("addressProof", addressFile);
      }
      if (profilePhotoFile) {
        payload.append("profilePhoto", profilePhotoFile);
      }

      const res = await deliveryAgentApi.submitApplication(payload);
      if (onApplicationSubmitted) {
        onApplicationSubmitted(res.data);
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to submit delivery registration. Please try again.");
      window.scrollTo({ top: 100, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* =========================================================================
          WIZARD HEADER & PROGRESS INDICATOR
          Matching CookApplicationForm layout with TasteBridge branding
          ========================================================================= */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-100 shadow-sm mb-6 text-left space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="px-3 py-1 rounded-full bg-red-100/90 text-red-700 text-xs font-bold uppercase tracking-wider inline-block">
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

        {/* Progress Bar & Step Dots */}
        <div className="space-y-2 pt-2">
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-red-600 to-amber-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(currentStep / 5) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-5 gap-1 text-center">
            {WIZARD_STEPS.map((step) => {
              const isPassed = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div key={step.id} className="flex flex-col items-center">
                  <span
                    className={`text-[10px] sm:text-xs font-bold transition-colors ${
                      isCurrent
                        ? "text-red-600"
                        : isPassed
                        ? "text-gray-900"
                        : "text-gray-400"
                    }`}
                  >
                    {step.short}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-left animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-900 flex-1">
            <span className="font-bold block text-sm">Submission Error</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 1: PERSONAL INFORMATION
          ========================================================================= */}
      {currentStep === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <User className="w-4 h-4 text-red-600" /> Personal & Contact Details
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Please provide your legal contact details as they appear on your government identity proof
            </p>
          </div>

          {/* Profile Photo Upload (Optional) */}
          <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-2xl flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-20 h-20 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
              {profilePhotoPreview ? (
                <img
                  src={profilePhotoPreview}
                  alt="Profile Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left space-y-1">
              <span className="text-xs font-bold text-gray-900 block">
                Profile Photo (Optional)
              </span>
              <p className="text-[11px] text-gray-500">
                Helps home cooks and customers recognize you when picking up or delivering meals (JPG/PNG, max 5MB).
              </p>
              <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                <input
                  type="file"
                  id="profilePhotoInput"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleProfilePhotoSelect}
                  className="hidden"
                />
                <label
                  htmlFor="profilePhotoInput"
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {profilePhotoFile ? "Replace Photo" : "Upload Photo"}
                </label>
                {profilePhotoFile && (
                  <button
                    type="button"
                    onClick={removeProfilePhoto}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Remove photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {validationErrors.profilePhoto && (
                <span className="text-[11px] text-red-600 block mt-1">
                  {validationErrors.profilePhoto}
                </span>
              )}
            </div>
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
                placeholder="e.g. Rajesh Kumar Sharma"
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
                Mobile Number *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+91 98765 43210"
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    validationErrors.phone ? "border-red-500 bg-red-50/30" : "border-gray-200"
                  }`}
                />
              </div>
              {validationErrors.phone && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.phone}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address (Account ID)
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  disabled
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-xs cursor-not-allowed"
                />
              </div>
              <span className="text-[10px] text-gray-400 mt-1 block">
                Linked to your active TasteBridge login account
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Date of Birth * (Must be 18+)
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleInputChange}
                  className={`w-full pl-9 pr-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    validationErrors.dateOfBirth ? "border-red-500 bg-red-50/30" : "border-gray-200"
                  }`}
                />
              </div>
              {validationErrors.dateOfBirth && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.dateOfBirth}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Gender (Optional)
            </label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleInputChange}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Select gender (Optional)</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 2: RESIDENTIAL ADDRESS INFORMATION
          ========================================================================= */}
      {currentStep === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-600" /> Residential Address
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Your home locality is used to assign neighborhood delivery clusters with minimal transit distance
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              House Number / Building / Street *
            </label>
            <input
              type="text"
              name="addressLine1"
              value={formData.addressLine1}
              onChange={handleInputChange}
              placeholder="e.g. Flat 301, Shanti Niketan, Tilak Road"
              className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                validationErrors.addressLine1 ? "border-red-500 bg-red-50/30" : "border-gray-200"
              }`}
            />
            {validationErrors.addressLine1 && (
              <span className="text-[11px] text-red-600 mt-1 block">
                {validationErrors.addressLine1}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Area / Locality / Neighborhood *
              </label>
              <input
                type="text"
                name="locality"
                value={formData.locality}
                onChange={handleInputChange}
                placeholder="e.g. Bandra West, Shivaji Nagar"
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

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                City *
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                placeholder="e.g. Mumbai, Pune, Ahmedabad"
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                State *
              </label>
              <input
                type="text"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                placeholder="e.g. Maharashtra, Gujarat"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.state ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.state && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.state}
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                PIN Code * (6 Digits)
              </label>
              <input
                type="text"
                name="pincode"
                maxLength={6}
                value={formData.pincode}
                onChange={handleInputChange}
                placeholder="e.g. 400050"
                className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                  validationErrors.pincode ? "border-red-500 bg-red-50/30" : "border-gray-200"
                }`}
              />
              {validationErrors.pincode && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.pincode}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 3: DELIVERY & VEHICLE INFORMATION
          Conditional logic: Vehicle & DL only required for TWO_WHEELER mode
          ========================================================================= */}
      {currentStep === 3 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-600" /> Delivery Mode & Vehicle
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Select how you plan to deliver meals. Motorized vehicles require registration and driving licence details.
            </p>
          </div>

          {/* Delivery Mode Selector Cards */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Preferred Delivery Mode *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {DELIVERY_MODES.map((mode) => {
                const isSelected = formData.deliveryType === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, deliveryType: mode.id }));
                      if (validationErrors.deliveryType) {
                        setValidationErrors((prev) => ({ ...prev, deliveryType: null }));
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-red-600 bg-red-50/40 ring-2 ring-red-500/20"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-900">{mode.title}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-red-600" />}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed">{mode.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Motorized Vehicle Inputs */}
          {formData.deliveryType === "TWO_WHEELER" ? (
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-4">
              <span className="text-xs font-bold text-gray-900 block">
                Two-Wheeler Vehicle & License Details *
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Vehicle Type *
                  </label>
                  <select
                    name="vehicleType"
                    value={formData.vehicleType}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Motorcycle">Motorcycle / Bike</option>
                    <option value="Scooter">Scooter (Petrol)</option>
                    <option value="Electric Scooter">Electric Two-Wheeler (EV)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Vehicle Registration (RC) *
                  </label>
                  <input
                    type="text"
                    name="vehicleNumber"
                    value={formData.vehicleNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. MH-02-AB-1234"
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-xs ${
                      validationErrors.vehicleNumber ? "border-red-500 bg-red-50/30" : "border-gray-200"
                    }`}
                  />
                  {validationErrors.vehicleNumber && (
                    <span className="text-[10px] text-red-600 mt-0.5 block">
                      {validationErrors.vehicleNumber}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Driving Licence Number *
                  </label>
                  <input
                    type="text"
                    name="licenseNumber"
                    value={formData.licenseNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. MH0220180012345"
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-xs font-mono ${
                      validationErrors.licenseNumber ? "border-red-500 bg-red-50/30" : "border-gray-200"
                    }`}
                  />
                  {validationErrors.licenseNumber && (
                    <span className="text-[10px] text-red-600 mt-0.5 block">
                      {validationErrors.licenseNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>No motor vehicle or driving licence required</strong> for {formData.deliveryType === "BICYCLE" ? "Bicycle" : "Walking"} delivery mode.
              </span>
            </div>
          )}

          {/* Emergency Contact Information */}
          <div className="pt-2 border-t border-gray-100">
            <span className="text-xs font-bold text-gray-900 block mb-3">
              Emergency Contact (Family Member or Close Contact) *
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Contact Person Full Name *
                </label>
                <input
                  type="text"
                  name="emergencyContactName"
                  value={formData.emergencyContactName}
                  onChange={handleInputChange}
                  placeholder="e.g. Sunita Sharma (Mother / Spouse / Brother)"
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-red-500 ${
                    validationErrors.emergencyContactName ? "border-red-500 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {validationErrors.emergencyContactName && (
                  <span className="text-[11px] text-red-600 mt-1 block">
                    {validationErrors.emergencyContactName}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                  Contact Phone Number *
                </label>
                <input
                  type="tel"
                  name="emergencyContactPhone"
                  value={formData.emergencyContactPhone}
                  onChange={handleInputChange}
                  placeholder="+91 98765 43211"
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:ring-2 focus:ring-red-500 ${
                    validationErrors.emergencyContactPhone ? "border-red-500 bg-red-50/30" : "border-gray-200"
                  }`}
                />
                {validationErrors.emergencyContactPhone && (
                  <span className="text-[11px] text-red-600 mt-1 block">
                    {validationErrors.emergencyContactPhone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 4: REQUIRED DOCUMENT UPLOADS
          Showing filename, status, size, and replace/remove options
          ========================================================================= */}
      {currentStep === 4 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Required Verification Documents
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Documents are stored privately in encrypted cloud storage and are never exposed publicly.
            </p>
          </div>

          {/* Document 1: Government Identity Proof */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-red-600" /> 1. Government-Issued Identity Proof *
              </label>
              <span className="text-[10px] uppercase font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                Required
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Accepted: Aadhaar Card, PAN Card, Voter ID, or Passport (PDF, JPG, PNG, max 5MB).
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

            {/* File Selector / Selected Status */}
            <div>
              <input
                type="file"
                id="identityFile"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setIdentityFile(file);
                }}
                className="hidden"
              />
              {identityFile ? (
                <div className="flex items-center justify-between p-3 bg-white border border-emerald-200 rounded-xl">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-gray-900 truncate">
                      {identityFile.name}
                    </span>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      ({(identityFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="identityFile"
                      className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:text-red-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                    >
                      Replace
                    </label>
                    <button
                      type="button"
                      onClick={() => setIdentityFile(null)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="identityFile"
                  className="w-full py-3 px-4 border-2 border-dashed border-gray-300 hover:border-red-400 rounded-xl text-center flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-red-600 bg-white hover:bg-red-50/20 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Choose Government ID File (PDF, JPG, PNG)</span>
                </label>
              )}
              {validationErrors.identityProof && (
                <span className="text-[11px] text-red-600 mt-1 block">
                  {validationErrors.identityProof}
                </span>
              )}
            </div>
          </div>

          {/* Conditional Two-Wheeler Documents: Driving License & Vehicle RC */}
          {formData.deliveryType === "TWO_WHEELER" && (
            <>
              {/* Document 2: Driving License */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-600" /> 2. Valid Driving Licence *
                  </label>
                  <span className="text-[10px] uppercase font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    Motorized Only
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Upload clear copy of front & back of driving licence (PDF, JPG, PNG, max 5MB).
                </p>

                <div>
                  <input
                    type="file"
                    id="drivingLicenseFile"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setDrivingLicenseFile(file);
                    }}
                    className="hidden"
                  />
                  {drivingLicenseFile ? (
                    <div className="flex items-center justify-between p-3 bg-white border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {drivingLicenseFile.name}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          ({(drivingLicenseFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label
                          htmlFor="drivingLicenseFile"
                          className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:text-red-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                        >
                          Replace
                        </label>
                        <button
                          type="button"
                          onClick={() => setDrivingLicenseFile(null)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="drivingLicenseFile"
                      className="w-full py-3 px-4 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl text-center flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-blue-600 bg-white hover:bg-blue-50/20 transition-all cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Choose Driving License File (PDF, JPG, PNG)</span>
                    </label>
                  )}
                  {validationErrors.drivingLicense && (
                    <span className="text-[11px] text-red-600 mt-1 block">
                      {validationErrors.drivingLicense}
                    </span>
                  )}
                </div>
              </div>

              {/* Document 3: Vehicle Registration (RC) */}
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-purple-600" /> 3. Vehicle Registration Certificate (RC) *
                  </label>
                  <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                    Motorized Only
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Upload copy of your vehicle RC or smart card document (PDF, JPG, PNG, max 5MB).
                </p>

                <div>
                  <input
                    type="file"
                    id="vehicleRegistrationFile"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setVehicleRegistrationFile(file);
                    }}
                    className="hidden"
                  />
                  {vehicleRegistrationFile ? (
                    <div className="flex items-center justify-between p-3 bg-white border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-xs font-semibold text-gray-900 truncate">
                          {vehicleRegistrationFile.name}
                        </span>
                        <span className="text-[10px] text-gray-500 shrink-0">
                          ({(vehicleRegistrationFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label
                          htmlFor="vehicleRegistrationFile"
                          className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:text-red-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                        >
                          Replace
                        </label>
                        <button
                          type="button"
                          onClick={() => setVehicleRegistrationFile(null)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="vehicleRegistrationFile"
                      className="w-full py-3 px-4 border-2 border-dashed border-gray-300 hover:border-purple-400 rounded-xl text-center flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-purple-600 bg-white hover:bg-purple-50/20 transition-all cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Choose Vehicle Registration File (PDF, JPG, PNG)</span>
                    </label>
                  )}
                  {validationErrors.vehicleRegistration && (
                    <span className="text-[11px] text-red-600 mt-1 block">
                      {validationErrors.vehicleRegistration}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Document 4: Optional Address Proof */}
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-500" /> 4. Current Address Proof (Optional)
              </label>
              <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                Optional
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              Only required if your present residential address is different from your government ID (Electricity bill, rental agreement, or broadband bill).
            </p>

            <div>
              <input
                type="file"
                id="addressFile"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setAddressFile(file);
                }}
                className="hidden"
              />
              {addressFile ? (
                <div className="flex items-center justify-between p-3 bg-white border border-emerald-200 rounded-xl">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-semibold text-gray-900 truncate">
                      {addressFile.name}
                    </span>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      ({(addressFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label
                      htmlFor="addressFile"
                      className="px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:text-red-600 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
                    >
                      Replace
                    </label>
                    <button
                      type="button"
                      onClick={() => setAddressFile(null)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="addressFile"
                  className="w-full py-3 px-4 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-xl text-center flex items-center justify-center gap-2 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-100 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Choose Address Proof File (Optional)</span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          STEP 5: SUMMARY REVIEW, CONSENT & SUBMISSION
          ========================================================================= */}
      {currentStep === 5 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-6 text-left animate-in fade-in">
          <div className="border-b border-gray-100 pb-3">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Review Application & Consent
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Please review your details carefully before submitting for verification review
            </p>
          </div>

          {/* Review Summary Card */}
          <div className="p-5 bg-[#FAF8F5] border border-orange-100 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Registration Summary
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500 block">Applicant Name</span>
                <span className="font-bold text-gray-900">{formData.fullName}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Contact Mobile</span>
                <span className="font-bold text-gray-900">{formData.phone}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Date of Birth</span>
                <span className="font-bold text-gray-900">{formData.dateOfBirth}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Delivery Mode</span>
                <span className="font-bold text-gray-900">
                  {formData.deliveryType === "TWO_WHEELER"
                    ? `Two-Wheeler (${formData.vehicleType || "Motorcycle"})`
                    : formData.deliveryType === "BICYCLE"
                    ? "Bicycle"
                    : "Walking"}
                </span>
              </div>
              {formData.deliveryType === "TWO_WHEELER" && (
                <>
                  <div>
                    <span className="text-gray-500 block">Vehicle Registration</span>
                    <span className="font-bold text-gray-900">{formData.vehicleNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Driving Licence</span>
                    <span className="font-bold text-gray-900 font-mono">{formData.licenseNumber}</span>
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <span className="text-gray-500 block">Address</span>
                <span className="font-bold text-gray-900">
                  {formData.addressLine1}, {formData.locality}, {formData.city}, {formData.state} - {formData.pincode}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-gray-500 block">Emergency Contact</span>
                <span className="font-bold text-gray-900">
                  {formData.emergencyContactName} ({formData.emergencyContactPhone})
                </span>
              </div>
            </div>
          </div>

          {/* Required Consent Checkboxes */}
          <div className="space-y-4 pt-2">
            <label className="flex items-start gap-3 p-3.5 bg-gray-50 hover:bg-gray-100/70 rounded-2xl border border-gray-200 cursor-pointer transition-colors">
              <input
                type="checkbox"
                name="accurateInfoDeclaration"
                checked={formData.accurateInfoDeclaration}
                onChange={handleInputChange}
                className="mt-0.5 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <div className="text-xs text-gray-700">
                <span className="font-bold block text-gray-900 mb-0.5">
                  Declaration of Truth & Accuracy *
                </span>
                <span>
                  I hereby declare that all details and documents submitted in this application are true, accurate, and complete. I understand that submitting false or misleading information will result in immediate termination of partner eligibility.
                </span>
              </div>
            </label>
            {validationErrors.accurateInfoDeclaration && (
              <span className="text-[11px] text-red-600 block pl-2">
                {validationErrors.accurateInfoDeclaration}
              </span>
            )}

            <label className="flex items-start gap-3 p-3.5 bg-gray-50 hover:bg-gray-100/70 rounded-2xl border border-gray-200 cursor-pointer transition-colors">
              <input
                type="checkbox"
                name="termsConsent"
                checked={formData.termsConsent}
                onChange={handleInputChange}
                className="mt-0.5 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
              />
              <div className="text-xs text-gray-700">
                <span className="font-bold block text-gray-900 mb-0.5">
                  Delivery Partner Terms & Privacy Consent *
                </span>
                <span>
                  I agree to TasteBridge's Delivery Partner Terms of Service and Privacy Policy. I consent to TasteBridge verifying my documents with authorized operations teams for onboarding purposes.
                </span>
              </div>
            </label>
            {validationErrors.termsConsent && (
              <span className="text-[11px] text-red-600 block pl-2">
                {validationErrors.termsConsent}
              </span>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          WIZARD BOTTOM NAVIGATION CONTROLS
          ========================================================================= */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={handlePrevStep}
            disabled={submitting}
            className="px-5 py-2.5 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>
        ) : (
          <div />
        )}

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={handleNextStep}
            className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-red-600/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Continue to Next Step</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-red-600/25 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting Registration...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Submit Registration</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default DeliveryAgentApplicationForm;
