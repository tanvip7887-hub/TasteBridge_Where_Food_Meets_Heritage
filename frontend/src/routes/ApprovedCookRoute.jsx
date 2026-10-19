import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Loader2 } from "lucide-react";
import { isApprovedCook } from "../utils/cookAuth.js";
import { useDispatch } from "react-redux";
import { switchPortal } from "../store/slices/authSlice.js";

/**
 * Route Guard that permits only authenticated users with an APPROVED cook status.
 * Pending applications and customers are kept in the marketplace or directed to application status.
 */
export const ApprovedCookRoute = ({ children }) => {
  const dispatch = useDispatch();
  const [switchError, setSwitchError] = useState("");
  const attempted = useRef(false);
  const { user, isAuthenticated, isInitialized, loading } = useSelector(
    (state) => state.auth
  );

  useEffect(() => {
    if (!isInitialized || loading || !isAuthenticated || !isApprovedCook(user) || user.activePortal === "COOK" || attempted.current || switchError) return;
    attempted.current = true;
    dispatch(switchPortal("COOK")).unwrap()
      .catch((error) => setSwitchError(error?.message || "Could not switch to the Cook portal."));
  }, [dispatch, isAuthenticated, isInitialized, loading, switchError, user]);

  if (!isInitialized || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Verifying cook permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (isApprovedCook(user) && user.activePortal !== "COOK" && !switchError) {
    return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><Loader2 className="h-7 w-7 animate-spin text-red-600" />Opening Cook Portal…</div>;
  }
  if (switchError) return <div className="mx-auto my-12 max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">{switchError}</div>;

  // Enforce backend-authenticated approval status
  if (!isApprovedCook(user)) {
    // If applicant has a pending or needs_revision application, keep them at their status overview
    if (user?.cookProfile?.verificationStatus) {
      return <Navigate to="/become-a-cook" replace />;
    }
    // Otherwise regular customers stay in the marketplace
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ApprovedCookRoute;
