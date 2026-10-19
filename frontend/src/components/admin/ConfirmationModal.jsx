import { AlertTriangle, Loader2 } from "lucide-react";

export const ConfirmationModal = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  const buttonStyles =
    confirmVariant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : confirmVariant === "warning"
      ? "bg-amber-600 hover:bg-amber-700 text-white"
      : "bg-emerald-600 hover:bg-emerald-700 text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 leading-tight">{title}</h3>
        </div>

        <p className="text-sm text-gray-600 font-normal leading-relaxed">{message}</p>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer ${buttonStyles}`}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
