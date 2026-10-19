import { useState } from "react";
import { X } from "lucide-react";
import LoginForm from "./LoginForm.jsx";
import RegisterForm from "./RegisterForm.jsx";
import ForgotPasswordForm from "./ForgotPasswordForm.jsx";

export const AuthModal = ({ isOpen, onClose, initialMode = "login" }) => {
  if (!isOpen) return null;

  return (
    <AuthModalDialog
      key={initialMode}
      onClose={onClose}
      initialMode={initialMode}
    />
  );
};

const AuthModalDialog = ({ onClose, initialMode }) => {
  const [mode, setMode] = useState(initialMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors z-10 cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Form Body */}
        <div className="p-6">
          {mode === "login" && (
            <LoginForm
              onSuccess={onClose}
              onSwitchToRegister={() => setMode("register")}
              onSwitchToForgotPassword={() => setMode("forgot-password")}
            />
          )}

          {mode === "register" && (
            <RegisterForm
              onSuccess={onClose}
              onSwitchToLogin={() => setMode("login")}
            />
          )}

          {mode === "forgot-password" && (
            <ForgotPasswordForm
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
