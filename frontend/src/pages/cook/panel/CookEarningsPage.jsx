import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Info, Search, ShoppingBag, Utensils, Wallet } from "lucide-react";
import cookApi from "../../../api/cookApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const formatMoney = (amount) => {
  if (amount == null || amount === "") return "—";
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : "—";
};
const label = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const SOURCE_TABS = [
  { id: "all", query: "", title: "All" },
  { id: "food", query: "food", title: "Food Orders" },
  { id: "dining", query: "dining", title: "Dining" },
  { id: "workshop", query: "workshop", title: "Workshops" },
];

const StatCard = ({ title, amount, description, Icon, tone = "default" }) => (
  <article className={`group flex min-h-36 flex-col rounded-2xl border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-orange-100 bg-white"}`}>
    <div className="flex items-start justify-between gap-3"><p className={`text-sm font-semibold ${tone === "amber" ? "text-amber-900" : "text-gray-600"}`}>{title}</p><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-orange-50 text-[#D2552B]"}`}><Icon aria-hidden="true" className="h-5 w-5" /></span></div>
    <p className={`mt-3 text-2xl font-extrabold ${tone === "amber" ? "text-amber-950" : "text-[#2B1B12]"}`}>{amount}</p>
    <p className={`mt-auto pt-1 text-xs ${tone === "amber" ? "text-amber-900" : "text-gray-500"}`}>{description}</p>
  </article>
);

const BreakdownCard = ({ title, Icon, amounts, count, share, unsupported = false }) => (
  <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-[#D2552B]"><Icon aria-hidden="true" className="h-5 w-5" /></span><h3 className="font-bold text-[#2B1B12]">{title}</h3></div>
    {unsupported ? <><p className="mt-4 text-lg font-bold text-gray-500">Not tracked</p><p className="mt-1 min-h-10 text-xs text-gray-500">This source is not included in the saved earnings data yet.</p></> : <>
      <p className="mt-4 text-2xl font-extrabold text-[#2B1B12]">{formatMoney(amounts?.netCookEarnings)}</p>
      <dl className="mt-4 space-y-2 border-t border-gray-100 pt-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-gray-500">Gross</dt><dd className="font-medium">{formatMoney(amounts?.grossAmount)}</dd></div><div className="flex justify-between gap-3"><dt className="text-gray-500">Commission</dt><dd className="font-medium">{formatMoney(amounts?.platformCommission)}</dd></div><div className="flex justify-between gap-3"><dt className="font-semibold text-gray-700">Net</dt><dd className="font-bold text-[#2B1B12]">{formatMoney(amounts?.netCookEarnings)}</dd></div></dl>
      <p className="mt-2 text-xs text-gray-500">{count == null ? "Order count unavailable" : `${count} ${count === 1 ? "order" : "orders"}`}</p>
      <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-orange-50"><div className="h-full rounded-full bg-[#D2552B]" style={{ width: `${share ?? 0}%` }} /></div><span className="text-xs text-gray-500">{share == null ? "Share unavailable" : `${share}%`}</span></div>
    </>}
  </article>
);

const EarningsTabs = ({ active, counts, onSelect }) => <div role="tablist" aria-label="Earnings source" className="flex gap-2 overflow-x-auto border-b border-gray-100 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
  {SOURCE_TABS.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => onSelect(tab)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${active === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
    {tab.title}{counts[tab.id] != null && <span className={`rounded-full px-2 py-0.5 text-xs ${active === tab.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>{counts[tab.id]}</span>}
  </button>)}
</div>;

const EmptyState = ({ source, filtered }) => <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 px-5 py-12 text-center"><Wallet aria-hidden="true" className="mx-auto h-9 w-9 text-orange-300" /><p className="mt-3 font-bold text-[#2B1B12]">{source === "dining" ? "No dining earnings available" : source === "workshop" ? "No workshop earnings available" : filtered ? "No matching order earnings" : "No order earnings yet"}</p><p className="mt-1 text-sm text-gray-600">{source === "dining" || source === "workshop" ? "Dining and workshop earnings are not returned by the current earnings service." : "Eligible earnings appear after delivery and recorded payment."}</p></div>;

const EarningsRow = ({ order, showSource }) => (
  <tr className="transition-colors hover:bg-orange-50/40">
    <td className="py-4 pr-4"><p className="max-w-56 truncate font-bold text-[#2B1B12]" title={order.orderNumber}>{order.orderNumber}</p><p className="mt-1 text-xs text-gray-500">{order.deliveredAt ? `Delivered ${new Date(order.deliveredAt).toLocaleDateString()}` : `Placed ${new Date(order.placedAt).toLocaleDateString()}`}</p></td>
    {showSource && <td className="py-4 pr-4"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-[#D2552B]">Food</span></td>}
    <td className="py-4 pr-4"><p className="font-semibold">{label(order.status)}</p><p className="mt-1 text-xs text-gray-500">{label(order.earningStatus)}</p></td>
    <td className="py-4 pr-4">{label(order.paymentMethod || "Unknown")} · {label(order.paymentStatus)}</td>
    <td className="py-4 pr-4 text-right tabular-nums">{formatMoney(order.grossAmount)}</td><td className="py-4 pr-4 text-right tabular-nums">{formatMoney(order.platformCommission)}</td><td className="py-4 text-right font-extrabold text-[#2B1B12] tabular-nums">{formatMoney(order.amount)}</td>
  </tr>
);

export const CookEarningsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "", paymentStatus: "", period: "ALL" });
  const [page, setPage] = useState(1);
  const [source, setSource] = useState(() => {
    const value = new URLSearchParams(window.location.search).get("source");
    return SOURCE_TABS.find((tab) => tab.query === value)?.id || "all";
  });
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true); setError("");
    try {
      const response = unwrap(await cookApi.getEarnings({ page, pageSize: 20, ...filters }));
      if (requestGeneration.current === generation) setData(response);
    } catch (requestError) {
      if (requestGeneration.current === generation) setError(requestError?.message || "Cook earnings could not be loaded.");
    } finally { if (requestGeneration.current === generation) setLoading(false); }
  }, [filters, page]);

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => { window.clearTimeout(timer); requestGeneration.current += 1; }; }, [load]);
  useEffect(() => {
    const syncSource = () => { const value = new URLSearchParams(window.location.search).get("source"); setSource(SOURCE_TABS.find((tab) => tab.query === value)?.id || "all"); };
    window.addEventListener("popstate", syncSource); return () => window.removeEventListener("popstate", syncSource);
  }, []);
  useEffect(() => {
    if (searchDraft.trim() === filters.search) return undefined;
    const timer = window.setTimeout(() => { setPage(1); setFilters((current) => ({ ...current, search: searchDraft.trim() })); }, 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search]);

  const updateFilter = (key, value) => { setPage(1); setFilters((current) => ({ ...current, [key]: value })); };
  const selectSource = (tab) => {
    setSource(tab.id);
    const url = new URL(window.location.href);
    if (tab.query) url.searchParams.set("source", tab.query); else url.searchParams.delete("source");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const submitSearch = (event) => { event.preventDefault(); updateFilter("search", searchDraft.trim()); };

  const totals = data?.totals || {};
  const pagination = data?.pagination || { page: 1, totalPages: 1, totalCount: 0 };
  const selectedTotals = filters.period === "THIS_MONTH" ? totals.currentMonth : filters.period === "LAST_MONTH" ? totals.previousMonth : totals.allTime;
  const orders = data?.orders || [];
  const visibleOrders = source === "dining" || source === "workshop" ? [] : orders;
  const activeFilters = Boolean(filters.search || filters.status || filters.paymentStatus || filters.period !== "ALL");
  const counts = { all: pagination.totalCount, food: pagination.totalCount, dining: null, workshop: null };
  const foodShare = null;

  return <main className="space-y-8 px-4 pb-8 pt-6 text-left sm:px-6 lg:px-8" aria-labelledby="earnings-page-title">
    <h1 id="earnings-page-title" className="sr-only">Earnings</h1>
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={load} className="min-h-11 font-bold underline">Try again</button></div>}

    {loading && !data ? <div role="status" className="space-y-8"><p className="text-sm text-gray-600">Loading earnings…</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-orange-100 bg-white" />)}</div><div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-56 animate-pulse rounded-2xl border border-orange-100 bg-white" />)}</div></div> : !error && data && <>
      <section aria-labelledby="overview-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 id="overview-title" className="text-lg font-bold text-[#2B1B12]">Total earnings</h2><details className="relative"><summary aria-label="How earnings are counted" className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"><Info aria-hidden="true" className="h-4 w-4" /></summary><p className="absolute left-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-3 text-sm leading-5 text-gray-600 shadow-lg">{data.note} Monthly attribution uses delivery date; delayed COD collection cannot be assigned to its exact collection month. The current service includes food orders only.</p></details><p className="hidden text-xs text-gray-500 sm:block">Current earnings data includes food orders only</p></div>
          <div role="group" aria-label="Earnings period" className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1">{[{ value: "THIS_MONTH", text: "This month" }, { value: "LAST_MONTH", text: "Last month" }, { value: "ALL", text: "All time" }].map((period) => <button key={period.value} type="button" onClick={() => updateFilter("period", period.value)} aria-pressed={filters.period === period.value} className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${filters.period === period.value ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-50"}`}>{period.text}</button>)}</div></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total net earnings" amount={formatMoney(selectedTotals?.netCookEarnings)} description="Paid and delivered food orders" Icon={CircleDollarSign} />
          <StatCard title="Pending / awaiting" amount="—" description="Awaiting delivery/completion totals are not returned by the service" Icon={Clock3} />
          <StatCard title="COD awaiting collection" amount={formatMoney(totals.awaitingCodCollection ?? data.awaitingCodCollection)} description="Delivered COD orders; excluded from earned totals" Icon={Banknote} tone="amber" />
          <StatCard title="Total commission" amount={formatMoney(selectedTotals?.platformCommission)} description="Saved platform commission; payout settlement is not tracked" Icon={CheckCircle2} />
        </div>
      </section>

      <section aria-labelledby="source-title" className="space-y-4"><div><h2 id="source-title" className="text-lg font-bold text-[#2B1B12]">Earnings by source</h2><p className="mt-1 text-sm text-gray-600">Source totals use earnings records returned by the current service.</p></div>
        <div className="grid gap-4 lg:grid-cols-3"><BreakdownCard title="Food Orders" Icon={ShoppingBag} amounts={selectedTotals} count={null} share={foodShare} /><BreakdownCard title="Dining Experiences" Icon={Utensils} unsupported /><BreakdownCard title="Workshops" Icon={CalendarDays} unsupported /></div>
      </section>

      <section aria-labelledby="history-title" className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="history-title" className="font-bold text-[#2B1B12]">Earnings history</h2><p className="mt-1 text-sm text-gray-600">Payout settlement is not tracked.</p></div></div>
        <EarningsTabs active={source} counts={counts} onSelect={selectSource} />
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="relative min-w-[220px] flex-1"><Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input aria-label="Search order or booking reference" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search order or booking reference" className="h-11 w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /></form>
          <select aria-label="Filter by delivery period" value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} className="h-11 min-w-36 rounded-xl border border-gray-200 px-3 text-sm"><option value="ALL">All periods</option><option value="THIS_MONTH">This month</option><option value="LAST_MONTH">Last month</option></select>
          <select aria-label="Filter by order status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="h-11 min-w-44 rounded-xl border border-gray-200 px-3 text-sm"><option value="">All order statuses</option>{["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
          <select aria-label="Filter by payment status" value={filters.paymentStatus} onChange={(event) => updateFilter("paymentStatus", event.target.value)} className="h-11 min-w-44 rounded-xl border border-gray-200 px-3 text-sm"><option value="">All payment statuses</option>{["PENDING", "PAID", "FAILED", "REFUNDED"].map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
          {activeFilters && <button type="button" onClick={() => { setSearchDraft(""); setPage(1); setFilters({ search: "", status: "", paymentStatus: "", period: "ALL" }); }} className="min-h-11 px-2 text-sm font-semibold text-[#D2552B] underline">Clear filters</button>}
        </div>
        {loading ? <div role="status" className="space-y-3 py-2"><p className="text-center text-sm text-gray-600">Updating earnings history…</p>{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-50" />)}</div> : visibleOrders.length ? <>
          <div className="space-y-3 md:hidden">{visibleOrders.map((order) => <article key={order.id} className="rounded-xl border border-gray-100 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-bold text-[#2B1B12]">{order.orderNumber}</p><p className="mt-1 text-xs text-gray-500">{order.deliveredAt ? `Delivered ${new Date(order.deliveredAt).toLocaleDateString()}` : `Placed ${new Date(order.placedAt).toLocaleDateString()}`}</p></div><span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-[#D2552B]">Food</span></div><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-gray-100 px-2.5 py-1">{label(order.status)}</span><span className="rounded-full bg-gray-100 px-2.5 py-1">{label(order.paymentMethod || "Unknown")} · {label(order.paymentStatus)}</span></div><div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-xs"><div><p className="text-gray-500">Gross</p><p className="mt-1 font-semibold">{formatMoney(order.grossAmount)}</p></div><div><p className="text-gray-500">Commission</p><p className="mt-1 font-semibold">{formatMoney(order.platformCommission)}</p></div><div><p className="text-gray-500">Net</p><p className="mt-1 font-bold">{formatMoney(order.amount)}</p></div></div></article>)}<div className="grid grid-cols-3 gap-2 rounded-xl bg-orange-50/40 p-4 text-xs font-semibold"><div><p className="text-gray-500">Gross total</p><p className="mt-1">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0))}</p></div><div><p className="text-gray-500">Commission total</p><p className="mt-1">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.platformCommission || 0), 0))}</p></div><div><p className="text-gray-500">Net total</p><p className="mt-1">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</p></div></div></div>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[920px] text-left text-sm"><thead className="sticky top-0 border-b border-gray-100 bg-white text-xs uppercase tracking-wide text-gray-500"><tr><th scope="col" className="py-3 pr-4">Reference / date</th>{source === "all" && <th scope="col" className="py-3 pr-4">Source</th>}<th scope="col" className="py-3 pr-4">Status</th><th scope="col" className="py-3 pr-4">Payment</th><th scope="col" className="py-3 pr-4 text-right">Gross</th><th scope="col" className="py-3 pr-4 text-right">Commission</th><th scope="col" className="py-3 text-right">Net earnings</th></tr></thead><tbody className="divide-y divide-gray-100">{visibleOrders.map((order) => <EarningsRow key={order.id} order={order} showSource={source === "all"} />)}</tbody><tfoot className="border-t border-gray-200 bg-orange-50/40 font-bold"><tr><th scope="row" colSpan={source === "all" ? 4 : 3} className="py-3 pr-4 text-left">Visible rows total</th><td className="py-3 pr-4 text-right">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0))}</td><td className="py-3 pr-4 text-right">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.platformCommission || 0), 0))}</td><td className="py-3 text-right">{formatMoney(visibleOrders.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</td></tr></tfoot></table></div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm"><p className="text-gray-600">{pagination.totalCount} orders · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={!pagination.hasPreviousPage || loading} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-gray-200 px-3 font-semibold disabled:opacity-50"><ChevronLeft aria-hidden="true" className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={!pagination.hasNextPage || loading} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-gray-200 px-3 font-semibold disabled:opacity-50">Next<ChevronRight aria-hidden="true" className="h-4 w-4" /></button></div></div>
        </> : <EmptyState source={source} filtered={activeFilters} />}
      </section>
    </>}
  </main>;
};

export default CookEarningsPage;
