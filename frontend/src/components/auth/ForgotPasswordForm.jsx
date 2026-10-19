import { useState, useEffect } from "react";
import { Mail, ArrowLeft, CheckCircle2, AlertCircle, Loader2, KeyRound, Lock } from "lucide-react";
import api from "../../api/axios.js";

export const ForgotPasswordForm = ({ onSwitchToLogin }) => {
  // Step: 1 = Email Input, 2 = OTP Verification, 3 = New Password Input
  const [step, setStep] = useState(1);

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Resend cooldown timer for Step 2
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // STEP 1: Send OTP to Email
  const handleSendOtp = async (e) => {
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
      setEmail(trimmedEmail);
      setStep(2);
      setCooldown(60);
    } catch (err) {
      setError(err?.message || "Failed to send reset code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");

    const trimmedOtp = otp.trim();
    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setError("Verification code must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-reset-otp", {
        email,
        otp: trimmedOtp,
      });

      // Response contains resetToken data
      const token = res?.data?.resetToken || res?.resetToken;
      setResetToken(token);
      setStep(3);
    } catch (err) {
      setError(err?.message || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP in Step 2
  const handleResendOtp = async () => {
    if (cooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSuccessMsg("A new verification code has been sent!");
      setCooldown(60);
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) {
      setError(err?.message || "Failed to resend code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: Submit New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("New password is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Confirm password must match the new password.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        email,
        resetToken,
        password,
        confirmPassword,
      });

      setSuccessMsg("Password reset successfully!");
      setTimeout(() => {
        onSwitchToLogin();
      }, 1500);
    } catch (err) {
      setError(err?.message || "Failed to update password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-2 text-left">
      {/* ERROR FEEDBACK BANNER */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* SUCCESS FEEDBACK BANNER */}
      {successMsg && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* STEP 1: EMAIL INPUT */}
      {step === 1 && (
        <>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Forgot your password?</h2>
            <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto leading-relaxed">
              Enter the email address associated with your TasteBridge account to receive a 6-digit verification code.
            </p>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                "Send Verification Code"
              )}
            </button>
          </form>
        </>
      )}

      {/* STEP 2: OTP VERIFICATION */}
      {step === 2 && (
        <>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Enter Verification Code</h2>
            <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto leading-relaxed">
              We've sent a 6-digit password reset code to <strong className="text-gray-900">{email}</strong>.
            </p>
          </div>

          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                6-Digit Verification Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full pl-9 pr-3 py-2 text-base font-mono tracking-widest bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-center"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying code...
                </>
              ) : (
                "Verify Code"
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || loading}
                className="text-xs text-red-600 font-semibold hover:underline disabled:text-gray-400 disabled:no-underline cursor-pointer"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend verification code"}
              </button>
            </div>
          </form>
        </>
      )}

      {/* STEP 3: NEW PASSWORD INPUT */}
      {step === 3 && (
        <>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-gray-900">Create a New Password</h2>
            <p className="text-xs text-gray-600 mt-1 max-w-xs mx-auto leading-relaxed">
              Please enter your new password below to update your account.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating password...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </>
      )}

      {/* FOOTER: BACK TO LOGIN */}
      <div className="mt-6 pt-4 border-t border-gray-100 text-center">
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-red-600 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
        </button>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
