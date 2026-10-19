import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, Search, Wallet } from "lucide-react";
import cookApi from "../../../api/cookApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const formatMoney = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(amount || 0));
const label = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

const SummaryCard = ({ title, amount, description, tone = "default" }) => (
  <article className={`rounded-2xl border p-5 shadow-sm ${tone === "amber" ? "border-amber-200 bg-amber-50" : "border-orange-100 bg-white"}`}>
    <p className={`text-sm font-semibold ${tone === "amber" ? "text-amber-900" : "text-gray-600"}`}>{title}</p>
    <p className={`mt-3 text-2xl font-extrabold ${tone === "amber" ? "text-amber-950" : "text-[#2B1B12]"}`}>{formatMoney(amount)}</p>
    <p className={`mt-1 text-xs ${tone === "amber" ? "text-amber-900" : "text-gray-500"}`}>{description}</p>
  </article>
);

export const CookEarningsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState({ search: "", status: "", paymentStatus: "", period: "ALL" });
  const [page, setPage] = useState(1);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const response = unwrap(await cookApi.getEarnings({ page, pageSize: 20, ...filters }));
      if (requestGeneration.current === generation) setData(response);
    } catch (requestError) {
      if (requestGeneration.current === generation) setError(requestError?.message || "Cook earnings could not be loaded.");
    } finally {
      if (requestGeneration.current === generation) setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => { window.clearTimeout(timer); requestGeneration.current += 1; };
  }, [load]);

  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const submitSearch = (event) => {
    event.preventDefault();
    updateFilter("search", searchDraft.trim());
  };

  const totals = data?.totals || {};
  const pagination = data?.pagination || { page: 1, totalPages: 1, totalCount: 0 };

  return (
    <section className="space-y-6 text-left">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#D2552B]">Cook Panel</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#2B1B12]">Earnings</h1>
          <p className="mt-1 text-sm text-gray-600">Net cook earnings use the saved order amount and are counted after delivery and recorded customer payment.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={load} className="font-bold underline">Try again</button></div>}

      {loading && !data ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600"><RefreshCw className="h-5 w-5 animate-spin text-red-600" />Loading earnings…</div> : !error && data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="All-time earned" amount={totals.allTime?.netCookEarnings ?? data.totalEarned} description="Delivered orders with payment recorded" />
          <SummaryCard title="Delivered this month" amount={totals.currentMonth?.netCookEarnings} description={`Paid orders by delivery date · gross ${formatMoney(totals.currentMonth?.grossAmount)} · commission ${formatMoney(totals.currentMonth?.platformCommission)}`} />
          <SummaryCard title="Delivered previous month" amount={totals.previousMonth?.netCookEarnings} description={`Paid orders by delivery date · gross ${formatMoney(totals.previousMonth?.grossAmount)} · commission ${formatMoney(totals.previousMonth?.platformCommission)}`} />
          <SummaryCard title="COD awaiting collection" amount={totals.awaitingCodCollection ?? data.awaitingCodCollection} description="Delivered COD orders; excluded from earned totals" tone="amber" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
            <div><h2 className="font-bold text-[#2B1B12]">Order earnings history</h2><p className="mt-1 text-sm text-gray-600">Gross is the saved order subtotal; commission is the saved platform fee; net is the saved cook-earning snapshot.</p></div>
            <p className="text-xs text-gray-500">Payout settlement is not tracked.</p>
          </div>
          <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4">
            <form onSubmit={submitSearch} className="relative flex gap-2 sm:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input aria-label="Search order reference" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search order reference" className="min-w-0 flex-1 rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" /><button type="submit" className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">Search</button></form>
            <select aria-label="Filter by delivery period" value={filters.period} onChange={(event) => updateFilter("period", event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"><option value="ALL">All periods</option><option value="THIS_MONTH">This month</option><option value="LAST_MONTH">Previous month</option></select>
            <select aria-label="Filter by order status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"><option value="">All order statuses</option>{["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
            <select aria-label="Filter by payment status" value={filters.paymentStatus} onChange={(event) => updateFilter("paymentStatus", event.target.value)} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm"><option value="">All payment statuses</option>{["PENDING", "PAID", "FAILED", "REFUNDED"].map((status) => <option key={status} value={status}>{label(status)}</option>)}</select>
          </div>

          {loading ? <div role="status" className="py-10 text-center text-sm text-gray-600">Updating earnings history…</div> : data.orders?.length ? <>
            <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-3 pr-4">Order / date</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Payment</th><th className="py-3 pr-4 text-right">Gross</th><th className="py-3 pr-4 text-right">Commission</th><th className="py-3 text-right">Net earnings</th></tr></thead><tbody className="divide-y divide-gray-100">{data.orders.map((order) => <tr key={order.id}>
              <td className="py-4 pr-4"><p className="font-bold text-[#2B1B12]">{order.orderNumber}</p><p className="mt-1 text-xs text-gray-500">{order.deliveredAt ? `Delivered ${new Date(order.deliveredAt).toLocaleDateString()}` : `Placed ${new Date(order.placedAt).toLocaleDateString()}`}</p></td>
              <td className="py-4 pr-4"><p className="font-semibold">{label(order.status)}</p><p className="mt-1 text-xs text-gray-500">{label(order.earningStatus)}</p></td>
              <td className="py-4 pr-4">{label(order.paymentMethod || "Unknown")} · {label(order.paymentStatus)}</td>
              <td className="py-4 pr-4 text-right">{formatMoney(order.grossAmount)}</td><td className="py-4 pr-4 text-right">{formatMoney(order.platformCommission)}</td><td className="py-4 text-right font-extrabold text-[#2B1B12]">{formatMoney(order.amount)}</td>
            </tr>)}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm"><p className="text-gray-600">{pagination.totalCount} orders · Page {pagination.page} of {Math.max(1, pagination.totalPages)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={!pagination.hasPreviousPage || loading} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 font-semibold disabled:opacity-50"><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => value + 1)} disabled={!pagination.hasNextPage || loading} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 font-semibold disabled:opacity-50">Next<ChevronRight className="h-4 w-4" /></button></div></div>
          </> : <div className="py-12 text-center"><Wallet className="mx-auto h-9 w-9 text-orange-300" /><p className="mt-3 font-bold text-[#2B1B12]">No matching order earnings</p><p className="mt-1 text-sm text-gray-600">Try changing the filters. Eligible earnings appear after delivery and payment.</p></div>}
        </div>
        <p className="text-xs leading-5 text-gray-500">{data.note} Monthly attribution uses delivery date; the current schema does not store a separate customer-payment timestamp, so delayed COD collection cannot be assigned to its exact collection month.</p>
      </>}
    </section>
  );
};

export default CookEarningsPage;
