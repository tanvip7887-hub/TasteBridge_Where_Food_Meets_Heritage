import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Loader2 } from "lucide-react";

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isInitialized, loading } = useSelector(
    (state) => state.auth
  );
  const location = useLocation();

  if (!isInitialized || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Restoring session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location, openLogin: true }} replace />;
  }

  return children;
};

export default ProtectedRoute;
