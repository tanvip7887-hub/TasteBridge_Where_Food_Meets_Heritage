import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Search,
  Utensils,
  Wallet,
  X,
  ChefHat,
  Truck,
  CheckCircle,
} from "lucide-react";

const PAGE_SIZE = 10;
const paymentStatuses = [
  { label: "All", value: "" },
  { label: "Paid", value: "PAID" },
  { label: "Pending", value: "PENDING" },
  { label: "Failed", value: "FAILED" },
  { label: "Refunded", value: "REFUNDED" },
];

const formatCurrency = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
};

const formatDate = (value, options) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB", options);
};

const formatStatus = (value = "Unknown") => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const statusStyles = {
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  REFUNDED: "border-gray-200 bg-gray-100 text-gray-700",
};

const StatusBadge = ({ status }) => <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status] || "border-gray-200 bg-gray-50 text-gray-700"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{formatStatus(status)}</span>;

const OrderThumbnail = ({ order }) => {
  const item = order.items?.[0];
  const image = item?.dishImage || item?.dish?.image;
  return <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-orange-50 text-[#D2552B]">
    {image ? <img src={image} alt={item?.name || "Ordered dish"} loading="lazy" width="48" height="48" className="h-full w-full object-cover" /> : <Utensils className="h-5 w-5" aria-hidden="true" />}
  </span>;
};

const OrderSkeleton = () => <div className="flex min-h-[72px] items-center gap-3 px-4 py-3"><div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-gray-100" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-40 max-w-full animate-pulse rounded bg-gray-100" /><div className="h-3 w-56 max-w-full animate-pulse rounded bg-gray-100" /></div><div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" /></div>;

export const AdminPayments = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const requestRef = useRef(0);

  const fetchPayments = useCallback(async (showLoading = false) => {
    const requestId = ++requestRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getPaymentStats();
      if (requestId === requestRef.current) setData(response.data);
    } catch (err) {
      if (requestId === requestRef.current) setError(err.message || "Failed to load payment statistics.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPayments(true);
    const onFocus = () => { if (document.visibilityState === "visible") void fetchPayments(); };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void fetchPayments(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      requestRef.current += 1;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchPayments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim();
      if (next !== debouncedSearch) {
        setDebouncedSearch(next);
        setPage(1);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const orders = data?.orders || [];
  const summary = data?.summary || {};
  const filteredOrders = useMemo(() => orders.filter((order) => {
    if (paymentFilter && order.paymentStatus !== paymentFilter) return false;
    if (!debouncedSearch) return true;
    const query = debouncedSearch.toLowerCase();
    return [order.orderNumber, order.customer?.name, order.cook?.businessName]
      .some((value) => String(value || "").toLowerCase().includes(query));
  }), [orders, paymentFilter, debouncedSearch]);

  const sortedOrders = useMemo(() => [...filteredOrders].sort((left, right) => {
    let difference = 0;
    if (sort.key === "amount") difference = Number(left.totalAmount || 0) - Number(right.totalAmount || 0);
    if (sort.key === "date") difference = new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    return sort.direction === "asc" ? difference : -difference;
  }), [filteredOrders, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleOrders = sortedOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paidCount = summary.paidOrdersCount ?? orders.filter((order) => order.paymentStatus === "PAID").length;
  const statusCounts = orders.reduce((counts, order) => {
    counts[order.paymentStatus] = (counts[order.paymentStatus] || 0) + 1;
    return counts;
  }, {});
  const summaryCards = [
    { label: "Platform revenue", value: summary.totalPlatformRevenue, caption: "10% platform fee + delivery base", icon: DollarSign, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Cook payout pool", value: summary.totalCookEarnings, caption: "Net food revenue for home cooks", icon: ChefHat, tint: "bg-amber-50 text-amber-700" },
    { label: "Courier payout pool", value: summary.totalDeliveryEarnings, caption: "Delivery fees for agents", icon: Truck, tint: "bg-blue-50 text-blue-700" },
    { label: "Gross order volume", value: summary.totalGrossVolume, caption: `${paidCount} paid transactions`, icon: CheckCircle, tint: "bg-emerald-50 text-emerald-700" },
  ];

  const gross = Number(summary.totalGrossVolume);
  const cookShare = Number(summary.totalCookEarnings);
  const deliveryShare = Number(summary.totalDeliveryEarnings);
  const platformShare = gross - cookShare - deliveryShare;
  const splitTotal = cookShare + deliveryShare + platformShare;
  const canShowSplitBar = Number.isFinite(gross) && gross > 0 && splitTotal > 0;
  const splitSegments = [
    { name: "Cook share", value: cookShare, color: "bg-amber-500", text: "text-amber-700" },
    { name: "Delivery share", value: deliveryShare, color: "bg-blue-500", text: "text-blue-700" },
    { name: "Platform fee", value: platformShare, color: "bg-orange-500", text: "text-[#D2552B]" },
  ];

  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const sortHeader = (label, key, align = "left", classes = "") => <th scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 ${align === "right" ? "text-right" : "text-left"} ${classes}`}><button type="button" onClick={() => toggleSort(key)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md transition hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{label}{sort.key === key && (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button></th>;
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setPaymentFilter(""); setPage(1); };
  const filtersActive = Boolean(search || paymentFilter);
  const visibleTotals = visibleOrders.reduce((totals, order) => ({
    paid: totals.paid + (Number(order.totalAmount) || 0),
    cook: totals.cook + (Number(order.cookEarning) || 0),
    delivery: totals.delivery + (Number(order.deliveryEarning) || 0),
    platform: totals.platform + (Number(order.platformFee) || 0),
  }), { paid: 0, cook: 0, delivery: 0, platform: 0 });
  const firstRow = sortedOrders.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const lastRow = Math.min(currentPage * PAGE_SIZE, sortedOrders.length);

  return <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
    <section aria-label="Payment summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && !data ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-24 rounded bg-gray-100" /><div className="mt-3 h-3 w-40 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-[28px] font-bold leading-tight text-[#2B1B12]">{formatCurrency(card.value)}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
    </section>

    {loading && !data ? <section aria-label="Loading revenue split" className="h-20 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-3 w-full rounded-full bg-gray-100" /><div className="mt-3 h-3 w-2/3 rounded bg-gray-100" /></section> : canShowSplitBar && <section aria-label="Gross volume split" className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm"><div className="flex h-3 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={splitSegments.map((segment) => `${segment.name} ${((segment.value / splitTotal) * 100).toFixed(1)} percent`).join(", ")}>{splitSegments.map((segment) => <span key={segment.name} className={`${segment.color} h-full`} style={{ width: `${(segment.value / splitTotal) * 100}%` }} />)}</div><ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">{splitSegments.map((segment) => <li key={segment.name} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${segment.color}`} aria-hidden="true" />{segment.name}<span className="font-semibold text-gray-800">{splitTotal ? `${((segment.value / splitTotal) * 100).toFixed(1)}%` : "—"}</span></li>)}</ul></section>}

    <section aria-label="Payment filters" className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input type="search" aria-label="Search by order number, customer or kitchen" placeholder="Search by order number, customer or kitchen" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
            {search && <button type="button" onClick={() => { setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
          </form>
          <p className="whitespace-nowrap text-sm text-gray-500">Showing last {orders.length} orders</p>
        </div>
        <div role="group" aria-label="Filter by payment status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{paymentStatuses.map((status) => <button key={status.value || "ALL"} type="button" aria-pressed={paymentFilter === status.value} onClick={() => { setPaymentFilter(status.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${paymentFilter === status.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{status.label}<span className={`text-xs ${paymentFilter === status.value ? "text-white/80" : "text-gray-400"}`}>{status.value ? statusCounts[status.value] || 0 : orders.length}</span></button>)}</div>
      </div>

      {error ? <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={() => void fetchPayments(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></section> : loading && !data ? <section aria-label="Loading transactions" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="p-5"><div className="h-5 w-48 animate-pulse rounded bg-gray-100" /></div>{Array.from({ length: 6 }, (_, index) => <OrderSkeleton key={index} />)}</section> : sortedOrders.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Wallet className="h-6 w-6" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No transactions found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button>}</section> : <section aria-label="Recent transactions" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex min-h-14 items-center border-b border-gray-100 px-4 sm:px-5"><h2 className="text-lg font-semibold text-[#2B1B12]">Recent transactions</h2></div>
        <div className="hidden overflow-x-auto sm:block"><table className="w-full table-fixed text-left"><thead className="sticky top-0 z-10 border-b border-gray-200"><tr><th scope="col" className="w-[29%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Order</th>{sortHeader("Total paid", "amount", "right", "w-[13%]")}<th scope="col" className="w-[28%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Split breakdown</th><th scope="col" className="w-[14%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Status</th>{sortHeader("Date", "date", "left", "hidden w-[16%] lg:table-cell")}</tr></thead>
          <tbody className="divide-y divide-gray-100">{loading ? Array.from({ length: 6 }, (_, index) => <tr key={index}><td colSpan={5}><OrderSkeleton /></td></tr>) : visibleOrders.map((order) => {
            const orderPlatform = Number(order.platformFee) || 0;
            const orderCook = Number(order.cookEarning) || 0;
            const orderDelivery = Number(order.deliveryEarning) || 0;
            const orderSplit = orderCook + orderDelivery + orderPlatform;
            const item = order.items?.[0];
            return <tr key={order.id} className={`border-l-[3px] transition-colors hover:bg-orange-50/50 ${order.paymentStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
              <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><OrderThumbnail order={order} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.orderNumber || order.id}>{order.orderNumber || order.id}</p><p className="truncate text-sm text-gray-500" title={`${order.customer?.name || "Customer"} · ${order.cook?.businessName || "Kitchen"}`}>{order.customer?.name || "Customer"} · {order.cook?.businessName || "Kitchen"}</p><p className="truncate text-sm text-gray-500 lg:hidden">{formatDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p><span className="sr-only">{item?.name || ""}</span></div></div></td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-[#2B1B12]">{formatCurrency(order.totalAmount)}</td>
              <td className="px-4 py-3" title={`Cook ${formatCurrency(orderCook)} · Delivery ${formatCurrency(orderDelivery)} · Platform ${formatCurrency(orderPlatform)}`}><div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3"><span className="whitespace-nowrap"><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />Cook {formatCurrency(orderCook)}</span><span className="whitespace-nowrap"><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-500" />Delivery {formatCurrency(orderDelivery)}</span><span className="whitespace-nowrap"><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-orange-500" />Platform {formatCurrency(orderPlatform)}</span></div><div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">{orderSplit > 0 && <><span className="bg-amber-500" style={{ width: `${(orderCook / orderSplit) * 100}%` }} /><span className="bg-blue-500" style={{ width: `${(orderDelivery / orderSplit) * 100}%` }} /><span className="bg-orange-500" style={{ width: `${(orderPlatform / orderSplit) * 100}%` }} /></>}</div></td>
              <td className="px-4 py-3"><StatusBadge status={order.paymentStatus} /><p className="mt-1 truncate text-sm text-gray-500">{order.paymentMethod ? (order.paymentMethod === "COD" ? "Cash on delivery" : formatStatus(order.paymentMethod)) : ""}</p></td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-600 lg:table-cell"><span className="block">{formatDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric" })}</span><span className="text-sm text-gray-500">{formatDate(order.createdAt, { hour: "2-digit", minute: "2-digit" })}</span></td>
            </tr>;
          })}</tbody>
          {!loading && <tfoot className="border-t border-gray-200 bg-gray-50/70"><tr><th scope="row" className="px-4 py-3 text-sm font-semibold text-gray-700">Visible rows total</th><td className="whitespace-nowrap px-4 py-3 text-right text-sm font-bold text-[#2B1B12]">{formatCurrency(visibleTotals.paid)}</td><td colSpan={3} className="px-4 py-3"><div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold"><span className="text-amber-700">Cook {formatCurrency(visibleTotals.cook)}</span><span className="text-blue-700">Delivery {formatCurrency(visibleTotals.delivery)}</span><span className="text-[#D2552B]">Platform {formatCurrency(visibleTotals.platform)}</span></div></td></tr></tfoot>}
        </table></div>

        <div className="divide-y divide-gray-100 sm:hidden">{loading ? Array.from({ length: 6 }, (_, index) => <OrderSkeleton key={index} />) : visibleOrders.map((order) => {
          const item = order.items?.[0];
          return <article key={order.id} className={`space-y-3 border-l-[3px] p-4 ${order.paymentStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
            <div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.orderNumber || order.id}>{order.orderNumber || order.id}</p><p className="truncate text-sm text-gray-500">{formatDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div><div className="flex shrink-0 flex-col items-end gap-1"><StatusBadge status={order.paymentStatus} />{order.paymentMethod && <span className="text-sm text-gray-500">{order.paymentMethod === "COD" ? "Cash on delivery" : formatStatus(order.paymentMethod)}</span>}</div></div>
            <div className="flex min-w-0 items-center gap-3 rounded-xl bg-gray-50 p-3"><OrderThumbnail order={order} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={item?.name}>{item?.name || "Ordered dish"}</p><p className="truncate text-sm text-gray-600" title={`${order.customer?.name || "Customer"} · ${order.cook?.businessName || "Kitchen"}`}>{order.customer?.name || "Customer"} · {order.cook?.businessName || "Kitchen"}</p></div></div>
            <div className="flex items-center justify-between gap-3"><span className="text-sm text-gray-500">Total paid</span><span className="whitespace-nowrap text-base font-bold text-[#2B1B12]">{formatCurrency(order.totalAmount)}</span></div>
            <div className="flex flex-wrap gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Cook {formatCurrency(order.cookEarning)}</span><span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">Delivery {formatCurrency(order.deliveryEarning)}</span><span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">Platform {formatCurrency(order.platformFee)}</span></div>
          </article>;
        })}</div>

        <footer className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {firstRow}–{lastRow} of {sortedOrders.length} transactions</p><nav aria-label="Payment transaction pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => setPage(pageNumber)} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>
      </section>}
    </section>
  </main>;
};

export default AdminPayments;
