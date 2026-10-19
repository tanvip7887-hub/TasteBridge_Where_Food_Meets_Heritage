import { useState, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { verifyRegisterOtp, resendRegisterOtp } from "../../store/slices/authSlice.js";
import { Loader2, Mail, AlertCircle, ArrowLeft, CheckCircle2, RefreshCw } from "lucide-react";

export const OtpVerificationForm = ({ email, onSuccess, onBack }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [cooldown, setCooldown] = useState(60);

  const inputRefs = useRef([]);

  // Cooldown countdown timer for Resend OTP
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cooldown]);

  // Handle single digit change
  const handleChange = (index, value) => {
    setErrorMsg("");
    if (!/^\d*$/.test(value)) return; // Allow numbers only

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Take last character
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle key down (Backspace navigation)
  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste full 6-digit code
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();
    if (!/^\d{6}$/.test(pastedData)) {
      setErrorMsg("Please paste a valid 6-digit numeric verification code.");
      return;
    }
    const digits = pastedData.split("");
    setOtp(digits);
    inputRefs.current[5]?.focus();
  };

  const fullOtp = otp.join("");

  const handleVerify = async (e) => {
    e?.preventDefault();
    if (fullOtp.length !== 6) {
      setErrorMsg("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setInfoMsg("");

    const result = await dispatch(verifyRegisterOtp({ email, otp: fullOtp }));
    setLoading(false);

    if (verifyRegisterOtp.fulfilled.match(result)) {
      if (onSuccess) onSuccess();
      const verifiedUser = result.payload?.user;
      if (verifiedUser?.role === "ADMIN") {
        navigate("/admin/dashboard");
      } else {
        navigate("/");
      }
    } else if (verifyRegisterOtp.rejected.match(result)) {
      const err = result.payload;
      setErrorMsg(
        err?.message || "Invalid or expired verification code. Please try again."
      );
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;

    setResending(true);
    setErrorMsg("");
    setInfoMsg("");

    const result = await dispatch(resendRegisterOtp({ email }));
    setResending(false);

    if (resendRegisterOtp.fulfilled.match(result)) {
      setInfoMsg("A new verification email was submitted to your email provider. It may take a few minutes to arrive; check your Inbox and Spam/Junk folders.");
      setCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } else if (resendRegisterOtp.rejected.match(result)) {
      const err = result.payload;
      setErrorMsg(
        err?.message || "Failed to resend verification code. Please try again."
      );
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-2">
      <div className="mb-6 text-center">
        <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
          <Mail className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Verify your email</h2>
        <p className="text-sm text-gray-600 mt-1">
          The verification email was submitted successfully to your email provider. It may take a few minutes to arrive; check your Inbox and Spam/Junk folders:
        </p>
        <p className="text-sm font-semibold text-gray-900 mt-0.5">{email}</p>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {infoMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{infoMsg}</span>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-6">
        <div>
          <label className="block text-xs font-semibold text-gray-700 text-center mb-3">
            Enter 6-digit Code
          </label>
          <div className="flex items-center justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-11 h-12 text-center text-xl font-bold text-gray-900 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all shadow-sm"
              />
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || fullOtp.length !== 6}
          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying...
            </>
          ) : (
            "Verify & Create Account"
          )}
        </button>
      </form>

      <div className="mt-6 flex flex-col items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-gray-600">
          <span>Didn't receive code?</span>
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || resending}
            className="text-red-600 font-semibold hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer flex items-center gap-1"
          >
            {resending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend Code"}
          </button>
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 mt-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Change Email / Back to Sign Up</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default OtpVerificationForm;
