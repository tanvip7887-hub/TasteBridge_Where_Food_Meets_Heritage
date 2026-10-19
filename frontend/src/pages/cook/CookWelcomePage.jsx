import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { cookApi } from "../../api/cookApi.js";
import BecomeCookNavbar from "./BecomeCookNavbar.jsx";
import {
  ChefHat,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  BookOpen,
  Package,
  Loader2,
} from "lucide-react";

export const CookWelcomePage = () => {
  const { user } = useSelector((state) => state.auth);
  const [applicationData, setApplicationData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await cookApi.getMyApplication();
        setApplicationData(res.data?.application);
      } catch (e) {
        console.error("Failed to load approved cook details", e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <BecomeCookNavbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-left space-y-8">
        {/* HERO CELEBRATION CARD */}
        <div className="bg-gradient-to-tr from-amber-500 via-red-600 to-amber-700 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-4 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>TasteBridge Certified Cook</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Welcome to the Family, <br />
              {applicationData?.businessName || user?.name}!
            </h1>

            <p className="text-sm sm:text-base text-white/90 leading-relaxed font-medium">
              Your cook application has been approved by the TasteBridge curation team. Your ancestral stories and authentic recipes now have a home.
            </p>
          </div>

          {/* Decorative Background Chef Icon */}
          <div className="absolute -right-8 -bottom-8 opacity-10 text-white pointer-events-none">
            <ChefHat className="w-72 h-72" />
          </div>
        </div>

        {/* FSSAI SELLING STATUS NOTIFICATION */}
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-red-600" />
            Loading kitchen profile details...
          </div>
        ) : (
          <div className="space-y-6">
            {applicationData?.isApprovedToSell ? (
              <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-200 flex items-start gap-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h3 className="text-sm font-bold text-emerald-950">
                    Selling Status: Fully Active
                  </h3>
                  <p className="text-emerald-800 leading-relaxed">
                    Your FSSAI FoSCoS registration has been verified by the TasteBridge compliance team. You are authorized to receive customer food orders.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 bg-amber-50 rounded-3xl border border-amber-200 flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h3 className="text-sm font-bold text-amber-950">
                    FSSAI Verification In Progress — Selling Blocked Until Verified
                  </h3>
                  <p className="text-amber-800 leading-relaxed">
                    Your cook application and kitchen profile have been approved! However, under platform food safety standards, selling and receiving customer orders remains blocked until your 14-digit FSSAI licence/registration certificate is verified by admins.
                  </p>
                </div>
              </div>
            )}

            {/* KITCHEN PROFILE DETAILS */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <ChefHat className="w-4 h-4 text-amber-600" /> Your Approved Kitchen Profile
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block font-medium">Kitchen Name</span>
                  <span className="font-bold text-gray-900 text-sm">{applicationData?.businessName || "Registered Home Kitchen"}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Account Role</span>
                  <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-800 font-extrabold text-[10px]">
                    COOK
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Location</span>
                  <span className="font-semibold text-gray-800">{applicationData?.locality}, {applicationData?.city}</span>
                </div>
              </div>

              {applicationData?.cuisines?.length > 0 && (
                <div className="pt-2">
                  <span className="text-gray-500 block font-medium text-xs mb-1">Approved Cuisines</span>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(applicationData.cuisines) ? applicationData.cuisines : [applicationData.cuisines]).map((c, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-950 font-semibold text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* NEXT STEPS ROADMAP */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/80 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900">Next Steps for Your Kitchen</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                  <BookOpen className="w-5 h-5 text-red-600" />
                  <span className="font-bold text-gray-900 block">1. Curate Your Dishes</span>
                  <p className="text-gray-600 leading-relaxed text-[11px]">
                    Plan your weekly menu with your signature ancestral recipes and set portion limits.
                  </p>
                </div>

                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                  <Package className="w-5 h-5 text-amber-600" />
                  <span className="font-bold text-gray-900 block">2. Packaging Ready</span>
                  <p className="text-gray-600 leading-relaxed text-[11px]">
                    Ensure spill-proof, eco-friendly food packaging containers are stocked in your kitchen.
                  </p>
                </div>

                <div className="p-4 bg-orange-50/50 rounded-2xl border border-orange-100 space-y-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span className="font-bold text-gray-900 block">3. Safety Standards</span>
                  <p className="text-gray-600 leading-relaxed text-[11px]">
                    Follow standard food hygiene protocols to keep your kitchen spotless and trustworthy.
                  </p>
                </div>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
              <Link
                to="/"
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>Explore TasteBridge Marketplace</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/profile"
                className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl text-xs font-semibold text-center transition-colors"
              >
                View Your Account Profile
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default CookWelcomePage;
