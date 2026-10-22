const statusTone = (value, type) => {
  const status = String(value || "").toUpperCase();
  if (type === "review" && status === "PUBLISHED") return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (type === "review" && status === "HIDDEN") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (type === "review" && status === "REMOVED") return "bg-red-50 text-red-700 ring-red-200";
  if (type === "workshop" && status === "UPCOMING") return "bg-orange-50 text-[#B84722] ring-orange-200";
  if (/CANCEL|DECLIN|FAIL|REJECT|EXPIRED/.test(status)) return "bg-red-50 text-red-700 ring-red-200";
  if (/PENDING|AWAIT|ACCEPTED/.test(status)) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (/CONFIRM|SUCCEEDED|COMPLETED|PAID/.test(status)) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
};

export const StatusChip = ({ children, status, type }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(status || children, type)}`}>
    {children}
  </span>
);

export default StatusChip;
