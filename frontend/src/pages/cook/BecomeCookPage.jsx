import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { cookApi } from "../../api/cookApi.js";
import { updateUserProfile } from "../../store/slices/authSlice.js";
import { isApprovedCook } from "../../utils/cookAuth.js";
import BecomeCookNavbar from "./BecomeCookNavbar.jsx";
import BecomeCookLandingPage from "./BecomeCookLandingPage.jsx";
import CookApplicationForm from "./CookApplicationForm.jsx";
import CookApplicationStatus from "./CookApplicationStatus.jsx";
import AuthModal from "../../components/auth/AuthModal.jsx";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

export const BecomeCookPage = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  // View Mode: ALWAYS starts at "landing" when visiting /become-a-cook
  // Modes: "landing" | "wizard" | "status"
  const [viewMode, setViewMode] = useState("landing");

  // Auth Modal state for unauthenticated visitors
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("register");
  const [pendingAction, setPendingAction] = useState(null);

  // Application State loaded from backend
  const [applicationData, setApplicationData] = useState(null);
  const [hasApplication, setHasApplication] = useState(false);
  const [loadingApp, setLoadingApp] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const applicationRequestRef = useRef(null);

  // 1. Immediately redirect approved COOK users to Cook dashboard
  useEffect(() => {
    if (isApprovedCook(user)) {
      navigate("/cook", { replace: true });
    }
  }, [user, navigate]);

  // 2. Fetch application state from PostgreSQL
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
        const res = await cookApi.getMyApplication();
        const { userRole, hasApplication: hasApp, application } = res.data;

        // If user is already approved cook, direct to cook dashboard
        if (isApprovedCook({ role: userRole, cookProfile: application })) {
          dispatch(updateUserProfile({ cookProfile: application, role: "COOK" }));
          navigate("/cook", { replace: true });
          return { userRole: "COOK", hasApp: true, application };
        }

        setHasApplication(hasApp);
        setApplicationData(application);
        if (application) {
          dispatch(updateUserProfile({ cookProfile: application }));
        }
        return { userRole, hasApp, application };
      } catch (err) {
        setLoadError(err.message || "Failed to load your cook application status.");
        return null;
      } finally {
        setLoadingApp(false);
        applicationRequestRef.current = null;
      }
    })();
    return applicationRequestRef.current;
  }, [dispatch, isAuthenticated, navigate]);

  // Pre-fetch application data for authenticated users in the background
  useEffect(() => {
    if (isAuthenticated) {
      fetchApplication();
    }
  }, [fetchApplication, isAuthenticated]);

  // Handle post-authentication continuation if the user clicked "Sign Up as a Cook" while logged out
  useEffect(() => {
    if (isAuthenticated && pendingAction === "start_application") {
      setPendingAction(null);
      setAuthModalOpen(false);
      fetchApplication().then((result) => {
        if (!result) return;
        if (isApprovedCook({ role: result.userRole, cookProfile: result.application })) {
          navigate("/cook", { replace: true });
        } else if (result.hasApp) {
          setViewMode("status");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setViewMode("wizard");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
  }, [fetchApplication, isAuthenticated, navigate, pendingAction]);

  // Main CTA handler for "Sign Up as a Cook"
  const handleSignUpClick = async () => {
    // If not authenticated, open auth modal and mark pendingAction
    if (!isAuthenticated) {
      setPendingAction("start_application");
      setAuthMode("register");
      setAuthModalOpen(true);
      return;
    }

    // If authenticated, determine where to route:
    const appResult = applicationData !== null || hasApplication
      ? { userRole: user?.role, hasApp: hasApplication, application: applicationData || user?.cookProfile }
      : await fetchApplication();

    if (isApprovedCook({ role: appResult?.userRole || user?.role, cookProfile: appResult?.application })) {
      navigate("/cook", { replace: true });
      return;
    }

    // If user already has an application in any state (PENDING, UNDER_REVIEW, NEEDS_REVISION, REJECTED)
    if (appResult?.hasApp) {
      setViewMode("status");
    } else {
      // New application flow -> Open 5-step wizard
      setViewMode("wizard");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleApplicationSubmitted = (newData) => {
    setHasApplication(true);
    setApplicationData(newData.application);
    if (newData.application) {
      dispatch(updateUserProfile({ cookProfile: newData.application }));
    }
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

  // 1. Loading state when an action is pending and fetching from DB
  if (loadingApp && viewMode !== "landing") {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <BecomeCookNavbar showSignUp={false} isLanding={false} />
        <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-xs font-semibold text-gray-600">
            Checking your cook application status...
          </p>
        </div>
      </div>
    );
  }

  // 2. Error Loading Application
  if (loadError && viewMode !== "landing") {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <BecomeCookNavbar showSignUp={false} isLanding={false} onBackToOverview={handleBackToOverview} />
        <div className="max-w-md mx-auto my-auto p-6 bg-white rounded-3xl border border-red-200 shadow-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h2 className="text-base font-bold text-gray-900">Unable to Load Application</h2>
          <p className="text-xs text-gray-600">{loadError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={fetchApplication}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </button>
            <button
              onClick={handleBackToOverview}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Back to Overview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Multi-Step Application Wizard Mode
  if (viewMode === "wizard") {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <BecomeCookNavbar
          showSignUp={false}
          isLanding={false}
          onBackToOverview={handleBackToOverview}
        />
        <main className="flex-1 pb-16">
          <CookApplicationForm
            existingApplication={applicationData}
            onApplicationSubmitted={handleApplicationSubmitted}
            onCancel={handleBackToOverview}
          />
        </main>
      </div>
    );
  }

  // 4. Status Card Mode: Shows PENDING, NEEDS_REVISION, or REJECTED status
  if (viewMode === "status") {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
        <BecomeCookNavbar
          showSignUp={false}
          isLanding={false}
          onBackToOverview={handleBackToOverview}
        />
        <main className="flex-1 pb-16">
          <CookApplicationStatus
            application={applicationData}
            onStartRevision={handleStartRevision}
            onRefresh={fetchApplication}
            onBackToOverview={handleBackToOverview}
          />
        </main>
      </div>
    );
  }

  // 5. Landing Page First (Default Mode):
  // Shown when user navigates to "Become a Cook", before clicking "Sign Up as a Cook"
  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col">
      <BecomeCookNavbar
        onSignUpClick={handleSignUpClick}
        showSignUp={true}
        isLanding={true}
      />
      <main className="flex-1">
        <BecomeCookLandingPage onStartApplication={handleSignUpClick} />
      </main>

      {/* Authentication Modal if user is logged out when clicking "Sign Up as a Cook" */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingAction(null);
        }}
        initialMode={authMode}
      />
    </div>
  );
};

export default BecomeCookPage;
