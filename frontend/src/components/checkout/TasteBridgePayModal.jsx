import { useEffect, useState } from "react";
import { Clock3, CreditCard, Landmark, LoaderCircle, QrCode, Wallet, X } from "lucide-react";
import { UpiScreen } from "./UpiScreen.jsx";
import { CardScreen } from "./CardScreen.jsx";
import { NetBankingScreen } from "./NetBankingScreen.jsx";
import { WalletScreen } from "./WalletScreen.jsx";
import { PaymentSuccess } from "./PaymentSuccess.jsx";
import { PaymentFailed } from "./PaymentFailed.jsx";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const simulatedMethods = [
  { id: "upi", label: "UPI ID / QR", icon: QrCode },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "bank", label: "Net banking", icon: Landmark },
  { id: "wallet", label: "Wallet", icon: Wallet },
];

export const TasteBridgePayModal = ({
  isOpen,
  onClose,
  title = "TasteBridge Pay",
  subtitle = "Choose a payment method",
  amount,
  reference,
  status = "PENDING",
  countdown,
  expired = false,
  details,
  paymentStage = "gateway",
  paymentBusy = false,
  paymentError = "",
  onConfirm,
  onCancel,
  onRetry,
  successProps = {},
  failureProps = {},
}) => {
  const [demoMethod, setDemoMethod] = useState("upi");

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (paymentBusy) {
          event.preventDefault();
          return;
        }
        if (paymentStage === "gateway") {
          onCancel ? onCancel() : onClose();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, paymentBusy, paymentStage, onCancel, onClose]);

  if (!isOpen) return null;

  const formattedAmount = formatPrice(amount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !paymentBusy) {
          if (paymentStage === "gateway") {
            onCancel ? onCancel() : onClose();
          } else {
            onClose();
          }
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tastebridge-pay-modal-title"
        className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <div className="bg-gradient-to-r from-rose-700 via-red-700 to-orange-600 px-5 py-5 text-white sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="tastebridge-pay-modal-title" className="text-xl font-extrabold sm:text-2xl tracking-tight">
                {title}
              </h2>
              <p className="mt-0.5 text-xs font-medium text-rose-100/90">{subtitle}</p>
            </div>
            <button
              type="button"
              aria-label="Close payment dialog"
              onClick={paymentStage === "gateway" ? (onCancel || onClose) : onClose}
              disabled={paymentBusy}
              className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          {paymentError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
              {paymentError}
            </div>
          )}

          {paymentStage === "gateway" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Payable amount</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-tight text-gray-950">
                      {formattedAmount} <span className="text-sm font-bold text-gray-500">INR</span>
                    </p>
                  </div>
                  {status && (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                      {status}
                    </span>
                  )}
                </div>

                {details && (
                  <div className="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-700">
                    {details}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 text-xs text-gray-600">
                  {reference && (
                    <p>
                      Payment reference: <span className="font-mono font-semibold text-gray-800">{reference}</span>
                    </p>
                  )}
                  {countdown && (
                    <p className="flex items-center gap-1 font-semibold text-amber-900">
                      <Clock3 className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      <span>Time remaining: {countdown}</span>
                    </p>
                  )}
                </div>
              </div>

              {expired && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">
                  The 15-minute payment window has expired. Please refresh your booking.
                </div>
              )}

              {!expired && (
                <>
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" role="note">
                    Simulated checkout only. No payment provider is contacted, no money is charged, and real payment credentials should not be entered.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Simulated payment options">
                    {simulatedMethods.map(({ id, label, icon: Icon }) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => setDemoMethod(id)}
                        aria-pressed={demoMethod === id}
                        disabled={paymentBusy}
                        className={`rounded-xl border p-3.5 text-left transition ${
                          demoMethod === id
                            ? "border-red-500 bg-red-50 ring-2 ring-red-200 font-bold"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <Icon className="h-5 w-5 text-red-600" aria-hidden="true" />
                        <span className="mt-2 block text-xs font-bold text-gray-900">{label}</span>
                      </button>
                    ))}
                  </div>

                  {demoMethod === "upi" && (
                    <UpiScreen
                      amount={formattedAmount}
                      reference={reference || "TB-SIM-DEMO"}
                      onConfirm={onConfirm}
                      onCancel={onCancel || onClose}
                      isBusy={paymentBusy}
                    />
                  )}
                  {demoMethod === "card" && (
                    <CardScreen
                      amount={formattedAmount}
                      onConfirm={onConfirm}
                      onCancel={onCancel || onClose}
                      isBusy={paymentBusy}
                    />
                  )}
                  {demoMethod === "bank" && (
                    <NetBankingScreen
                      amount={formattedAmount}
                      onConfirm={onConfirm}
                      onCancel={onCancel || onClose}
                      isBusy={paymentBusy}
                    />
                  )}
                  {demoMethod === "wallet" && (
                    <WalletScreen
                      amount={formattedAmount}
                      onConfirm={onConfirm}
                      onCancel={onCancel || onClose}
                      isBusy={paymentBusy}
                    />
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
                    <div>
                      <p className="font-bold">Record a failed attempt</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => onConfirm("FAILURE")}
                        disabled={paymentBusy}
                        className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                      >
                        Record failure
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {paymentStage === "processing" && (
            <div className="rounded-2xl bg-slate-50 p-6 text-center" role="status">
              <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-red-600" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-gray-800">Waiting for the server to confirm your payment…</p>
              <p className="mt-1 text-xs text-gray-500">Do not refresh or submit another payment action.</p>
            </div>
          )}

          {paymentStage === "success" && (
            <PaymentSuccess
              amount={formattedAmount}
              reference={reference}
              title={successProps.title || "Payment Successful"}
              description={successProps.description}
              actionLabel={successProps.actionLabel || "View confirmed bookings"}
              onViewOrders={successProps.onAction || onClose}
            />
          )}

          {paymentStage === "failure" && (
            <PaymentFailed
              error={paymentError}
              reference={reference}
              title={failureProps.title || "Payment Failed"}
              description={failureProps.description}
              backLabel={failureProps.backLabel || "Back to bookings"}
              retryLabel={failureProps.retryLabel || "Try again"}
              onRetry={onRetry}
              onClose={onClose}
              isBusy={paymentBusy}
            />
          )}

          {paymentStage === "cancelled" && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center" role="status">
              <X className="mx-auto h-10 w-10 text-gray-500" aria-hidden="true" />
              <h3 className="mt-3 text-lg font-extrabold text-gray-900">Payment cancelled</h3>
              <p className="mt-1 text-sm text-gray-600">Your payment attempt was cancelled. Your booking remains held until the deadline.</p>
              <button
                type="button"
                onClick={onRetry || onClose}
                className="mt-5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100"
              >
                Back to payment options
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default TasteBridgePayModal;
