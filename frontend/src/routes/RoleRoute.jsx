import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { Loader2, ShieldAlert } from "lucide-react";

export const RoleRoute = ({ allowedRoles, children }) => {
  const { user, isAuthenticated, isInitialized, loading } = useSelector(
    (state) => state.auth
  );

  if (!isInitialized || loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-sm text-gray-500 font-medium">Verifying permissions...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-xl shadow-sm border border-gray-200 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-sm text-gray-600 mt-2">
          Your account role (<span className="font-semibold text-gray-800">{user?.role}</span>) does not have permission to access this area.
        </p>
      </div>
    );
  }

  return children;
};

export default RoleRoute;
