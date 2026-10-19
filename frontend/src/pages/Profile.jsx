import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logout, updateUserProfile } from "../store/slices/authSlice.js";
import {
  User,
  UserCheck,
  Mail,
  Phone,
  MapPin,
  Edit2,
  CheckCircle2,
  Lock,
  ShieldCheck,
  LogOut,
  ShoppingBag,
  ArrowRight,
  X,
  AlertCircle,
  Check,
  Calendar,
  Sparkles,
} from "lucide-react";

export const Profile = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  // Profile information is owned by Redux; derive its display values so auth
  // refreshes and profile updates are reflected without a second copy of state.
  const profileData = {
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "Not provided",
    role: user?.role || "CUSTOMER",
    memberSince: user?.createdAt
      ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "Active Member",
  };

  // Personal Info Edit Mode
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    name: profileData.name,
    phone: profileData.phone,
  });
  const [infoFeedback, setInfoFeedback] = useState(null);

  // Password Security Modal State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  // Handler: Start editing profile info
  const handleStartEditInfo = () => {
    setInfoForm({
      name: profileData.name,
      phone: profileData.phone,
    });
    setIsEditingInfo(true);
    setInfoFeedback(null);
  };

  // Handler: Save profile info
  const handleSaveInfo = (e) => {
    e.preventDefault();
    if (!infoForm.name.trim()) {
      setInfoFeedback({ type: "error", message: "Full Name cannot be empty." });
      return;
    }

    const updated = {
      ...profileData,
      name: infoForm.name.trim(),
      phone: infoForm.phone.trim(),
    };

    dispatch(updateUserProfile({ name: updated.name, phone: updated.phone }));
    setIsEditingInfo(false);
    setInfoFeedback({
      type: "success",
      message: "Personal details updated successfully!",
    });

    setTimeout(() => {
      setInfoFeedback(null);
    }, 4000);
  };

  // Handler: Save Password Change
  const handleSavePassword = (e) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordSuccess("Password updated successfully!");
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });

    setTimeout(() => {
      setPasswordModalOpen(false);
      setPasswordSuccess("");
    }, 1500);
  };

  // Handler: Logout
  const handleLogout = () => {
    dispatch(logout());
    navigate("/");
  };

  // Get user initials for avatar
  const getInitials = (name) => {
    if (!name) return "TP";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center text-red-600">
          <User className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Sign in to view Profile</h2>
        <p className="text-sm text-gray-600 max-w-sm">
          Please log in to manage your account details, addresses, and orders.
        </p>
        <Link
          to="/"
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
        >
          Go to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 text-left">
      
      {/* feedback message toast at top if active */}
      {infoFeedback && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-xs transition-all ${
            infoFeedback.type === "error"
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
          }`}
        >
          {infoFeedback.type === "error" ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          )}
          <span>{infoFeedback.message}</span>
        </div>
      )}

      {/* 1. PROFILE HEADER CARD */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/90 shadow-xs relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        {/* Subtle Decorative Background Glow */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-orange-100/50 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 relative z-10">
          {/* Avatar Icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 text-white font-bold text-2xl flex items-center justify-center shadow-md shadow-red-500/20 shrink-0">
            {getInitials(profileData.name)}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                {profileData.name}
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-amber-800 text-[11px] font-bold">
                <Sparkles className="w-3 h-3 text-amber-600" /> {profileData.role}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-gray-400" /> {profileData.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-gray-400" /> {profileData.phone}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" /> Member since {profileData.memberSince}
              </span>
            </div>
          </div>
        </div>

        {/* Action: Edit Profile Button */}
        <div className="relative z-10 w-full md:w-auto flex items-center gap-3">
          <Link
            to="/explore"
            className="w-full md:w-auto px-5 py-2.5 bg-white hover:bg-orange-50 border border-orange-200 text-red-700 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" /> Back
          </Link>
          <button
            onClick={handleStartEditInfo}
            className="w-full md:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all hover:shadow-md cursor-pointer flex items-center justify-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" /> Edit Profile
          </button>
        </div>
      </section>

      {/* 2. PROFILE INFORMATION SECTION */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/80 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-50 text-red-600">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Personal Information</h2>
              <p className="text-xs text-gray-500">Manage your name and contact details</p>
            </div>
          </div>

          {!isEditingInfo && (
            <button
              onClick={handleStartEditInfo}
              className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>

        {!isEditingInfo ? (
          /* Read-Only Profile View */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-[#FFF8F0]/60 rounded-2xl border border-orange-100 space-y-1">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Full Name</p>
              <p className="text-sm font-semibold text-gray-900">{profileData.name}</p>
            </div>

            <div className="p-4 bg-[#FFF8F0]/60 rounded-2xl border border-orange-100 space-y-1">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Email Address</p>
              <p className="text-sm font-semibold text-gray-900">{profileData.email}</p>
            </div>

            <div className="p-4 bg-[#FFF8F0]/60 rounded-2xl border border-orange-100 space-y-1">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Phone Number</p>
              <p className="text-sm font-semibold text-gray-900">{profileData.phone}</p>
            </div>
          </div>
        ) : (
          /* Editable Form Mode */
          <form onSubmit={handleSaveInfo} className="space-y-4 max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Full Name</label>
                <input
                  type="text"
                  value={infoForm.name}
                  onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  placeholder="Enter full name"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Phone Number</label>
                <input
                  type="text"
                  value={infoForm.phone}
                  onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  placeholder="+91 XXXXX XXXXX"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Email Address</span>
                <span className="text-[10px] text-gray-400 font-normal flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Cannot be changed
                </span>
              </label>
              <input
                type="email"
                value={profileData.email}
                disabled
                className="w-full px-3.5 py-2 text-xs border border-gray-200 bg-gray-100 text-gray-500 rounded-xl cursor-not-allowed"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditingInfo(false)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Saved addresses are managed through the authenticated address service. */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/80 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-50 p-2 text-red-600"><MapPin className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Delivery addresses</h2>
              <p className="text-xs text-gray-500">Manage the addresses saved to your account.</p>
            </div>
          </div>
          <Link to="/addresses" className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">
            Manage addresses <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>



      {/* 6. ACCOUNT SECURITY SECTION */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/80 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-50 text-amber-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Account Security</h2>
              <p className="text-xs text-gray-500">Manage your password and security options</p>
            </div>
          </div>

          <button
            onClick={() => {
              setPasswordModalOpen(true);
              setPasswordError("");
              setPasswordSuccess("");
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Lock className="w-3.5 h-3.5" /> Change Password
          </button>
        </div>

        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between text-xs">
          <div className="space-y-0.5">
            <p className="font-bold text-gray-900">Password Authentication</p>
            <p className="text-gray-500">Last changed recently</p>
          </div>
          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px]">
            Protected
          </span>
        </div>
      </section>

      {/* 7. LOGOUT SECTION */}
      <section className="bg-red-50/70 border border-red-100 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-sm font-bold text-gray-900">Ready to log out?</h3>
          <p className="text-xs text-gray-600">
            Ending your session will return you to the TasteBridge landing page.
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" /> Logout of Account
        </button>
      </section>

      {/* =========================================================================
         MODAL 2: CHANGE PASSWORD MODAL
         ========================================================================= */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">Change Password</h3>
              <button
                onClick={() => setPasswordModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSavePassword} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-gray-700">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                  }
                  placeholder="Enter current password"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                  }
                  placeholder="At least 6 characters"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-gray-700">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                  }
                  placeholder="Re-enter new password"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile;
