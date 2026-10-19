import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "../../store/slices/authSlice.js";
import { Loader2, Mail, Lock, AlertCircle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const LoginForm = ({ onSuccess, onSwitchToRegister, onSwitchToForgotPassword }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((state) => state.auth);
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    setServerError("");
    const result = await dispatch(loginUser(data));

    if (loginUser.fulfilled.match(result)) {
      const loggedInUser = result.payload?.user;
      if (loggedInUser?.activePortal === "ADMIN" || loggedInUser?.role === "ADMIN") {
        navigate("/admin/dashboard");
      } else if (loggedInUser?.activePortal === "COOK") {
        navigate("/cook");
      } else if (loggedInUser?.activePortal === "DELIVERY_AGENT") {
        navigate("/delivery-agent");
      } else {
        // Customer accounts open the marketplace; portal accounts go to their own panel.
        navigate("/");
      }
      if (onSuccess) onSuccess();
    } else if (loginUser.rejected.match(result)) {
      const err = result.payload;
      setServerError(err?.message || "Invalid credentials. Please try again.");
    }
  };

  const handleForgotPasswordClick = (e) => {
    if (onSwitchToForgotPassword) {
      e.preventDefault();
      onSwitchToForgotPassword();
    } else if (onSuccess) {
      onSuccess();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-2">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Welcome Back</h2>
        <p className="text-sm text-gray-600 mt-1">
          Sign in to access your TasteBridge cultural dining experience.
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
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="email"
              placeholder="name@example.com"
              {...register("email")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${errors.email ? "border-red-500" : "border-gray-300"
                }`}
            />
          </div>
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-gray-700">
              Password
            </label>
            <Link
              to="/forgot-password"
              onClick={handleForgotPasswordClick}
              className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline cursor-pointer"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              type="password"
              placeholder="••••••••"
              {...register("password")}
              className={`w-full pl-9 pr-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 ${errors.password ? "border-red-500" : "border-gray-300"
                }`}
            />
          </div>
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-medium text-sm rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing In...
            </>
          ) : (
            "Sign In"
          )}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-600">
        Don't have an account?{" "}
        <button
          type="button"
          onClick={onSwitchToRegister}
          className="text-red-600 font-semibold hover:underline cursor-pointer"
        >
          Create an account
        </button>
      </p>
    </div>
  );
};

export default LoginForm;
