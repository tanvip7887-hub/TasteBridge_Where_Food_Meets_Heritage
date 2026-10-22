import { useRef } from "react";

export const Tabs = ({ tabs, value, onChange, label = "Booking status", idPrefix = "booking" }) => {
  const refs = useRef([]);
  const selectRelative = (currentIndex, direction) => {
    const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].value);
    refs.current[nextIndex]?.focus();
  };

  return <div className="-mx-1 overflow-x-auto px-1">
    <div className="flex min-w-max border-b border-orange-100" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => <button
        key={tab.value}
        ref={(node) => { refs.current[index] = node; }}
        id={`${idPrefix}-tab-${tab.value}`}
        type="button"
        role="tab"
        aria-selected={value === tab.value}
        aria-controls={`${idPrefix}-panel-${tab.value}`}
        tabIndex={value === tab.value ? 0 : -1}
        onClick={() => onChange(tab.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") { event.preventDefault(); selectRelative(index, 1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); selectRelative(index, -1); }
          if (event.key === "Home") { event.preventDefault(); onChange(tabs[0].value); refs.current[0]?.focus(); }
          if (event.key === "End") { event.preventDefault(); onChange(tabs.at(-1).value); refs.current[tabs.length - 1]?.focus(); }
        }}
        className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${value === tab.value ? "border-[#D2552B] text-[#D2552B]" : "border-transparent text-gray-600 hover:text-[#2B1B12]"}`}
      >
        {tab.label}{tab.count !== null && tab.count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${value === tab.value ? "bg-orange-50 text-[#D2552B]" : "bg-gray-100 text-gray-600"}`}>{tab.count}</span>}
      </button>)}
    </div>
  </div>;
};

export default Tabs;
