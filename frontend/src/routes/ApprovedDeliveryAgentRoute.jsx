import { Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Loader2 } from "lucide-react";
import { isApprovedDeliveryAgent } from "../utils/deliveryAgentAuth.js";
import { useDispatch } from "react-redux";
import { switchPortal } from "../store/slices/authSlice.js";

export const ApprovedDeliveryAgentRoute = ({ children }) => {
  const dispatch = useDispatch();
  const [switchError, setSwitchError] = useState("");
  const attempted = useRef(false);
  const { user, isAuthenticated, isInitialized, loading } = useSelector((state) => state.auth);

  useEffect(() => {
    if (!isInitialized || loading || !isAuthenticated || !isApprovedDeliveryAgent(user) || user.activePortal === "DELIVERY_AGENT" || attempted.current || switchError) return;
    attempted.current = true;
    dispatch(switchPortal("DELIVERY_AGENT")).unwrap()
      .catch((error) => setSwitchError(error?.message || "Could not switch to the Delivery Agent portal."));
  }, [dispatch, isAuthenticated, isInitialized, loading, switchError, user]);

  if (!isInitialized || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Verifying delivery-agent permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (!isApprovedDeliveryAgent(user)) return <Navigate to="/" replace />;
  if (user.activePortal !== "DELIVERY_AGENT" && !switchError) return <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><Loader2 className="h-7 w-7 animate-spin text-blue-600" />Opening Delivery Agent Portal…</div>;
  if (switchError) return <div className="mx-auto my-12 max-w-lg rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">{switchError}</div>;

  return children;
};

export default ApprovedDeliveryAgentRoute;
