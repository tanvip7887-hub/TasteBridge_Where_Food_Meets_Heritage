import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Loader2 } from "lucide-react";
import { switchPortal } from "../store/slices/authSlice.js";

const ActivePortalRoute = ({ portal, children, allowPublic = false }) => {
  const dispatch = useDispatch();
  const { user, isAuthenticated, isInitialized, loading, sessionError } = useSelector((state) => state.auth);
  const [error, setError] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (!isInitialized || loading || !isAuthenticated || user?.activePortal === portal || attempted.current) return;
    if (!user?.availablePortals?.includes(portal)) return;
    attempted.current = true;
    dispatch(switchPortal(portal)).unwrap()
      .catch((failure) => setError(failure?.message || "Could not select this portal."));
  }, [dispatch, isAuthenticated, isInitialized, loading, portal, user?.activePortal, user?.availablePortals]);

  const switching = isAuthenticated && user?.activePortal !== portal && user?.availablePortals?.includes(portal) && !error;
  if (!isInitialized || loading || switching) {
    return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-gray-600" role="status"><Loader2 className="h-7 w-7 animate-spin text-red-600" />Selecting your portal…</div>;
  }
  if (!isAuthenticated) {
    if (!allowPublic) return <Navigate to="/" replace />;
    return <>
      {sessionError && <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">{sessionError}</div>}
      {children}
    </>;
  }
  if (user?.role === "ADMIN" || user?.accountRole === "ADMIN") return <Navigate to="/admin/dashboard" replace />;
  if (!user?.availablePortals?.includes(portal)) return <Navigate to="/" replace />;
  if (user.activePortal !== portal) {
    return error ? <div className="mx-auto my-12 max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">{error}</div> : <div className="min-h-[40vh]" role="status">Updating portal…</div>;
  }
  return children;
};

export default ActivePortalRoute;
