import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import agentHeroImage from "../../assets/agent_homepage.png";
import AuthModal from "../../components/auth/AuthModal.jsx";
import { logout } from "../../store/slices/authSlice.js";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";
import DeliveryAgentApplicationForm from "./DeliveryAgentApplicationForm.jsx";
import DeliveryAgentApplicationStatus from "./DeliveryAgentApplicationStatus.jsx";
import {
  Bike,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  UtensilsCrossed,
  LogOut,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

export const BecomeDeliveryAgentPage = () => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  // View Mode: "landing" | "wizard" | "status"
  const [viewMode, setViewMode] = useState("landing");

  // Auth Modal state for unauthenticated visitors
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("register");
  const [pendingAction, setPendingAction] = useState(null);

  // Application state from backend
  const [applicationData, setApplicationData] = useState(null);
  const [hasApplication, setHasApplication] = useState(false);
  const [loadingApp, setLoadingApp] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const applicationRequestRef = useRef(null);

  // Fetch delivery agent application state for authenticated user
  const fetchApplication = useCallback(async () => {
    if (!isAuthenticated) {
      setLoadingApp(false);
      return null;
    }
    if (applicationRequestRef.current) return applicationRequestRef.current;

    applicationRequestRef.current = (async () => {
      try {
        setLoadingApp(true);
        setLoadError(null);
        const res = await deliveryAgentApi.getMyApplication();
        const { hasApplication: hasApp, application } = res.data;

        setHasApplication(hasApp);
        setApplicationData(application);
        return { hasApp, application };
      } catch (err) {
        setLoadError(err.message || "Failed to load your delivery application status.");
        return null;
      } finally {
        setLoadingApp(false);
        applicationRequestRef.current = null;
      }
    })();
    return applicationRequestRef.current;
  }, [isAuthenticated]);

  // Pre-fetch application data for authenticated users
  useEffect(() => {
    if (isAuthenticated) {
      fetchApplication();
    } else {
      setApplicationData(null);
      setHasApplication(false);
    }
  }, [fetchApplication, isAuthenticated]);

  // Handle post-authentication continuation if visitor clicked "Sign Up to Deliver" while logged out
  useEffect(() => {
    if (isAuthenticated && pendingAction === "start_application") {
      setPendingAction(null);
      setAuthModalOpen(false);
      fetchApplication().then((result) => {
        if (!result) return;
        if (result.hasApp) {
          setViewMode("status");
        } else {
          setViewMode("wizard");
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }, [fetchApplication, isAuthenticated, pendingAction]);

  const openAuth = (mode = "register") => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  // Main CTA handler for "Sign Up to Deliver"
  const handleSignUpClick = async () => {
    if (!isAuthenticated) {
      setPendingAction("start_application");
      setAuthMode("register");
      setAuthModalOpen(true);
      return;
    }

    const appResult = applicationData !== null || hasApplication
      ? { hasApp: hasApplication, application: applicationData }
      : await fetchApplication();

    if (appResult?.hasApp) {
      setViewMode("status");
    } else {
      setViewMode("wizard");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleApplicationSubmitted = (newData) => {
    setHasApplication(true);
    setApplicationData(newData.application);
    setViewMode("status");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleStartRevision = () => {
    setViewMode("wizard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToOverview = () => {
    setViewMode("landing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-gray-800 flex flex-col">
      {/* =========================================================================
          TOP NAVBAR
          Matching BecomeCookNavbar: Logo, Switch to Marketplace, and Auth Buttons.
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-orange-100/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* TasteBridge Logo */}
          <Link to="/" className="flex items-center gap-2.5 group" aria-label="TasteBridge Home">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-red-700 via-amber-600 to-amber-800 bg-clip-text text-transparent">
                TasteBridge
              </span>
              <span className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold text-amber-700">
                Where Food Meets Heritage
              </span>
            </div>
          </Link>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-gray-700 hover:text-red-600 bg-white border border-gray-200 hover:border-red-300 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <UtensilsCrossed className="w-4 h-4 text-red-600" />
              <span className="hidden sm:inline">Switch to Marketplace</span>
              <span className="sm:hidden">Marketplace</span>
            </Link>

            {viewMode !== "landing" && (
              <button
                type="button"
                onClick={handleBackToOverview}
                className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-red-600 rounded-xl transition-colors cursor-pointer"
              >
                ← Overview
              </button>
            )}

            {!isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="px-4 py-2 text-xs sm:text-sm font-bold text-gray-700 hover:text-red-600 bg-white border border-gray-200 hover:border-red-300 rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  Log In
                </button>
                {viewMode === "landing" && (
                  <button
                    type="button"
                    onClick={handleSignUpClick}
                    className="px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl shadow-md shadow-red-600/20 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Bike className="w-4 h-4" />
                    <span>Sign Up to Deliver</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
                <span className="hidden md:inline text-xs font-semibold text-gray-700">
                  {user?.name?.split(" ")[0]}
                </span>
                {viewMode === "landing" && (
                  <button
                    type="button"
                    onClick={handleSignUpClick}
                    className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl shadow-md shadow-red-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Bike className="w-3.5 h-3.5" />
                    <span>{hasApplication ? "View Status" : "Register as Partner"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dispatch(logout())}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                  title="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Loading State when fetching application for status/wizard mode */}
        {loadingApp && viewMode !== "landing" && (
          <div className="py-24 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
            <p className="text-xs font-semibold text-gray-600">
              Loading your delivery registration status...
            </p>
          </div>
        )}

        {/* Load Error State */}
        {loadError && viewMode !== "landing" && (
          <div className="max-w-md mx-auto my-16 p-6 bg-white rounded-3xl border border-red-200 shadow-md text-center space-y-4">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h2 className="text-base font-bold text-gray-900">Unable to Load Application</h2>
            <p className="text-xs text-gray-600">{loadError}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={fetchApplication}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
              <button
                type="button"
                onClick={handleBackToOverview}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Back to Overview
              </button>
            </div>
          </div>
        )}

        {/* VIEW MODE 1: REGISTRATION WIZARD FORM */}
        {!loadingApp && viewMode === "wizard" && (
          <DeliveryAgentApplicationForm
            existingApplication={applicationData}
            onApplicationSubmitted={handleApplicationSubmitted}
            onCancel={handleBackToOverview}
          />
        )}

        {/* VIEW MODE 2: APPLICATION STATUS VIEW */}
        {!loadingApp && viewMode === "status" && (
          <DeliveryAgentApplicationStatus
            application={applicationData}
            onRefresh={fetchApplication}
            onStartRevision={handleStartRevision}
            onBackToOverview={handleBackToOverview}
          />
        )}

        {/* VIEW MODE 3: LANDING PAGE HERO & DETAILS */}
        {viewMode === "landing" && (
          <>
            {/* =========================================================================
                1. IMMERSIVE HERO SECTION
                Full-bleed hero with agent_homepage.png image FULL in background,
                cinematic overlay, red pill badge, bold typography & prominent CTA buttons.
                ========================================================================= */}
            <section className="relative isolate flex min-h-[calc(100svh-4.5rem)] w-full items-center justify-center overflow-hidden px-4 py-16 sm:px-6 lg:px-8">
              <img
                src={agentHeroImage}
                alt="TasteBridge delivery partner gear with insulated tiffin carrier, helmet, and navigation"
                className="absolute inset-0 z-0 h-full w-full object-cover"
              />

              <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/70 via-black/55 to-black/75" />

              <div className="relative z-20 mx-auto w-full max-w-4xl space-y-6 text-center sm:space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-100/40 bg-red-600/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  <Bike className="h-3.5 w-3.5 text-amber-300" />
                  <span>Become a TasteBridge Delivery Partner</span>
                </div>

                <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-6xl md:text-7xl">
                  Deliver Fresh Home Meals. <br className="hidden sm:inline" />
                  <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 bg-clip-text text-transparent">
                    Earn On Your Own Terms.
                  </span>
                </h1>

                <p className="mx-auto max-w-2xl text-base font-normal leading-relaxed text-gray-100 drop-shadow-sm sm:text-xl">
                  Connect home kitchens with neighborhood food lovers. Choose your hours, enjoy transparent weekly payouts, and keep 100% of your tips.
                </p>

                <div className="pt-2 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleSignUpClick}
                    className="w-full sm:w-auto px-9 py-4 bg-gradient-to-r from-red-600 via-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-red-600/35 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
                  >
                    <Bike className="w-5 h-5" />
                    <span>{hasApplication ? "Check Application Status" : "Sign Up to Deliver"}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>

                <div className="pt-6 grid grid-cols-3 gap-4 max-w-xl mx-auto border-t border-white/20 text-white/90">
                  <div>
                    <span className="block text-xl sm:text-2xl font-black text-amber-300">100%</span>
                    <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Tips Kept by You</span>
                  </div>
                  <div className="border-x border-white/20">
                    <span className="block text-xl sm:text-2xl font-black text-amber-300">Flexible</span>
                    <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Your Schedule & Shifts</span>
                  </div>
                  <div>
                    <span className="block text-xl sm:text-2xl font-black text-amber-300">Weekly</span>
                    <span className="text-[11px] sm:text-xs text-gray-200 font-medium">Direct Bank Payouts</span>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================================================================
                2. HOW ONBOARDING WORKS (Linear Timeline Flow)
                ========================================================================= */}
            <section className="py-20 sm:py-24 bg-white border-y border-orange-100">
              <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center space-y-3 mb-16">
                  <span className="text-xs font-bold uppercase tracking-widest text-red-600">
                    Simple 4-Step Process
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                    From Sign Up to Your First Delivery
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-left relative">
                  <div className="space-y-3">
                    <div className="text-3xl font-black text-red-600/30">01</div>
                    <h3 className="text-base font-bold text-gray-900">Sign Up & Details</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Provide your contact info, vehicle details (bike, scooter, or EV), and preferred delivery neighborhood.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="text-3xl font-black text-amber-500/40">02</div>
                    <h3 className="text-base font-bold text-gray-900">Upload License & ID</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Submit a copy of your valid Driving License and basic government ID proof for fast identity verification.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="text-3xl font-black text-emerald-600/40">03</div>
                    <h3 className="text-base font-bold text-gray-900">Quick Verification</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Our operations team reviews your documents to maintain rider safety and activates your delivery profile.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="text-3xl font-black text-purple-600/40">04</div>
                    <h3 className="text-base font-bold text-gray-900">Deliver & Earn</h3>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      Accept delivery requests from home cooks in your locality and enjoy weekly payouts straight to your bank.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* =========================================================================
                3. REQUIREMENTS CHECKLIST
                ========================================================================= */}
            <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-left">
              <div className="border-l-4 border-amber-500 pl-6 space-y-4">
                <div className="flex items-center gap-2 text-amber-800 text-xs font-bold uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Partner Requirements</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Everything You Need to Get Started
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Joining the TasteBridge delivery fleet is straightforward. All you need is a reliable two-wheeler (motorcycle, scooter, electric vehicle, or bicycle), a valid Driving License, an Android or iOS smartphone for navigation, and to be at least 18 years of age.
                </p>
                <div className="pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-semibold text-gray-700">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> 18+ Years Old</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Two-Wheeler</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Driving License</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> Smartphone</span>
                </div>
              </div>
            </section>

            {/* =========================================================================
                4. AUTHENTIC VOICE (Pull-Quote)
                ========================================================================= */}
            <section className="py-16 sm:py-20 bg-white border-t border-orange-100 text-center px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl mx-auto space-y-6">
                <span className="text-4xl text-amber-500 font-serif leading-none block">“</span>
                <p className="text-lg sm:text-2xl text-gray-800 font-medium italic leading-relaxed">
                  Delivering for TasteBridge feels completely different from commercial delivery apps. Home cooks treat me with so much respect, and customers are genuinely delighted to receive authentic home-cooked meals. The flexible shifts fit my college timetable perfectly.
                </p>
                <div>
                  <span className="block font-bold text-sm text-gray-900">Rajesh Patel</span>
                  <span className="block text-xs text-gray-500">TasteBridge Delivery Partner • Ahmedabad</span>
                </div>
              </div>
            </section>

            {/* =========================================================================
                5. FINAL CALL TO ACTION
                ========================================================================= */}
            <section className="py-20 bg-gradient-to-r from-red-600 via-amber-600 to-red-700 text-white text-center px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl mx-auto space-y-6">
                <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
                  Ready to Deliver with Pride? <br />Your City is Waiting.
                </h2>
                <p className="text-base sm:text-lg text-white/90 max-w-xl mx-auto leading-relaxed">
                  It takes just a few minutes to submit your details and join our growing family of delivery partners.
                </p>
                <div className="pt-2 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleSignUpClick}
                    className="w-full sm:w-auto px-9 py-4 bg-white text-red-700 hover:bg-orange-50 rounded-2xl font-extrabold text-base shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center justify-center gap-3"
                  >
                    <Bike className="w-5 h-5 text-red-600" />
                    <span>{hasApplication ? "Check Application Status" : "Sign Up to Deliver"}</span>
                    <ArrowRight className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Minimal Brand Footer */}
      <footer className="py-8 bg-[#FAF8F5] border-t border-orange-100 text-center text-xs text-gray-500">
        <p className="font-semibold text-gray-700">TasteBridge — Where Food Meets Heritage</p>
        <p className="mt-1">Empowering home cooks, homemakers, and delivery partners across India.</p>
      </footer>

      {/* Authentication Modal for Login / Register */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />
    </div>
  );
};

export default BecomeDeliveryAgentPage;
