import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "../../store/slices/authSlice.js";
import { Loader2, Mail, Lock, User, Phone, AlertCircle } from "lucide-react";
import OtpVerificationForm from "./OtpVerificationForm.jsx";

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    phone: z
      .string()
      .optional()
      .refine(
        (val) => !val || /^\+?[0-9]{10,14}$/.test(val),
        "Please enter a valid phone number"
      ),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const RegisterForm = ({ onSuccess, onSwitchToLogin }) => {
  const dispatch = useDispatch();
  const { registrationLoading } = useSelector((state) => state.auth);
  const [serverError, setServerError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data) => {
    setServerError("");
    const payload = { ...data };
    delete payload.confirmPassword;

    const result = await dispatch(registerUser(payload));

    if (registerUser.fulfilled.match(result)) {
      setPendingEmail(payload.email);
    } else if (registerUser.rejected.match(result)) {
      const err = result.payload;
      setServerError(err?.message || "Registration failed. Please try again.");
    }
  };

  if (pendingEmail) {
    return (
      <OtpVerificationForm
        email={pendingEmail}
        onSuccess={onSuccess}
        onBack={() => setPendingEmail("")}
      />
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-2">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
        <p className="text-sm text-gray-600 mt-1">
          Join TasteBridge to explore authentic home-cooked heritage meals.
        </p>
      </div>

      {serverError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Full Name
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="e.g. Ananya Sharma"
              {...register("name")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                errors.name ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="email"
              placeholder="name@example.com"
              {...register("email")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Phone Number (Optional)
          </label>
          <div className="relative">
            <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="tel"
              placeholder="+91 9876543210"
              {...register("phone")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                errors.phone ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="password"
              placeholder="••••••••"
              {...register("password")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                errors.password ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="password"
              placeholder="••••••••"
              {...register("confirmPassword")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                errors.confirmPassword ? "border-red-500" : "border-gray-300"
              }`}
            />
          </div>
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={registrationLoading}
          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          {registrationLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending Verification Code...
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-600">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-red-600 font-semibold hover:underline cursor-pointer"
        >
          Log in
        </button>
      </p>
    </div>
  );
};

export default RegisterForm;
