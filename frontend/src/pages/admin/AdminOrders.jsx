import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  ShoppingBag,
  Search,
  Eye,
  Loader2,
  CheckCircle,
  MapPin,
  X,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  DollarSign,
} from "lucide-react";

const orderStatuses = [
  { label: "All", value: "" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Preparing", value: "PREPARING" },
  { label: "Out for delivery", value: "OUT_FOR_DELIVERY" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
  { label: "Pending", value: "PENDING" },
  { label: "Ready for pickup", value: "READY_FOR_PICKUP" },
];

const statusClasses = (status) => ({
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  CONFIRMED: "border-amber-200 bg-amber-50 text-amber-800",
  PREPARING: "border-orange-200 bg-orange-50 text-orange-800",
  READY_FOR_PICKUP: "border-indigo-200 bg-indigo-50 text-indigo-800",
  OUT_FOR_DELIVERY: "border-blue-200 bg-blue-50 text-blue-800",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CANCELLED: "border-red-200 bg-red-50 text-red-800",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const paymentClasses = (status) => ({
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  FAILED: "border-red-200 bg-red-50 text-red-800",
  REFUNDED: "border-gray-200 bg-gray-100 text-gray-700",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const formatCurrency = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
};

const formatStatus = (value = "Unknown") => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatOrderDate = (value, options) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-GB", options);
};

const OrderSkeleton = () => <div className="flex min-h-[76px] items-center gap-3 px-4 py-3"><div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-gray-100" /><div className="min-w-0 flex-1"><div className="h-4 w-40 max-w-full animate-pulse rounded bg-gray-100" /><div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-gray-100" /></div><div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" /></div>;

const OrderThumbnail = ({ order }) => {
  const firstItem = order.items?.[0];
  const image = firstItem?.dishImage || firstItem?.dish?.image;
  const itemCount = order._count?.items ?? order.items?.length ?? 0;
  return <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-orange-50 text-[#D2552B]">{image ? <img src={image} alt={firstItem?.name || "Ordered dish"} loading="lazy" width="56" height="56" className="h-full w-full object-cover" /> : <ShoppingBag className="h-5 w-5" />}{itemCount > 1 && <span className="absolute right-0 top-0 rounded-full bg-[#2B1B12] px-1.5 py-0.5 text-xs font-bold text-white">+{itemCount - 1}</span>}</span>;
};

export const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "date", direction: "desc" });
  const pageLimit = 10;
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    action: null,
    loading: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = search.trim();
      if (nextSearch !== debouncedSearch) {
        setLoading(true);
        setError(null);
        setDebouncedSearch(nextSearch);
        setPage(1);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);

  const fetchOrders = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllOrders({
        search: debouncedSearch,
        status: statusFilter || undefined,
        page,
        limit: pageLimit,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setOrders(res.data.orders || []);
      setPagination(res.data.pagination || null);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load orders list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, page]);

  const refreshOrders = () => {
    setLoading(true);
    setError(null);
    void fetchOrders();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchOrders(); }, 0);
    const refetchWhenVisible = () => { if (document.visibilityState === "visible") void fetchOrders(); };
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchOrders();
    }, 30000);
    window.addEventListener("focus", refetchWhenVisible);
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(poll);
      window.removeEventListener("focus", refetchWhenVisible);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchOrders]);

  const openOrderDetail = async (orderId) => {
    try {
      const res = await adminApi.getOrderById(orderId);
      setSelectedOrder(res.data);
    } catch (err) {
      alert("Failed to load order details: " + err.message);
    }
  };

  const handleUpdateOrderStatus = (orderId, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `Update Order Status to ${newStatus}`,
      message: `Are you sure you want to manually set this order's status to ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateOrderStatus(orderId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedOrder && selectedOrder.id === orderId) {
            openOrderDetail(orderId);
          }
          refreshOrders();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const pageCount = Math.max(1, pagination?.pages || 1);
  const currentPage = Math.min(page, pageCount);
  const totalOrders = pagination?.total ?? orders.length;
  const fullResultLoaded = pagination?.pages === 1 || pagination?.total === 0;
  const countsByStatus = orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    return counts;
  }, {});
  const summaryCanCount = fullResultLoaded && !debouncedSearch && !statusFilter;
  const deliveredRevenue = summaryCanCount ? orders.filter((order) => order.status === "DELIVERED").reduce((total, order) => total + (Number(order.totalAmount) || 0), 0) : null;
  const summaryCards = [
    { label: "Total orders", value: totalOrders, caption: "All time", icon: ShoppingBag, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Active orders", value: summaryCanCount ? orders.filter((order) => ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(order.status)).length : "—", caption: summaryCanCount ? "In progress now" : "Count unavailable across pages", icon: Loader2, tint: "bg-orange-50 text-[#D2552B]", active: summaryCanCount && orders.some((order) => ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"].includes(order.status)) },
    { label: "Delivered", value: summaryCanCount ? countsByStatus.DELIVERED || 0 : "—", caption: summaryCanCount ? "Completed successfully" : "Count unavailable across pages", icon: CheckCircle, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Revenue", value: deliveredRevenue === null ? "—" : formatCurrency(deliveredRevenue), caption: summaryCanCount ? "From delivered orders" : "Count unavailable across pages", icon: DollarSign, tint: "bg-blue-50 text-blue-700" },
  ];
  const sortedOrders = useMemo(() => [...orders].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "amount") comparison = Number(left.totalAmount || 0) - Number(right.totalAmount || 0);
    if (sort.key === "date") comparison = new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [orders, sort]);
  const filtersActive = Boolean(search || statusFilter);
  const clearFilters = () => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setStatusFilter(""); setPage(1); };
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const sortHeader = (label, key, align = "left", responsiveClass = "") => <th scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 ${align === "right" ? "text-right" : "text-left"} ${responsiveClass}`}><button type="button" onClick={() => toggleSort(key)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{label}{sort.key === key && (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button></th>;
  const rangeStart = sortedOrders.length ? (currentPage - 1) * (pagination?.limit || pageLimit) + 1 : 0;
  const rangeEnd = Math.min(currentPage * (pagination?.limit || pageLimit), pagination?.total ?? sortedOrders.length);
  const firstItem = (order) => order.items?.[0];
  const itemsSummary = (order) => {
    const item = firstItem(order);
    if (!item) return `${order._count?.items ?? 0} items`;
    const extras = Math.max((order._count?.items ?? order.items?.length ?? 1) - 1, 0);
    return `${item.quantity ?? 1} × ${item.name || item.dish?.name || "Dish"}${extras ? ` +${extras} more` : ""}`;
  };
  const orderStatusBadge = (order) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(order.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{formatStatus(order.status)}</span>;
  const paymentBadge = (status) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${paymentClasses(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{formatStatus(status)}</span>;
  const concernBorder = (order) => order.status === "CANCELLED" ? "border-l-red-300" : order.paymentStatus === "PENDING" && order.status === "OUT_FOR_DELIVERY" ? "border-l-amber-300" : "border-l-transparent";

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
      <section aria-label="Order summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && orders.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-20 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-gray-600">{card.active && <span className="h-2 w-2 rounded-full bg-orange-500" aria-label="Active orders present" />}{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" /></span></div><p className={`mt-3 ${card.label === "Revenue" ? "text-2xl" : "text-[30px]"} font-bold leading-none text-[#2B1B12]`}>{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
      </section>

      <section aria-label="Order filters" className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Search by order number, customer or kitchen" placeholder="Search by order number, customer or kitchen" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
              {search && <button type="button" onClick={() => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
            </form>
            <p className="whitespace-nowrap text-sm text-gray-500">Showing {orders.length ? rangeStart : 0}–{rangeEnd} of {pagination?.total ?? orders.length} orders</p>
          </div>
          <div role="group" aria-label="Filter orders by status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{orderStatuses.map((status) => <button key={status.value || "ALL"} type="button" aria-pressed={statusFilter === status.value} onClick={() => { setLoading(true); setError(null); setStatusFilter(status.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === status.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{status.label}{summaryCanCount && <span className={`text-xs ${statusFilter === status.value ? "text-white/80" : "text-gray-400"}`}>{status.value ? countsByStatus[status.value] || 0 : totalOrders}</span>}{status.value && summaryCanCount && (countsByStatus[status.value] || 0) > 0 && <span className={`h-2 w-2 rounded-full ${statusFilter === status.value ? "bg-white" : "bg-orange-500"}`} aria-label={`${status.label} orders present`} />}</button>)}</div>
        </div>

        {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshOrders} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></section> : loading ? <section aria-label="Loading orders" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-gray-50" />)}</div>{Array.from({ length: 6 }, (_, index) => <OrderSkeleton key={index} />)}</section> : orders.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><ShoppingBag className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No orders found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button>}</section> : <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Orders">
          <div className="hidden overflow-x-auto sm:block"><table className="w-full table-fixed text-left"><thead className="border-b border-gray-200"><tr><th scope="col" className="w-[26%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Order</th><th scope="col" className="w-[19%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Customer / Kitchen</th>{sortHeader("Amount", "amount", "right", "w-[12%]")}<th scope="col" className="w-[15%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Status</th><th scope="col" className="hidden w-[13%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">Payment</th>{sortHeader("Date", "date", "left", "hidden w-[12%] xl:table-cell")}<th scope="col" className="w-24 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{sortedOrders.map((order) => <tr key={order.id} tabIndex={0} onClick={() => void openOrderDetail(order.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openOrderDetail(order.id); } }} className={`cursor-pointer border-l-[3px] transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${concernBorder(order)}`}>
              <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><OrderThumbnail order={order} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.orderNumber}>{order.orderNumber || order.id}</p><p className="truncate text-sm text-gray-500" title={itemsSummary(order)}>{itemsSummary(order)}</p><p className="truncate text-sm text-gray-500 xl:hidden">{formatOrderDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div></div></td>
              <td className="px-4 py-3"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.customer?.name}>{order.customer?.name || "Customer"}</p><p className="flex min-w-0 items-center gap-1 truncate text-sm text-gray-500" title={order.cook?.businessName}><ChefHat className="h-3.5 w-3.5 shrink-0" />{order.cook?.businessName || "Kitchen"}</p></td>
              <td className="px-4 py-3 text-right text-sm font-bold text-[#2B1B12] whitespace-nowrap">{formatCurrency(order.totalAmount)}</td>
              <td className="px-4 py-3">{orderStatusBadge(order)}<div className="mt-1 lg:hidden">{paymentBadge(order.paymentStatus)}</div></td>
              <td className="hidden px-4 py-3 lg:table-cell">{paymentBadge(order.paymentStatus)}{order.paymentMethod && <p className="mt-1 truncate text-sm text-gray-500">{order.paymentMethod === "COD" ? "Cash on delivery" : formatStatus(order.paymentMethod)}</p>}</td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-600 xl:table-cell"><span className="block">{formatOrderDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric" })}</span><span className="text-sm text-gray-500">{formatOrderDate(order.createdAt, { hour: "2-digit", minute: "2-digit" })}</span></td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openOrderDetail(order.id); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />Details</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="divide-y divide-gray-100 sm:hidden">{sortedOrders.map((order) => <article key={order.id} tabIndex={0} aria-label={`Open order ${order.orderNumber || order.id}`} onClick={() => void openOrderDetail(order.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openOrderDetail(order.id); } }} className={`space-y-3 border-l-[3px] p-4 transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${concernBorder(order)}`}>
            <div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><OrderThumbnail order={order} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.orderNumber}>{order.orderNumber || order.id}</p><p className="truncate text-sm text-gray-500">{formatOrderDate(order.createdAt, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></div></div>{orderStatusBadge(order)}</div>
            <div className="rounded-xl bg-gray-50 p-3"><p className="truncate text-sm font-semibold text-gray-800" title={itemsSummary(order)}>{itemsSummary(order)}</p><p className="mt-1 truncate text-sm text-gray-700" title={order.customer?.name}>{order.customer?.name || "Customer"}</p><p className="mt-1 flex items-center gap-1 truncate text-sm text-gray-500" title={order.cook?.businessName}><ChefHat className="h-3.5 w-3.5 shrink-0" />{order.cook?.businessName || "Kitchen"}</p></div>
            <div className="flex items-center justify-between gap-3"><span className="text-base font-bold text-[#2B1B12]">{formatCurrency(order.totalAmount)}</span>{paymentBadge(order.paymentStatus)}</div>{order.paymentMethod && <p className="-mt-2 text-sm text-gray-500">{order.paymentMethod === "COD" ? "Cash on delivery" : formatStatus(order.paymentMethod)}</p>}
            <button type="button" onClick={(event) => { event.stopPropagation(); void openOrderDetail(order.id); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />Details</button>
          </article>)}</div>
          <footer className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {rangeStart}–{rangeEnd} of {pagination?.total ?? orders.length} orders</p><nav aria-label="Order list pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setLoading(true); setPage(pageNumber); }} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>
        </section>}
      </section>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Order #{selectedOrder.orderNumber}</h3>
                <p className="text-xs text-gray-500">Placed on {new Date(selectedOrder.createdAt).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Participants */}
            <div className="grid grid-cols-3 gap-4 text-xs bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div>
                <span className="text-gray-500 block font-medium">Customer</span>
                <span className="font-bold text-gray-900">{selectedOrder.customer?.name}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.customer?.email}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Cook Kitchen</span>
                <span className="font-bold text-gray-900">{selectedOrder.cook?.businessName}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.cook?.user?.name}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Delivery Agent</span>
                <span className="font-bold text-gray-900">{selectedOrder.deliveryAgent?.user?.name || "Unassigned"}</span>
                <span className="text-[11px] text-gray-500 block">{selectedOrder.deliveryAgent?.user?.phone || ""}</span>
              </div>
            </div>

            {/* Address */}
            {selectedOrder.address && (
              <div className="text-xs space-y-1">
                <span className="font-bold text-gray-900 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-red-500" /> Delivery Address
                </span>
                <p className="text-gray-600 pl-5">
                  {selectedOrder.address.addressLine1}, {selectedOrder.address.city}, {selectedOrder.address.state} - {selectedOrder.address.pincode}
                </p>
              </div>
            )}

            {/* Order Items */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900">Ordered Items</h4>
              <div className="space-y-2">
                {selectedOrder.items?.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                    <span className="font-bold text-gray-900">
                      {item.name} x {item.quantity}
                    </span>
                    <span className="font-extrabold text-gray-900">₹{item.totalPrice}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 text-xs space-y-2">
              <div className="flex justify-between text-gray-600">
                <span>Items Subtotal</span>
                <span>₹{selectedOrder.subtotal}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Delivery Fee</span>
                <span>₹{selectedOrder.deliveryFee}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Platform Commission Fee</span>
                <span>₹{selectedOrder.platformFee}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-gray-900 border-t border-gray-200 pt-2">
                <span>Total Amount Paid</span>
                <span className="text-red-600">₹{selectedOrder.totalAmount}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-500 pt-1">
                <span>Cook Payout: ₹{selectedOrder.cookEarning}</span>
                <span>Courier Payout: ₹{selectedOrder.deliveryEarning}</span>
              </div>
            </div>

            {/* Lifecycle Status Action */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <span className="text-xs font-semibold text-gray-500 mr-auto">Change Status:</span>
              {selectedOrder.status === "PENDING" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "CONFIRMED")} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Confirm</button>}
              {selectedOrder.status === "CONFIRMED" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "PREPARING")} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">Start Preparing</button>}
              {selectedOrder.status === "PREPARING" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "READY_FOR_PICKUP")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700">Ready for Pickup</button>}
              {selectedOrder.status === "READY_FOR_PICKUP" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "OUT_FOR_DELIVERY")} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700">Out for Delivery</button>}
              {selectedOrder.status === "OUT_FOR_DELIVERY" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "DELIVERED")} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700">Mark Delivered</button>}
              {["PENDING", "CONFIRMED", "PREPARING"].includes(selectedOrder.status) && selectedOrder.paymentStatus !== "PAID" && <button onClick={() => handleUpdateOrderStatus(selectedOrder.id, "CANCELLED")} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Cancel Order</button>}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </main>
  );
};

export default AdminOrders;
