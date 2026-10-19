import { Link } from "react-router-dom";
import { UtensilsCrossed, ChefHat, LogOut } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../../store/slices/authSlice.js";
import { isApprovedCook } from "../../utils/cookAuth.js";

export const BecomeCookNavbar = ({
  onSignUpClick,
  showSignUp = true,
  isLanding = true,
  onBackToOverview,
}) => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-orange-100/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* TasteBridge Logo Only */}
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

        {/* Right Action */}
        <div className="flex items-center gap-3">
          {isApprovedCook(user) ? (
            <Link
              to="/"
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 hover:text-red-600 bg-white border border-gray-200 hover:border-red-300 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <UtensilsCrossed className="w-4 h-4 text-red-600" />
              <span>Switch to Marketplace</span>
            </Link>
          ) : (
            showSignUp && (
              <button
                type="button"
                onClick={onSignUpClick}
                className="px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl shadow-md shadow-red-600/20 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
              >
                <ChefHat className="w-4 h-4" />
                <span>Sign Up as a Cook</span>
              </button>
            )
          )}

          {!isLanding && onBackToOverview && (
            <button
              type="button"
              onClick={onBackToOverview}
              className="text-xs font-semibold text-gray-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              ← Overview
            </button>
          )}

          {!isLanding && isAuthenticated && (
            <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
              <span className="hidden md:inline text-xs font-semibold text-gray-700">
                {user?.name?.split(" ")[0]}
              </span>
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
  );
};

export default BecomeCookNavbar;
