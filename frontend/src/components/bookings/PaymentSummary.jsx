import { useState } from "react";
import { ChevronDown, CreditCard } from "lucide-react";

export const PaymentSummary = ({ amountLabel, status, paid, children }) => {
  const [expanded, setExpanded] = useState(!paid);
  return <section className="mt-4 overflow-hidden rounded-xl border border-orange-100 bg-[#FFF9F3]" aria-label="Simulated experience payment">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] sm:px-5">
      <CreditCard className="h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#2B1B12]">{paid ? `Paid ${amountLabel}` : `${amountLabel} · Payment ${status}`}</span>
        <span className="block text-xs text-gray-500">Simulated payment only; no money is charged.</span>
      </span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${paid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{status}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {expanded && <div className="space-y-3 border-t border-orange-100 px-4 py-4 sm:px-5">{children}</div>}
  </section>;
};

export default PaymentSummary;
