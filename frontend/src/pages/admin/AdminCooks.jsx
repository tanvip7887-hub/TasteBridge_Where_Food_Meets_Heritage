import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import DocumentPreviewButton from "../../components/admin/DocumentPreviewButton.jsx";
import { getLatestFssaiDocument, getOtherVerificationDocuments } from "../../utils/adminCookDocuments.js";
import {
  ChefHat,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  Loader2,
  FileText,
  Ban,
  ShieldCheck,
  X,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Store,
} from "lucide-react";

const verificationOptions = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Needs revision", value: "NEEDS_REVISION" },
  { label: "Rejected", value: "REJECTED" },
];

const verificationClasses = (status) => ({
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  NEEDS_REVISION: "border-blue-200 bg-blue-50 text-blue-800",
  REJECTED: "border-red-200 bg-red-50 text-red-800",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const accountClasses = (status) => ({
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-800",
  SUSPENDED: "border-amber-200 bg-amber-50 text-amber-800",
  BLOCKED: "border-red-200 bg-red-50 text-red-800",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const CookSkeleton = () => <div className="flex min-h-[72px] items-center gap-3 px-4 py-3"><div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-gray-100" /><div className="min-w-0 flex-1"><div className="h-4 w-44 max-w-full animate-pulse rounded bg-gray-100" /><div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-gray-100" /></div><div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" /></div>;

export const AdminCooks = () => {
  const [cooks, setCooks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "kitchen", direction: "asc" });
  const pageLimit = 10;
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);

  // Detail Modal State
  const [selectedCook, setSelectedCook] = useState(null);
  const [fssaiDecision, setFssaiDecision] = useState({ action: null, reason: "", expiryDate: "", loading: false });

  // Confirmation Modal State
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

  const fetchCooks = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllCooks({
        search: debouncedSearch,
        verificationStatus: verificationFilter || undefined,
        page,
        limit: pageLimit,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setCooks(res.data.cooks || []);
      setPagination(res.data.pagination || null);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load cooks list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [debouncedSearch, verificationFilter, page]);

  const refreshCooks = () => {
    setLoading(true);
    setError(null);
    void fetchCooks();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchCooks(); }, 0);
    const refetchWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchCooks();
    };
    window.addEventListener("focus", refetchWhenVisible);
    document.addEventListener("visibilitychange", refetchWhenVisible);
    return () => {
      window.clearTimeout(initialRequest);
      window.removeEventListener("focus", refetchWhenVisible);
      document.removeEventListener("visibilitychange", refetchWhenVisible);
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchCooks]);

  const pageCount = Math.max(1, pagination?.pages || 1);
  const currentPage = Math.min(page, pageCount);
  const fullResultLoaded = pagination?.pages === 1;
  const countsByStatus = cooks.reduce((counts, cook) => {
    counts[cook.verificationStatus] = (counts[cook.verificationStatus] || 0) + 1;
    return counts;
  }, {});
  const cooksTotal = pagination?.total ?? cooks.length;
  const summaryCanCount = fullResultLoaded && !debouncedSearch && !verificationFilter;
  const summaryCards = [
    { label: "Total cooks", value: cooksTotal, caption: "Registered kitchens", icon: ChefHat, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Approved", value: summaryCanCount ? countsByStatus.APPROVED || 0 : "—", caption: summaryCanCount ? "Live on marketplace" : "Count unavailable across pages", icon: CheckCircle, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending verification", value: summaryCanCount ? countsByStatus.PENDING || 0 : "—", caption: summaryCanCount ? "Waiting for review" : "Count unavailable across pages", icon: AlertCircle, tint: summaryCanCount && (countsByStatus.PENDING || 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600", pending: summaryCanCount && (countsByStatus.PENDING || 0) > 0 },
    { label: "Active kitchens", value: summaryCanCount ? cooks.filter((cook) => cook.isOpen).length : "—", caption: summaryCanCount ? "Currently accepting orders" : "Count unavailable across pages", icon: Store, tint: "bg-blue-50 text-blue-700" },
  ];
  const sortedCooks = useMemo(() => [...cooks].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "kitchen") comparison = (left.businessName || "").localeCompare(right.businessName || "");
    if (sort.key === "dishes") comparison = (left._count?.dishes || 0) - (right._count?.dishes || 0);
    if (sort.key === "orders") comparison = (left._count?.orders || 0) - (right._count?.orders || 0);
    if (sort.key === "createdAt") comparison = new Date(left.createdAt || 0) - new Date(right.createdAt || 0);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [cooks, sort]);
  const filtersActive = Boolean(search || verificationFilter);
  const clearFilters = () => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setVerificationFilter(""); setPage(1); };
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const sortHeader = (label, key, align = "left") => <th scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}><button type="button" onClick={() => toggleSort(key)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${align === "right" ? "justify-end" : "text-left"}`}>{label}{sort.key === key && (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button></th>;
  const rangeStart = sortedCooks.length ? (currentPage - 1) * (pagination?.limit || pageLimit) + 1 : 0;
  const rangeEnd = Math.min(currentPage * (pagination?.limit || pageLimit), pagination?.total ?? sortedCooks.length);
  const cookName = (cook) => cook.businessName || "Unnamed kitchen";
  const verificationBadge = (cook) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${verificationClasses(cook.verificationStatus)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{(cook.verificationStatus || "UNKNOWN").replaceAll("_", " ")}</span>;
  const accountBadge = (status) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${accountClasses(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status || "Unknown"}</span>;

  const openCookDetail = async (cookId) => {
    try {
      const res = await adminApi.getCookById(cookId);
      setSelectedCook(res.data);
    } catch (err) {
      alert("Failed to load cook details: " + err.message);
    }
  };

  // Decision Modal State for verification (reasons & FSSAI approval)
  const [decisionModal, setDecisionModal] = useState({
    isOpen: false,
    cookId: null,
    cookName: "",
    status: null,
    reason: "",
    isApprovedToSell: false,
    loading: false,
  });

  const openDecisionModal = (cook, status) => {
    setDecisionModal({
      isOpen: true,
      cookId: cook.id,
      cookName: cook.businessName || cook.user?.name || "Cook",
      status,
      reason: "",
      isApprovedToSell: cook.isApprovedToSell === true,
      loading: false,
    });
  };

  const handleConfirmDecision = async (e) => {
    e.preventDefault();
    const { cookId, status, reason, isApprovedToSell } = decisionModal;
    if (!cookId || !status) return;

    if (status !== "APPROVED" && !reason.trim()) {
      return alert(`Please provide a reason when ${status === "REJECTED" ? "rejecting" : "requesting revisions for"} an application.`);
    }

    try {
      setDecisionModal((prev) => ({ ...prev, loading: true }));
      await adminApi.updateCookVerification(cookId, {
        verificationStatus: status,
        revisionReason: status === "NEEDS_REVISION" ? reason.trim() : undefined,
        rejectionReason: status === "REJECTED" ? reason.trim() : undefined,
        isApprovedToSell: status === "APPROVED" ? isApprovedToSell : false,
      });

      setDecisionModal({ isOpen: false, cookId: null, cookName: "", status: null, reason: "", isApprovedToSell: false, loading: false });
      if (selectedCook && selectedCook.id === cookId) {
        openCookDetail(cookId);
      }
      refreshCooks();
    } catch (err) {
      alert("Error updating verification: " + err.message);
      setDecisionModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const submitFssaiDecision = async (event) => {
    event.preventDefault();
    if (!selectedCook || !fssaiDecision.action) return;
    if (fssaiDecision.action !== "APPROVE" && !fssaiDecision.reason.trim()) return;
    const document = getLatestFssaiDocument(selectedCook.user?.verificationDocuments || []);
    try {
      setFssaiDecision((current) => ({ ...current, loading: true }));
      await adminApi.reviewCookFssai(selectedCook.id, {
        action: fssaiDecision.action,
        documentId: document?.id,
        rejectionReason: fssaiDecision.reason.trim() || undefined,
        fssaiExpiryDate: fssaiDecision.action === "APPROVE" ? fssaiDecision.expiryDate || undefined : undefined,
      });
      setFssaiDecision({ action: null, reason: "", expiryDate: "", loading: false });
      await openCookDetail(selectedCook.id);
    } catch (err) {
      alert("Could not save FSSAI review: " + (err.response?.data?.message || err.message));
      setFssaiDecision((current) => ({ ...current, loading: false }));
    }
  };

  const handleToggleAccountStatus = (cookId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Cook Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this cook account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateCookAccountStatus(cookId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedCook && selectedCook.id === cookId) {
            openCookDetail(cookId);
          }
          refreshCooks();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const verificationDocuments = selectedCook?.user?.verificationDocuments || [];
  const latestFssaiDocument = getLatestFssaiDocument(verificationDocuments);
  const otherVerificationDocuments = getOtherVerificationDocuments(verificationDocuments);
  const latestFssaiIsPending = latestFssaiDocument?.verificationStatus === "PENDING";

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
      <section aria-label="Cook summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && cooks.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-20 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-gray-600">{card.pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Pending applications" />}{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
      </section>

      <section aria-label="Cook filters" className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Search by kitchen, cook or email" placeholder="Search by kitchen, cook or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
              {search && <button type="button" onClick={() => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
            </form>
            <p className="whitespace-nowrap text-sm text-gray-500">Showing {cooks.length ? rangeStart : 0}–{rangeEnd} of {pagination?.total ?? cooks.length} cooks</p>
          </div>
          <div role="group" aria-label="Filter cooks by verification status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {verificationOptions.map((option) => <button key={option.value || "ALL"} type="button" aria-pressed={verificationFilter === option.value} onClick={() => { setLoading(true); setError(null); setVerificationFilter(option.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${verificationFilter === option.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{option.label}{summaryCanCount && <span className={`text-xs ${verificationFilter === option.value ? "text-white/80" : "text-gray-400"}`}>{option.value ? countsByStatus[option.value] || 0 : cooksTotal}</span>}{option.value === "PENDING" && summaryCanCount && (countsByStatus.PENDING || 0) > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Pending cooks need review" />}</button>)}
          </div>
        </div>

        {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshCooks} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></section> : loading ? <section aria-label="Loading cooks" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-gray-50" />)}</div>{Array.from({ length: 5 }, (_, index) => <CookSkeleton key={index} />)}</section> : cooks.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><ChefHat className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No cooks found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Clear filters</button>}</section> : <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Cooks">
          <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left"><thead className="border-b border-gray-200"><tr>{sortHeader("Kitchen", "kitchen")}<th scope="col" className="hidden w-[18%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">Specialization</th><th scope="col" className="w-[16%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Verification</th><th scope="col" className="hidden w-[14%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">Account</th>{sortHeader("Dishes", "dishes", "right")}{sortHeader("Orders", "orders", "right")}<th scope="col" className="w-28 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{sortedCooks.map((cook) => <tr key={cook.id} tabIndex={0} onClick={() => void openCookDetail(cook.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openCookDetail(cook.id); } }} className={`cursor-pointer border-l-[3px] transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${cook.verificationStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
              <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-orange-50 text-sm font-bold text-[#9C3E20]">{cook.profileImage ? <img src={cook.profileImage} alt={`${cookName(cook)} kitchen`} loading="lazy" className="h-full w-full object-cover" /> : cookName(cook).slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={cookName(cook)}>{cookName(cook)}</p><p className="truncate text-sm text-gray-500" title={`${cook.user?.name || "Cook"} · ${cook.user?.email || "No email"}`}>{cook.user?.name || "Cook"} · {cook.user?.email || "No email"}</p><p className="truncate text-sm text-gray-500 lg:hidden" title={cook.specialization || "Not added"}>{cook.specialization || "Not added"}</p></div></div></td>
              <td className="hidden px-4 py-3 text-sm text-gray-600 lg:table-cell"><span className="line-clamp-2" title={cook.specialization || "Not added"}>{cook.specialization || "Not added"}</span></td>
              <td className="px-4 py-3">{verificationBadge(cook)}</td><td className="hidden px-4 py-3 lg:table-cell">{accountBadge(cook.user?.status)}</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-gray-700">{cook._count?.dishes ?? "—"}</td><td className="px-4 py-3 text-right text-sm font-medium text-gray-700">{cook._count?.orders ?? "—"}</td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openCookDetail(cook.id); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />Details</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="divide-y divide-gray-100 md:hidden">{sortedCooks.map((cook) => <article key={cook.id} tabIndex={0} aria-label={`Open ${cookName(cook)} details`} onClick={() => void openCookDetail(cook.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openCookDetail(cook.id); } }} className={`cursor-pointer space-y-3 border-l-[3px] p-4 transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${cook.verificationStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
            <div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-orange-50 text-sm font-bold text-[#9C3E20]">{cook.profileImage ? <img src={cook.profileImage} alt={`${cookName(cook)} kitchen`} loading="lazy" className="h-full w-full object-cover" /> : cookName(cook).slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]">{cookName(cook)}</p></div>{verificationBadge(cook)}</div>
            <p className="truncate pl-14 text-sm text-gray-500" title={`${cook.user?.name || "Cook"} · ${cook.user?.email || "No email"}`}>{cook.user?.name || "Cook"} · {cook.user?.email || "No email"}</p><p className="line-clamp-2 text-sm text-gray-600" title={cook.specialization || "Not added"}>{cook.specialization || "Not added"}</p>
            <div className="flex items-center gap-5 text-sm text-gray-600"><span>Dishes <strong className="ml-1 text-[#2B1B12]">{cook._count?.dishes ?? "—"}</strong></span><span>Orders <strong className="ml-1 text-[#2B1B12]">{cook._count?.orders ?? "—"}</strong></span>{accountBadge(cook.user?.status)}</div>
            <button type="button" onClick={(event) => { event.stopPropagation(); void openCookDetail(cook.id); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />Details</button>
          </article>)}</div>
          <footer className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {rangeStart}–{rangeEnd} of {pagination?.total ?? cooks.length} cooks</p><nav aria-label="Cook list pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setLoading(true); setPage(pageNumber); }} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>
        </section>}
      </section>

      {/* Cook Detail Modal */}
      {selectedCook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedCook.businessName}</h3>
                <p className="text-xs text-gray-500">Cook Profile ID: {selectedCook.id}</p>
              </div>
              <button
                onClick={() => setSelectedCook(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Application Overview Sections */}
            <div className="space-y-4 text-xs">
              {/* 1. Basic & Culinary Profile */}
              <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 space-y-2">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5 text-amber-800">
                  <ChefHat className="w-4 h-4 text-amber-600" /> Cook & Kitchen Profile
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">Owner Name</span>
                    <span className="font-bold text-gray-900">{selectedCook.user?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Contact Details</span>
                    <span className="font-bold text-gray-900">{selectedCook.user?.email} • {selectedCook.user?.phone || "No phone"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Cooking Experience</span>
                    <span className="font-bold text-gray-900">{selectedCook.experienceYears || "Not specified"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Specialization</span>
                    <span className="font-bold text-gray-900">{selectedCook.specialization || "General"}</span>
                  </div>
                </div>

                {selectedCook.bio && (
                  <div className="pt-2 border-t border-orange-100/60">
                    <span className="text-gray-500 block font-medium">Introduction / Story</span>
                    <p className="text-gray-800 italic mt-0.5 whitespace-pre-line">{selectedCook.bio}</p>
                  </div>
                )}

                {/* Regional Cuisines & Dietary Preferences */}
                <div className="pt-2 border-t border-orange-100/60 flex flex-wrap gap-4">
                  {selectedCook.cuisines?.length > 0 && (
                    <div>
                      <span className="text-gray-500 block font-medium mb-1">Regional Cuisines</span>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(selectedCook.cuisines) ? selectedCook.cuisines : [selectedCook.cuisines]).map((c, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-semibold text-[10px]">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCook.dietaryPreferences?.length > 0 && (
                    <div>
                      <span className="text-gray-500 block font-medium mb-1">Dietary Preferences</span>
                      <div className="flex flex-wrap gap-1">
                        {(Array.isArray(selectedCook.dietaryPreferences) ? selectedCook.dietaryPreferences : [selectedCook.dietaryPreferences]).map((d, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-semibold text-[10px]">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCook.signatureDishes && (
                    <div className="w-full">
                      <span className="text-gray-500 block font-medium">Signature Dishes</span>
                      <span className="text-gray-800 font-semibold">{selectedCook.signatureDishes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Operations, Location & Availability */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
                <h4 className="font-bold text-gray-900 text-xs">Operations & Operating Area</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">City & Locality</span>
                    <span className="font-bold text-gray-900">{selectedCook.locality || "N/A"}, {selectedCook.city || "N/A"}</span>
                  </div>
                  <div><span className="text-gray-500 block font-medium">Registration type</span><span className="font-semibold text-gray-900">{selectedCook.fssaiStatusType?.replaceAll("_", " ") || "Not specified"}</span></div>
                  <div><span className="text-gray-500 block font-medium">FoSCoS application reference</span><span className="font-semibold text-gray-900">{selectedCook.fssaiApplicationReference || "Not recorded"}</span></div>
                  <div><span className="text-gray-500 block font-medium">Expiry date</span><span className="font-semibold text-gray-900">{selectedCook.fssaiExpiryDate ? new Date(selectedCook.fssaiExpiryDate).toLocaleDateString(undefined, { timeZone: "UTC" }) : "Not recorded"}</span></div>
                  <div>
                    <span className="text-gray-500 block font-medium">Daily Capacity</span>
                    <span className="font-bold text-gray-900">{selectedCook.cookingCapacity || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Preparation Lead Notice</span>
                    <span className="font-bold text-gray-900">{selectedCook.prepTimeNotice || "N/A"}</span>
                  </div>
                </div>
                {latestFssaiDocument ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-blue-100">
                    <DocumentPreviewButton document={latestFssaiDocument} label={`Preview current FSSAI document (${latestFssaiDocument.fileName || "file"})`} />
                    <span className="text-xs text-gray-600">Latest document: {latestFssaiDocument.verificationStatus?.replaceAll("_", " ") || "Status unavailable"}</span>
                    {latestFssaiIsPending && <>
                      <button type="button" onClick={() => setFssaiDecision({ action: "APPROVE", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Approve FSSAI</button>
                      <button type="button" onClick={() => setFssaiDecision({ action: "REJECT", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">Reject</button>
                      <button type="button" onClick={() => setFssaiDecision({ action: "REQUEST_NEW_DOCUMENT", reason: "", expiryDate: "", loading: false })} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold">Request new document</button>
                    </>}
                    {(latestFssaiDocument.rejectionReason || selectedCook.fssaiRejectionReason) && (
                      <p className="w-full text-xs text-red-700">Review reason: {latestFssaiDocument.rejectionReason || selectedCook.fssaiRejectionReason}</p>
                    )}
                  </div>
                ) : (
                  <p className="pt-2 border-t border-blue-100 text-xs text-gray-500">No FSSAI document has been uploaded.</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-200/50">
                  <div>
                    <span className="text-gray-500 block font-medium">Available Days</span>
                    <span className="font-semibold text-gray-800">
                      {Array.isArray(selectedCook.availableDays) ? selectedCook.availableDays.join(", ") : (selectedCook.availableDays || "All days")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Meal Slots</span>
                    <span className="font-semibold text-gray-800">
                      {Array.isArray(selectedCook.availableMealSlots) ? selectedCook.availableMealSlots.join(", ") : (selectedCook.availableMealSlots || "Lunch, Dinner")}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200/50 flex items-center justify-between">
                  <span className="text-gray-600 font-medium">Hygienic Home Kitchen Declared:</span>
                  <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${selectedCook.isHomeKitchenDeclared ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                    {selectedCook.isHomeKitchenDeclared ? "YES, VERIFIED BY APPLICANT" : "PENDING"}
                  </span>
                </div>
              </div>

              {/* 3. FSSAI & Legal Compliance */}
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-2">
                <h4 className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" /> FSSAI Compliance & Selling Status
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-gray-500 block font-medium">FSSAI registration number</span>
                    <span className="font-bold text-gray-900">{selectedCook.fssaiNumber || "Not registered / pending"}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">FSSAI Status</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                      selectedCook.fssaiStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" : selectedCook.fssaiStatus === "REJECTED" || selectedCook.fssaiStatus === "EXPIRED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {selectedCook.fssaiStatus || "NOT_SUBMITTED"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block font-medium">Selling Authorized</span>
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                      selectedCook.isApprovedToSell ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                    }`}>
                      {selectedCook.isApprovedToSell ? "AUTHORIZED TO SELL" : "BLOCKED (FSSAI REQUIRED)"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-100/60 flex items-center justify-between text-[11px]">
                  <span className="text-gray-600">
                    Food Safety Consent: <strong className="text-gray-900">{selectedCook.foodSafetyConsent ? "Accepted" : "No"}</strong>
                    {selectedCook.foodSafetyAgreementVersion ? ` (${selectedCook.foodSafetyAgreementVersion})` : ""}
                  </span>
                  {selectedCook.foodSafetyConsentAt && (
                    <span className="text-gray-500">
                      Timestamp: {new Date(selectedCook.foodSafetyConsentAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Revision / Rejection Note */}
              {(selectedCook.revisionReason || selectedCook.rejectionReason) && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 space-y-1">
                  <span className="font-bold block">
                    {selectedCook.revisionReason ? "Admin Revision Reason:" : "Admin Rejection Reason:"}
                  </span>
                  <p className="text-xs">{selectedCook.revisionReason || selectedCook.rejectionReason}</p>
                </div>
              )}
            </div>

            {/* Submitted Documents */}
            <div className="space-y-3 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" /> Submitted Documents
              </h4>
              {otherVerificationDocuments.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No other verification documents uploaded. The latest FSSAI document is shown above.</p>
              ) : (
                <div className="space-y-2">
                  {otherVerificationDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{doc.documentType}</span>
                        {doc.documentNumber && <span className="text-gray-500 block text-[11px]">Number: {doc.documentNumber}</span>}
                        <span className="text-gray-500 block text-[11px]">Status: {doc.verificationStatus}</span>
                        {doc.rejectionReason && (
                          <span className="text-red-600 block text-[11px] font-medium">Note: {doc.rejectionReason}</span>
                        )}
                      </div>
                      <DocumentPreviewButton document={doc} label="Preview Document" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => openDecisionModal(selectedCook, "APPROVED")}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Cook
              </button>
              <button
                onClick={() => openDecisionModal(selectedCook, "NEEDS_REVISION")}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5" /> Request Revision
              </button>
              <button
                onClick={() => openDecisionModal(selectedCook, "REJECTED")}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Cook
              </button>
              <button
                onClick={() => handleToggleAccountStatus(selectedCook.id, selectedCook.user?.status)}
                className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" /> {selectedCook.user?.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Decision Modal */}
      {decisionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <form onSubmit={handleConfirmDecision} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900">
                {decisionModal.status === "APPROVED"
                  ? `Approve Cook: ${decisionModal.cookName}`
                  : decisionModal.status === "REJECTED"
                  ? `Reject Application: ${decisionModal.cookName}`
                  : `Request Revisions: ${decisionModal.cookName}`}
              </h3>
              <button
                type="button"
                onClick={() => setDecisionModal((p) => ({ ...p, isOpen: false }))}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {decisionModal.status === "APPROVED" ? (
              <div className="space-y-3 text-xs">
                <p className="text-gray-600">
                  Approving will upgrade the user's account role to <strong>COOK</strong> and activate their culinary profile.
                </p>

                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                  <p className="text-blue-900">Cook Panel access and FSSAI verification are reviewed separately.</p>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={decisionModal.isApprovedToSell}
                      onChange={(e) => setDecisionModal((p) => ({ ...p, isApprovedToSell: e.target.checked }))}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span className="font-semibold text-gray-800">
                      Enable Selling on TasteBridge (Cook is permitted to receive customer orders)
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">
                  Reason for {decisionModal.status === "REJECTED" ? "Rejection" : "Revision Request"} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={decisionModal.reason}
                  onChange={(e) => setDecisionModal((p) => ({ ...p, reason: e.target.value }))}
                  placeholder={`Provide clear guidance for ${decisionModal.cookName} on what needs correction...`}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-red-500 focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDecisionModal((p) => ({ ...p, isOpen: false }))}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={decisionModal.loading}
                className={`px-4 py-2 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                  decisionModal.status === "APPROVED"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : decisionModal.status === "REJECTED"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {decisionModal.loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Decision
              </button>
            </div>
          </form>
        </div>
      )}

      {fssaiDecision.action && selectedCook && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <form onSubmit={submitFssaiDecision} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="font-bold text-gray-900">{fssaiDecision.action === "APPROVE" ? "Approve FSSAI details" : fssaiDecision.action === "REJECT" ? "Reject FSSAI details" : "Request a new FSSAI document"}</h3>
            {fssaiDecision.action === "APPROVE" ? <label className="block text-xs font-semibold">Expiry date *<input required type="date" value={fssaiDecision.expiryDate} onChange={(e) => setFssaiDecision((state) => ({ ...state, expiryDate: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" /></label> : <label className="block text-xs font-semibold">Reason (required)<textarea required value={fssaiDecision.reason} onChange={(e) => setFssaiDecision((state) => ({ ...state, reason: e.target.value }))} className="mt-1 w-full rounded-lg border p-2" rows={3} /></label>}
            <div className="flex justify-end gap-2"><button type="button" disabled={fssaiDecision.loading} onClick={() => setFssaiDecision({ action: null, reason: "", expiryDate: "", loading: false })} className="rounded-lg bg-gray-100 px-3 py-2 text-xs">Cancel</button><button disabled={fssaiDecision.loading} className="rounded-lg bg-[#D2552B] px-3 py-2 text-xs font-bold text-white">{fssaiDecision.loading ? "Saving..." : "Confirm"}</button></div>
          </form>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmVariant={confirmModal.confirmVariant || "danger"}
        loading={confirmModal.loading}
        onConfirm={() => confirmModal.action && confirmModal.action()}
        onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })}
      />
    </main>
  );
};

export default AdminCooks;
