import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, UtensilsCrossed } from "lucide-react";
import api from "../api/axios.js";

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: trimmedEmail });
      setSubmitted(true);
    } catch (err) {
      // Do not reveal email non-existence, but display unexpected server errors
      setError(err?.message || "Failed to process request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 text-left">
      <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/90 shadow-xs space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-sm">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-red-700 via-amber-600 to-amber-800 bg-clip-text text-transparent">
            TasteBridge
          </span>
        </div>

        {!submitted ? (
          <>
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Forgot your password?
              </h1>
              <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                Enter the email address associated with your TasteBridge account and we'll send you a secure password reset link.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-700">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  "Send reset link"
                )}
              </button>
            </form>
          </>
        ) : (
          /* Confirmation state */
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
              <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                We've sent password reset instructions to your email address if an account exists with that address.
              </p>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100 text-center">
          <button
            onClick={() => navigate("/", { state: { openLogin: true } })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
