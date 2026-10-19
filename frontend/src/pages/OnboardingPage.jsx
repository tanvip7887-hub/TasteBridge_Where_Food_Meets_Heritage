import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Sparkles, CheckCircle, ArrowRight } from "lucide-react";

export const OnboardingPage = () => {
  const { user } = useSelector((state) => state.auth);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-4">
          <Sparkles className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-5 h-5 text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
            Email Verified
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          TasteBridge Onboarding
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Welcome to TasteBridge{user?.name ? `, ${user.name}` : ""}! Your account is active.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all hover:shadow-md cursor-pointer"
        >
          Explore Homepage <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
};

export default OnboardingPage;
