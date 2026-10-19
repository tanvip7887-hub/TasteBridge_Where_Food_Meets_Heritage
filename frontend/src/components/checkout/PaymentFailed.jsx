import { AlertCircle, RefreshCw } from "lucide-react";

export const PaymentFailed = ({
  error,
  reference,
  onRetry,
  onClose,
  isBusy,
  title = "Payment Failed",
  description,
  backLabel = "Back to checkout",
  retryLabel = "Try again",
}) => {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center space-y-4 animate-in fade-in duration-200" role="status">
      <div className="w-14 h-14 mx-auto rounded-full bg-red-100 border border-red-200 flex items-center justify-center text-red-600">
        <AlertCircle className="w-8 h-8" aria-hidden="true" />
      </div>

      <div>
        <h3 className="text-xl font-extrabold text-red-950">
          {title}
        </h3>
        <p className="mt-1.5 text-xs sm:text-sm text-red-800 leading-relaxed max-w-md mx-auto">
          {error || description || "Your payment could not be completed. No order was placed and your cart has been saved."}
        </p>
      </div>

      {reference && (
        <p className="text-[11px] font-mono text-gray-500">
          Attempt reference: {reference}
        </p>
      )}

      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isBusy}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50"
        >
          {backLabel}
        </button>
        <button
          type="button"
          onClick={onRetry}
          disabled={isBusy}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-red-700 text-xs font-bold text-white hover:bg-red-800 cursor-pointer disabled:opacity-50 shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>{retryLabel}</span>
        </button>
      </div>
    </div>
  );
};

export default PaymentFailed;
