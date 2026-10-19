import { useState, useEffect } from "react";
import { CreditCard, AlertCircle, LoaderCircle } from "lucide-react";
import {
  DEMO_FAILURE_CARD,
  DEMO_SUCCESS_CARD,
  formatCardNumber,
  formatExpiry,
  isDemoFailureCard,
  isValidExpiry,
  isValidLuhn,
  sanitizeDigits,
} from "./luhnValidation.js";

export const CardScreen = ({
  amount,
  onConfirm,
  onCancel,
  isBusy,
}) => {
  // Pure local state for sensitive fields — never persisted to storage or transmitted over network
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  // Clean up all local sensitive state on unmount
  useEffect(() => {
    return () => {
      setCardNumber("");
      setCardholderName("");
      setExpiry("");
      setCvv("");
    };
  }, []);

  const validateField = (field, value) => {
    switch (field) {
      case "cardNumber": {
        const digits = sanitizeDigits(value);
        if (!digits) return "Card number is required.";
        if (digits.length < 15 || digits.length > 16) return "Enter a valid 15 or 16-digit card number.";
        if (!isValidLuhn(digits)) return "Enter a valid card number.";
        return "";
      }
      case "cardholderName": {
        if (!value.trim()) return "Cardholder name is required.";
        if (value.trim().length < 2) return "Enter the full name on the card.";
        return "";
      }
      case "expiry": {
        if (!value.trim()) return "Expiry date is required.";
        if (!isValidExpiry(value)) return "Enter a valid future expiry date (MM/YY).";
        return "";
      }
      case "cvv": {
        const digits = sanitizeDigits(value);
        if (!digits) return "CVV is required.";
        if (digits.length < 3 || digits.length > 4) return "CVV must be 3 or 4 digits.";
        return "";
      }
      default:
        return "";
    }
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    let val = "";
    if (field === "cardNumber") val = cardNumber;
    if (field === "cardholderName") val = cardholderName;
    if (field === "expiry") val = expiry;
    if (field === "cvv") val = cvv;
    const error = validateField(field, val);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();

    const newErrors = {
      cardNumber: validateField("cardNumber", cardNumber),
      cardholderName: validateField("cardholderName", cardholderName),
      expiry: validateField("expiry", expiry),
      cvv: validateField("cvv", cvv),
    };
    setErrors(newErrors);
    setTouched({ cardNumber: true, cardholderName: true, expiry: true, cvv: true });

    const hasErrors = Object.values(newErrors).some(Boolean);
    if (hasErrors) return;

    // Check if this card is the designated demo failure card
    if (isDemoFailureCard(cardNumber)) {
      onConfirm("FAILURE");
    } else {
      onConfirm("SUCCESS");
    }
  };

  const handleFillDemo = (type) => {
    if (type === "success") {
      setCardNumber(DEMO_SUCCESS_CARD);
      setCardholderName("Sample Cardholder");
      setExpiry("12/28");
      setCvv("123");
    } else {
      setCardNumber(DEMO_FAILURE_CARD);
      setCardholderName("Sample Cardholder");
      setExpiry("12/28");
      setCvv("999");
    }
    setErrors({});
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-left" noValidate>
      {/* Optional example values for the simulated form */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs">
        <span className="font-bold text-gray-700">Example card details</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleFillDemo("success")}
            disabled={isBusy}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 hover:bg-emerald-50 hover:border-emerald-300 font-semibold text-emerald-800 transition cursor-pointer"
          >
            Fill success example
          </button>
          <button
            type="button"
            onClick={() => handleFillDemo("failure")}
            disabled={isBusy}
            className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 hover:bg-red-50 hover:border-red-300 font-semibold text-red-800 transition cursor-pointer"
          >
            Fill decline example
          </button>
        </div>
      </div>

      {/* Card Number */}
      <div>
        <label htmlFor="mock-card-num-input" className="block text-xs font-bold text-gray-700">
          Card number
        </label>
        <div className="mt-1 relative">
          <input
            id="mock-card-num-input"
            type="text"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => {
              setCardNumber(formatCardNumber(e.target.value));
              if (errors.cardNumber) setErrors((prev) => ({ ...prev, cardNumber: "" }));
            }}
            onBlur={() => handleBlur("cardNumber")}
            placeholder="4242 4242 4242 4242"
            maxLength={19}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              touched.cardNumber && errors.cardNumber
                ? "border-red-300 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-100"
                : "border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-100"
            }`}
            disabled={isBusy}
            autoComplete="off"
          />
          <CreditCard className="w-5 h-5 text-gray-400 absolute right-3.5 top-3 pointer-events-none" />
        </div>
        {touched.cardNumber && errors.cardNumber && (
          <p className="mt-1 text-xs text-red-600 flex items-center gap-1 font-semibold" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {errors.cardNumber}
          </p>
        )}
      </div>

      {/* Cardholder Name */}
      <div>
        <label htmlFor="mock-card-name-input" className="block text-xs font-bold text-gray-700">
          Cardholder name
        </label>
        <input
          id="mock-card-name-input"
          type="text"
          value={cardholderName}
          onChange={(e) => {
            setCardholderName(e.target.value);
            if (errors.cardholderName) setErrors((prev) => ({ ...prev, cardholderName: "" }));
          }}
          onBlur={() => handleBlur("cardholderName")}
          placeholder="Name as it appears on card"
          className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 ${
            touched.cardholderName && errors.cardholderName
              ? "border-red-300 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-100"
              : "border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-100"
          }`}
          disabled={isBusy}
          autoComplete="off"
        />
        {touched.cardholderName && errors.cardholderName && (
          <p className="mt-1 text-xs text-red-600 flex items-center gap-1 font-semibold" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {errors.cardholderName}
          </p>
        )}
      </div>

      {/* Expiry & CVV in two columns */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="mock-card-exp-input" className="block text-xs font-bold text-gray-700">
            Expiry date
          </label>
          <input
            id="mock-card-exp-input"
            type="text"
            inputMode="numeric"
            value={expiry}
            onChange={(e) => {
              setExpiry(formatExpiry(e.target.value));
              if (errors.expiry) setErrors((prev) => ({ ...prev, expiry: "" }));
            }}
            onBlur={() => handleBlur("expiry")}
            placeholder="MM/YY"
            maxLength={5}
            className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              touched.expiry && errors.expiry
                ? "border-red-300 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-100"
                : "border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-100"
            }`}
            disabled={isBusy}
            autoComplete="off"
          />
          {touched.expiry && errors.expiry && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1 font-semibold" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.expiry}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="mock-card-cvv-input" className="block text-xs font-bold text-gray-700">
            CVV / CVC
          </label>
          <input
            id="mock-card-cvv-input"
            type="password"
            inputMode="numeric"
            value={cvv}
            onChange={(e) => {
              setCvv(sanitizeDigits(e.target.value).slice(0, 4));
              if (errors.cvv) setErrors((prev) => ({ ...prev, cvv: "" }));
            }}
            onBlur={() => handleBlur("cvv")}
            placeholder="•••"
            maxLength={4}
            className={`mt-1 w-full rounded-xl border px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 ${
              touched.cvv && errors.cvv
                ? "border-red-300 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-100"
                : "border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-100"
            }`}
            disabled={isBusy}
            autoComplete="off"
          />
          {touched.cvv && errors.cvv && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1 font-semibold" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errors.cvv}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
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
          type="submit"
          disabled={isBusy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50 shadow-xs"
        >
          {isBusy && <LoaderCircle className="w-4 h-4 animate-spin" />}
          <span>{isBusy ? "Processing…" : `Pay ${amount}`}</span>
        </button>
      </div>
    </form>
  );
};

export default CardScreen;
