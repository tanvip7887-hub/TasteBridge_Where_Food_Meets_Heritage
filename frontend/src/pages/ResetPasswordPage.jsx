import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Lock, AlertCircle, CheckCircle2, Loader2, UtensilsCrossed, ArrowLeft } from "lucide-react";
import api from "../api/axios.js";

export const ResetPasswordPage = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [validating, setValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate token on component mount
  useEffect(() => {
    let isMounted = true;
    const validateToken = async () => {
      if (!token) {
        if (isMounted) {
          setValidating(false);
          setIsValidToken(false);
          setTokenError("This reset link is invalid or expired.");
        }
        return;
      }

      try {
        await api.post("/auth/validate-reset-token", { token });
        if (isMounted) {
          setIsValidToken(true);
          setValidating(false);
        }
      } catch (err) {
        if (isMounted) {
          setIsValidToken(false);
          if (err?.status === 400 || err?.status === 404) {
            setTokenError("This reset link is invalid or has expired.");
          } else if (err?.message?.includes("Network Error") || !err?.status) {
            setTokenError("Unable to connect to TasteBridge backend server. Please make sure the backend server (port 5000) is running.");
          } else {
            setTokenError(err?.message || "This reset link is invalid or expired.");
          }
          setValidating(false);
        }
      }
    };

    validateToken();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!password) {
      setSubmitError("New password is required.");
      return;
    }

    if (password.length < 6) {
      setSubmitError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError("Confirm password must match the new password.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        password,
        confirmPassword,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate("/", { state: { openLogin: true } });
      }, 2000);
    } catch (err) {
      setSubmitError(
        err?.message || "Failed to reset password. Please try again."
      );
    } finally {
      setSubmitting(false);
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

        {/* Loading State */}
        {validating && (
          <div className="text-center py-8 space-y-3">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin mx-auto" />
            <p className="text-xs text-gray-500 font-medium">
              Validating password reset link...
            </p>
          </div>
        )}

        {/* Invalid / Expired Token State */}
        {!validating && !isValidToken && (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-gray-900">
                This reset link is invalid or expired.
              </h1>
              <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                {tokenError ||
                  "Password reset links are time-sensitive and single-use only."}
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/forgot-password"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Request a new reset link
              </Link>
            </div>
          </div>
        )}

        {/* Valid Token & Reset Form */}
        {!validating && isValidToken && (
          <>
            {success ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold text-gray-900">
                    Password Reset Successfully!
                  </h2>
                  <p className="text-xs text-gray-600 leading-relaxed max-w-xs mx-auto">
                    Your password has been updated. Redirecting to login...
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center space-y-1.5">
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                    Create a new password
                  </h1>
                  <p className="text-xs text-gray-600">
                    Please enter your new password below.
                  </p>
                </div>

                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-gray-700">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full pl-10 pr-3.5 py-2.5 text-xs bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Resetting password...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </button>
                </form>
              </>
            )}
          </>
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

export default ResetPasswordPage;
