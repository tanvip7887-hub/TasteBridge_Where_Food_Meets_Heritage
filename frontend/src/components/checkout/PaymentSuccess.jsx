import { CheckCircle2, ArrowRight } from "lucide-react";

export const PaymentSuccess = ({
  amount,
  reference,
  orderCount = 1,
  onViewOrders,
  title = "Payment Successful",
  description,
  actionLabel = "View confirmed orders",
}) => {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-6 text-center space-y-4 animate-in fade-in duration-200" role="status">
      <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700">
        <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
      </div>

      <div>
        <h3 className="text-xl font-extrabold text-emerald-950">
          {title}
        </h3>
        <p className="mt-1.5 text-xs sm:text-sm text-emerald-900 leading-relaxed max-w-md mx-auto">
          {description || (
            <>
              Your payment was confirmed and <strong>{orderCount}</strong> kitchen order{orderCount === 1 ? "" : "s"} have been placed.
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-emerald-200/80 bg-white/90 p-4 max-w-sm mx-auto text-xs space-y-1.5 text-left">
        <div className="flex justify-between text-gray-600">
          <span>Amount paid:</span>
          <span className="font-extrabold text-gray-950">{amount}</span>
        </div>
        {reference && (
          <div className="flex justify-between text-gray-600">
            <span>Payment reference:</span>
            <span className="font-mono text-gray-800 text-[11px] truncate max-w-[180px]">{reference}</span>
          </div>
        )}
        <div className="flex justify-between text-gray-600">
          <span>Payment status:</span>
          <span className="font-bold text-emerald-700">SUCCEEDED · PAID</span>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={onViewOrders}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 shadow-md shadow-emerald-700/20 cursor-pointer"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccess;
