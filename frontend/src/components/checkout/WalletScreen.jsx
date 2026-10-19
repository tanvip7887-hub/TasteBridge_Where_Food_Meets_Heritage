import { useState } from "react";
import { Wallet, Check, LoaderCircle } from "lucide-react";

const POPULAR_WALLETS = [
  { id: "paytm", name: "Paytm Wallet" },
  { id: "phonepe", name: "PhonePe Wallet" },
  { id: "amazonpay", name: "Amazon Pay" },
  { id: "mobikwik", name: "MobiKwik" },
];

export const WalletScreen = ({
  amount,
  onConfirm,
  onCancel,
  isBusy,
}) => {
  const [selectedWalletId, setSelectedWalletId] = useState("paytm");

  const selectedWallet = POPULAR_WALLETS.find((w) => w.id === selectedWalletId) || POPULAR_WALLETS[0];

  return (
    <div className="space-y-4 text-left">
      <div>
        <p className="text-xs font-bold text-gray-700">
          Choose a digital wallet
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Select your preferred digital wallet to proceed.
        </p>
      </div>

      {/* Four Selectable Wallet Tiles in Responsive 2-Column Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" role="radiogroup" aria-label="Select digital wallet">
        {POPULAR_WALLETS.map((wallet) => {
          const isSelected = selectedWalletId === wallet.id;
          return (
            <button
              key={wallet.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedWalletId(wallet.id)}
              disabled={isBusy}
              className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                isSelected
                  ? "border-red-500 bg-red-50/50 ring-2 ring-red-200"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/60"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  isSelected ? "bg-red-700 text-white" : "bg-gray-100 text-gray-700"
                }`}>
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900">{wallet.name}</p>
                </div>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                isSelected ? "border-red-600 bg-red-600 text-white" : "border-gray-300 bg-white"
              }`}>
                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 border-t border-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm("SUCCESS")}
          disabled={isBusy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50 shadow-xs"
        >
          {isBusy && <LoaderCircle className="w-4 h-4 animate-spin" />}
          <span>{isBusy ? "Processing…" : `Pay ${amount} with ${selectedWallet.name}`}</span>
        </button>
      </div>
    </div>
  );
};

export default WalletScreen;
