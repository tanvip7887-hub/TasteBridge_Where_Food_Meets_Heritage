import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyBookingReference, shortenBookingReference } from "../../utils/bookingPresentation.js";

export const InfoItem = ({ icon: Icon, label, value, copyValue }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await copyBookingReference(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#FFF4EA] text-[#D2552B]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <p className="break-words text-sm font-medium text-[#2B1B12]">{copyValue !== undefined ? shortenBookingReference(copyValue) : value}</p>
      </div>
      {copyValue !== undefined && <button type="button" onClick={handleCopy} className="rounded-lg p-2 text-gray-500 transition hover:bg-orange-50 hover:text-[#D2552B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]" aria-label={copied ? "Booking reference copied" : "Copy full booking reference"} title={copied ? "Copied" : "Copy reference"}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        <span className="sr-only">{copied ? "Copied" : "Copy"}</span>
      </button>}
    </div>
  );
};

export default InfoItem;
