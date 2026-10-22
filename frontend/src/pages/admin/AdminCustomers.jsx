import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Users, Search, Eye, RefreshCw, Ban, ShoppingBag, MapPin, X, Phone,
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, UserRound,
} from "lucide-react";

const statusClasses = (status) => ({
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUSPENDED: "border-amber-200 bg-amber-50 text-amber-800",
  DEACTIVATED: "border-red-200 bg-red-50 text-red-800",
  PENDING: "border-gray-200 bg-gray-50 text-gray-700",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const formatDate = (value, options = { day: "2-digit", month: "short", year: "numeric" }) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", options);
};

const initialsFor = (name) => (name || "Customer").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const statusOptions = [
  { label: "All", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Deactivated", value: "DEACTIVATED" },
  { label: "Pending", value: "PENDING" },
];

const CustomerSkeleton = () => <div className="flex min-h-[68px] items-center gap-3 px-4 py-3"><div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-100" /><div className="min-w-0 flex-1"><div className="h-4 w-40 max-w-full animate-pulse rounded bg-gray-100" /><div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-gray-100" /></div><div className="h-6 w-16 animate-pulse rounded-full bg-gray-100" /></div>;

export const AdminCustomers = () => {
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState({ key: "createdAt", direction: "desc" });
  const [page, setPage] = useState(1);
  const pageLimit = 10;
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", action: null, loading: false });

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

  const fetchCustomers = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const response = await adminApi.getAllCustomers({
        search: debouncedSearch,
        status: statusFilter || undefined,
        page,
        limit: pageLimit,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setCustomers(response.data.customers || []);
      setPagination(response.data.pagination || null);
      setError(null);
    } catch (requestError) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(requestError.message || "Failed to load customers list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [debouncedSearch, statusFilter, page]);

  const refreshCustomers = () => {
    setLoading(true);
    setError(null);
    void fetchCustomers();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchCustomers(); }, 0);
    const refetchOnFocus = () => { void fetchCustomers(); };
    window.addEventListener("focus", refetchOnFocus);
    return () => {
      window.clearTimeout(initialRequest);
      window.removeEventListener("focus", refetchOnFocus);
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchCustomers]);

  const openCustomerDetail = async (id) => {
    try {
      const response = await adminApi.getCustomerById(id);
      setSelectedCustomer(response.data);
    } catch (requestError) {
      alert("Failed to load customer details: " + requestError.message);
    }
  };

  const handleToggleStatus = (customerId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Customer Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this customer's account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((current) => ({ ...current, loading: true }));
        try {
          await adminApi.updateCustomerAccountStatus(customerId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedCustomer?.id === customerId) void openCustomerDetail(customerId);
          refreshCustomers();
        } catch (requestError) {
          alert("Error updating status: " + requestError.message);
          setConfirmModal((current) => ({ ...current, loading: false }));
        }
      },
    });
  };

  const fullResultLoaded = pagination?.pages === 1;
  const countsByStatus = customers.reduce((counts, customer) => {
    counts[customer.status] = (counts[customer.status] || 0) + 1;
    return counts;
  }, {});
  const joinedThisMonth = customers.filter((customer) => {
    const date = new Date(customer.createdAt);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;
  const totalCustomers = pagination?.total ?? customers.length;
  const summaryCards = [
    { label: "Total customers", value: totalCustomers, caption: "Registered users", icon: Users, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Active", value: fullResultLoaded ? (countsByStatus.ACTIVE || 0) : "—", caption: fullResultLoaded ? "Active accounts" : "Count unavailable across pages", icon: UserRound, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Suspended or blocked", value: fullResultLoaded ? (countsByStatus.SUSPENDED || 0) + (countsByStatus.DEACTIVATED || 0) : "—", caption: fullResultLoaded ? "Need attention" : "Count unavailable across pages", icon: Ban, tint: fullResultLoaded && ((countsByStatus.SUSPENDED || 0) + (countsByStatus.DEACTIVATED || 0) > 0) ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600" },
    { label: "New this month", value: fullResultLoaded ? joinedThisMonth : "—", caption: `Joined in ${new Date().toLocaleDateString("en-GB", { month: "long" })}`, icon: Users, tint: "bg-orange-50 text-[#D2552B]" },
  ];

  const sortedCustomers = useMemo(() => [...customers].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "name") comparison = (left.name || "").localeCompare(right.name || "");
    if (sort.key === "orders") comparison = (left._count?.orders || 0) - (right._count?.orders || 0);
    if (sort.key === "createdAt") comparison = new Date(left.createdAt) - new Date(right.createdAt);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [customers, sort]);
  const pageCount = Math.max(1, pagination?.pages || 1);
  const currentPage = Math.min(page, pageCount);
  const visibleCustomers = sortedCustomers;
  const rangeStart = sortedCustomers.length ? (currentPage - 1) * (pagination?.limit || pageLimit) + 1 : 0;
  const rangeEnd = Math.min(currentPage * (pagination?.limit || pageLimit), pagination?.total ?? sortedCustomers.length);
  const filtersActive = Boolean(search || statusFilter);
  const clearFilters = () => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setStatusFilter(""); setPage(1); };

  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const sortHeader = (label, key, align = "left") => <th scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-gray-50 px-4 py-3 ${align === "right" ? "text-right" : "text-left"} text-xs font-semibold text-gray-600`}><button type="button" onClick={() => toggleSort(key)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${align === "right" ? "justify-end" : "text-left"}`}>{label}{sort.key === key && (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button></th>;

  const statusBadge = (status) => <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status || "Unknown"}</span>;
  const customerName = (customer) => customer.name || "Unnamed customer";
  const customerEmail = (customer) => customer.email || "No email";

  return <div className="mx-auto max-w-7xl space-y-6 pb-12 pt-2 sm:pt-0 lg:-mt-2">
    <section aria-label="Customer summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
    </section>

    <section aria-label="Customer filters" className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input type="search" aria-label="Search customers by name, email or phone" placeholder="Search by name, email or phone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
            {search && <button type="button" onClick={() => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
          </form>
          <p className="whitespace-nowrap text-sm text-gray-500">Showing {customers.length ? rangeStart : 0}–{rangeEnd} of {pagination?.total ?? customers.length} customers</p>
        </div>
        <div role="group" aria-label="Filter customers by status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {statusOptions.map((option) => <button key={option.value || "ALL"} type="button" aria-pressed={statusFilter === option.value} onClick={() => { setLoading(true); setError(null); setStatusFilter(option.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === option.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{option.label}{fullResultLoaded && statusFilter === "" && <span className={`text-xs ${statusFilter === option.value ? "text-white/80" : "text-gray-400"}`}>{option.value ? countsByStatus[option.value] || 0 : totalCustomers}</span>}</button>)}
        </div>
      </div>

      {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshCustomers} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><RefreshCw className="h-4 w-4" />Try again</button></section> : loading ? <section aria-label="Loading customers" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{Array.from({ length: 6 }, (_, index) => <CustomerSkeleton key={index} />)}</section> : customers.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Users className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No customers found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Clear filters</button>}</section> : <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Customers">
        <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left"><thead className="border-b border-gray-200"><tr>{sortHeader("Customer", "name")}<th scope="col" className="hidden w-44 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">Phone</th><th scope="col" className="w-36 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Status</th>{sortHeader("Total orders", "orders", "right")}<th scope="col" className="hidden w-36 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 xl:table-cell">Joined</th><th scope="col" className="w-28 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{visibleCustomers.map((customer) => <tr key={customer.id} tabIndex={0} onClick={() => openCustomerDetail(customer.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openCustomerDetail(customer.id); } }} className="min-h-[68px] cursor-pointer transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B]">
            <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#9C3E20]">{initialsFor(customer.name)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={customerName(customer)}>{customerName(customer)}</p><p className="truncate text-sm text-gray-500" title={customerEmail(customer)}>{customerEmail(customer)}</p><p className="truncate text-sm text-gray-500 lg:hidden">{customer.phone || "Not added"}</p></div></div></td>
            <td className="hidden px-4 py-3 lg:table-cell"><a href={customer.phone ? `tel:${customer.phone}` : undefined} onClick={(event) => event.stopPropagation()} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${customer.phone ? "text-gray-700 hover:text-[#D2552B]" : "text-gray-400"}`}><Phone className="h-3.5 w-3.5" />{customer.phone || "Not added"}</a></td>
            <td className="px-4 py-3">{<span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(customer.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{customer.status || "Unknown"}</span>}</td>
            <td className="px-4 py-3 text-right text-sm font-medium text-gray-600">{customer._count?.orders ? customer._count.orders : <span className="text-gray-400">—</span>}</td>
            <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 xl:table-cell">{formatDate(customer.createdAt)}</td>
            <td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openCustomerDetail(customer.id); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />View</button></td>
          </tr>)}</tbody>
        </table></div>

        <div className="divide-y divide-gray-100 md:hidden">{visibleCustomers.map((customer) => <article key={customer.id} aria-label={`Open ${customerName(customer)} details`} tabIndex={0} onClick={() => openCustomerDetail(customer.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openCustomerDetail(customer.id); } }} className="cursor-pointer space-y-3 p-4 transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B]">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-[#9C3E20]">{initialsFor(customer.name)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]">{customerName(customer)}</p><p className="truncate text-sm text-gray-500" title={customerEmail(customer)}>{customerEmail(customer)}</p></div>{statusBadge(customer.status)}</div>
          <p className="flex items-center gap-2 truncate text-sm text-gray-600"><Phone className="h-4 w-4 shrink-0" />{customer.phone ? <a href={`tel:${customer.phone}`} onClick={(event) => event.stopPropagation()} className="truncate hover:text-[#D2552B]">{customer.phone}</a> : <span className="text-gray-400">Not added</span>}</p>
          <div className="flex items-center justify-between gap-3 text-sm"><span className="text-gray-600">Orders <strong className="ml-1 font-semibold text-[#2B1B12]">{customer._count?.orders || "—"}</strong></span><span className="text-gray-500">Joined {formatDate(customer.createdAt)}</span></div>
          <button type="button" onClick={(event) => { event.stopPropagation(); void openCustomerDetail(customer.id); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />View</button>
        </article>)}</div>

        <footer className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {rangeStart}–{rangeEnd} of {pagination?.total ?? customers.length} customers</p><nav aria-label="Customer list pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setLoading(true); setPage(pageNumber); }} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>
      </section>}
    </section>

    {selectedCustomer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCustomer(null); }}><section className="max-h-[90vh] w-full max-w-xl space-y-6 overflow-y-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="customer-detail-heading"><header className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4"><div className="min-w-0"><h2 id="customer-detail-heading" className="truncate text-xl font-bold text-gray-900">{selectedCustomer.name}</h2><p className="truncate text-sm text-gray-500">{selectedCustomer.email}</p></div><button type="button" onClick={() => setSelectedCustomer(null)} aria-label="Close customer details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-5 w-5" /></button></header>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2"><div><span className="block text-xs font-medium text-gray-500">Phone number</span><span className="mt-1 block font-semibold text-gray-900">{selectedCustomer.phone || "Not added"}</span></div><div><span className="block text-xs font-medium text-gray-500">Account status</span><span className="mt-1 block">{statusBadge(selectedCustomer.status)}</span></div><div><span className="block text-xs font-medium text-gray-500">Account created</span><span className="mt-1 block font-semibold text-gray-900">{formatDate(selectedCustomer.createdAt, { day: "2-digit", month: "short", year: "numeric" })}</span></div><div><span className="block text-xs font-medium text-gray-500">Role</span><span className="mt-1 block font-semibold text-gray-900">{selectedCustomer.role}</span></div></div>
      <div className="space-y-3 border-t border-gray-100 pt-4"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><MapPin className="h-4 w-4 text-[#D2552B]" />Saved delivery addresses</h3>{selectedCustomer.addresses?.length === 0 ? <p className="text-sm text-gray-500">No saved addresses found.</p> : <div className="space-y-2">{selectedCustomer.addresses?.map((address) => <div key={address.id} className="rounded-xl bg-gray-50 p-3 text-sm"><span className="block font-semibold text-gray-900">{address.label || "Address"}</span><span className="mt-1 block text-gray-600">{address.addressLine1}, {address.city}, {address.state} - {address.pincode}</span></div>)}</div>}</div>
      <div className="space-y-3 border-t border-gray-100 pt-4"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><ShoppingBag className="h-4 w-4 text-[#D2552B]" />Order history ({selectedCustomer.orders?.length})</h3>{selectedCustomer.orders?.length === 0 ? <p className="text-sm text-gray-500">No orders placed yet.</p> : <div className="space-y-2">{selectedCustomer.orders?.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3 text-sm"><div className="min-w-0"><span className="block truncate font-semibold text-gray-900">{order.orderNumber}</span><span className="mt-1 block truncate text-sm text-gray-500">Cook: {order.cook?.businessName}</span></div><div className="shrink-0 text-right"><span className="block font-bold text-gray-900">₹{order.totalAmount}</span><span className="text-xs font-semibold text-amber-700">{order.status}</span></div></div>)}</div>}</div>
      <div className="flex justify-end border-t border-gray-100 pt-4"><button type="button" onClick={() => handleToggleStatus(selectedCustomer.id, selectedCustomer.status)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Ban className="h-4 w-4 text-red-400" />{selectedCustomer.status === "SUSPENDED" ? "Reactivate Account" : "Suspend Account"}</button></div>
      </section></div>}

    <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} confirmVariant={confirmModal.confirmVariant || "danger"} loading={confirmModal.loading} onConfirm={() => confirmModal.action && confirmModal.action()} onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })} />
  </div>;
};

export default AdminCustomers;
