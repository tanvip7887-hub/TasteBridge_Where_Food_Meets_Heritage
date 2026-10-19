import { useState, useEffect, useId } from "react";
import { QrCode, Smartphone, RefreshCw, AlertCircle, LoaderCircle } from "lucide-react";

const DEMO_SHORTCUTS = [
  { label: "GPay", vpa: "alex@okhdfcbank" },
  { label: "PhonePe", vpa: "demo@ybl" },
  { label: "Paytm", vpa: "tastebridge@paytm" },
  { label: "BHIM", vpa: "diner@upi" },
];

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

/**
 * Deterministic SVG visual QR pattern based on payload string.
 * Renders standard 7x7 corner finder patterns and pseudo-data modules.
 */
const SvgQrVisual = ({ payload = "" }) => {
  const gridSize = 25;
  // Compute deterministic seed from string
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }

  // Pre-calculate cells
  const isFinderPattern = (r, c) => {
    // Top-Left (0..6, 0..6)
    if (r <= 6 && c <= 6) {
      if (r === 0 || r === 6 || c === 0 || c === 6) return true;
      if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
      return false;
    }
    // Top-Right (0..6, 18..24)
    if (r <= 6 && c >= gridSize - 7) {
      const cc = c - (gridSize - 7);
      if (r === 0 || r === 6 || cc === 0 || cc === 6) return true;
      if (r >= 2 && r <= 4 && cc >= 2 && cc <= 4) return true;
      return false;
    }
    // Bottom-Left (18..24, 0..6)
    if (r >= gridSize - 7 && c <= 6) {
      const rr = r - (gridSize - 7);
      if (rr === 0 || rr === 6 || c === 0 || c === 6) return true;
      if (rr >= 2 && rr <= 4 && c >= 2 && c <= 4) return true;
      return false;
    }
    return null;
  };

  const cells = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const finder = isFinderPattern(r, c);
      if (finder !== null) {
        if (finder) cells.push({ r, c });
      } else {
        // Timing tracks
        if (r === 6 || c === 6) {
          if ((r + c) % 2 === 0) cells.push({ r, c });
        } else {
          // Deterministic pseudo-random module
          const val = Math.sin(hash * 0.001 + r * 17 + c * 31);
          if (val > 0) cells.push({ r, c });
        }
      }
    }
  }

  return (
    <svg
      viewBox={`0 0 ${gridSize} ${gridSize}`}
      className="w-48 h-48 sm:w-56 sm:h-56 mx-auto bg-white p-2 rounded-xl border-2 border-gray-300 shadow-sm"
      role="img"
      aria-label={`Illustrative UPI QR code for ${payload}`}
    >
      <rect width={gridSize} height={gridSize} fill="#ffffff" />
      {cells.map(({ r, c }) => (
        <rect key={`${r}-${c}`} x={c} y={r} width="1.02" height="1.02" fill="#1e293b" />
      ))}
    </svg>
  );
};

export const UpiScreen = ({
  amount,
  reference,
  onConfirm,
  onCancel,
  isBusy,
}) => {
  const [tab, setTab] = useState("id"); // "id" | "qr"
  const [upiId, setUpiId] = useState("");
  const [upiError, setUpiError] = useState("");
  const [qrKey, setQrKey] = useState(1);
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds

  const upiInputId = useId();
  const demoPayload = `TASTEBRIDGE-DEMO:${reference || "TB-SIM-DEMO"}`;

  // Countdown timer for QR
  useEffect(() => {
    if (tab !== "qr") return undefined;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [tab, qrKey]);

  const handleGenerateNewQr = () => {
    setCountdown(300);
    setQrKey((k) => k + 1);
  };

  const handlePayWithId = () => {
    setUpiError("");
    const trimmed = upiId.trim();
    if (!trimmed) {
      setUpiError("Please enter a valid UPI ID (e.g. yourname@bank).");
      return;
    }
    if (!UPI_REGEX.test(trimmed)) {
      setUpiError("Invalid UPI ID format. It should look like username@bank (e.g. alex@okhdfcbank).");
      return;
    }
    onConfirm("SUCCESS");
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5 text-left">
      {/* Sub-Tabs: Enter UPI ID vs Scan QR */}
      <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
        <button
          type="button"
          onClick={() => setTab("id")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition ${
            tab === "id"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
          aria-selected={tab === "id"}
          role="tab"
        >
          <Smartphone className="w-4 h-4 text-red-600" />
          <span>Enter UPI ID</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("qr")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition ${
            tab === "qr"
              ? "bg-white text-gray-900 shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
          aria-selected={tab === "qr"}
          role="tab"
        >
          <QrCode className="w-4 h-4 text-red-600" />
          <span>Scan QR Code</span>
        </button>
      </div>

      {tab === "id" ? (
        <div className="space-y-4">
          <div>
            <label htmlFor={upiInputId} className="block text-xs font-bold text-gray-700">
              Virtual Payment Address (UPI ID)
            </label>
            <div className="mt-1.5 relative">
              <input
                id={upiInputId}
                type="text"
                value={upiId}
                onChange={(e) => {
                  setUpiId(e.target.value);
                  if (upiError) setUpiError("");
                }}
                placeholder="e.g. alex@okhdfcbank"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 ${
                  upiError
                    ? "border-red-300 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-red-100"
                    : "border-gray-300 bg-white text-gray-900 focus:border-red-500 focus:ring-red-100"
                }`}
                disabled={isBusy}
                autoComplete="off"
              />
            </div>
            {upiError && (
              <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1 font-semibold" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {upiError}
              </p>
            )}
          </div>

          {/* Example UPI IDs */}
          <div>
            <span className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Example UPI IDs
            </span>
            <div className="flex flex-wrap gap-2">
              {DEMO_SHORTCUTS.map(({ label, vpa }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => {
                    setUpiId(vpa);
                    setUpiError("");
                  }}
                  disabled={isBusy}
                  className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-orange-50 hover:border-orange-300 text-xs font-semibold text-gray-700 transition cursor-pointer"
                >
                  <span className="text-gray-900 font-bold">{label}</span>: {vpa}
                </button>
              ))}
            </div>
          </div>

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
              onClick={handlePayWithId}
              disabled={isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50 shadow-xs"
            >
              {isBusy && <LoaderCircle className="w-4 h-4 animate-spin" />}
              <span>{isBusy ? "Processing…" : `Pay ${amount}`}</span>
            </button>
          </div>
        </div>
      ) : (
        /* QR Sub-screen */
        <div className="space-y-4 text-center">
          <div className="relative">
            <SvgQrVisual payload={`${demoPayload}-${qrKey}`} />
            {countdown === 0 && (
              <div className="absolute inset-0 bg-slate-900/85 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center p-4 text-white">
                <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                <p className="text-sm font-bold">QR Code Expired</p>
                <p className="text-xs text-gray-300 mt-1 max-w-xs">
                  The scan timer has lapsed. Generate a fresh QR to continue.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateNewQr}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-900 text-xs font-bold hover:bg-gray-100 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Generate New QR
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-700">
              <span>Expires in:</span>
              <span className={`font-mono text-sm px-2 py-0.5 rounded-md ${countdown < 60 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                {formatTime(countdown)}
              </span>
              {countdown > 0 && (
                <button
                  type="button"
                  onClick={handleGenerateNewQr}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline cursor-pointer ml-1"
                  title="Reset 5-minute countdown"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-amber-800" role="note">Illustrative QR only. Do not scan it with a banking app.</p>

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
              disabled={isBusy || countdown === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50 shadow-xs"
            >
              {isBusy && <LoaderCircle className="w-4 h-4 animate-spin" />}
              <span>{isBusy ? "Processing…" : "Scan & Pay"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpiScreen;
