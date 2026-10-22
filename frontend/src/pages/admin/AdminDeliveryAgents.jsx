import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import {
  Truck,
  Search,
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  Ban,
  X,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Bike,
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
  DEACTIVATED: "border-red-200 bg-red-50 text-red-800",
}[status] || "border-gray-200 bg-gray-50 text-gray-700");

const AgentSkeleton = () => <div className="flex min-h-[72px] items-center gap-3 px-4 py-3"><div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-gray-100" /><div className="min-w-0 flex-1"><div className="h-4 w-44 max-w-full animate-pulse rounded bg-gray-100" /><div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-gray-100" /></div><div className="h-6 w-20 animate-pulse rounded-full bg-gray-100" /></div>;

const agentInitials = (agent) => (agent.user?.name || "Agent").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const AgentAvatar = ({ agent }) => {
  const [imageUrl, setImageUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const documentId = agent.profilePhotoDocumentId;
    if (!documentId) return undefined;
    deliveryAgentApi.getDocument(documentId).then((response) => {
      const blob = response?.data instanceof Blob ? response.data : response;
      if (!(blob instanceof Blob)) return;
      objectUrl = URL.createObjectURL(blob);
      if (active) setImageUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [agent.profilePhotoDocumentId]);
  return <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-orange-100 bg-orange-50 text-sm font-bold text-[#9C3E20]">{imageUrl ? <img src={imageUrl} alt={`${agent.user?.name || "Delivery agent"} profile`} loading="lazy" className="h-full w-full object-cover" /> : agentInitials(agent)}</span>;
};

export const AdminDeliveryAgents = () => {
  const [agents, setAgents] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState({ key: "agent", direction: "asc" });
  const pageLimit = 10;
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);

  const [selectedAgent, setSelectedAgent] = useState(null);
  const [payoutReviewReason, setPayoutReviewReason] = useState("");
  const [payoutReviewError, setPayoutReviewError] = useState("");
  const [payoutReviewing, setPayoutReviewing] = useState(false);

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

  const fetchAgents = useCallback(async () => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    try {
      const res = await adminApi.getAllDeliveryAgents({
        search: debouncedSearch,
        verificationStatus: verificationFilter || undefined,
        page,
        limit: pageLimit,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setAgents(res.data.agents || []);
      setPagination(res.data.pagination || null);
      setError(null);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load delivery agents list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [debouncedSearch, verificationFilter, page]);

  const refreshAgents = () => {
    setLoading(true);
    setError(null);
    void fetchAgents();
  };

  useEffect(() => {
    const initialRequest = window.setTimeout(() => { void fetchAgents(); }, 0);
    const refetchWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchAgents();
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
  }, [fetchAgents]);

  const pageCount = Math.max(1, pagination?.pages || 1);
  const currentPage = Math.min(page, pageCount);
  const fullResultLoaded = pagination?.pages === 1 || pagination?.total === 0;
  const countsByStatus = agents.reduce((counts, agent) => {
    counts[agent.verificationStatus] = (counts[agent.verificationStatus] || 0) + 1;
    return counts;
  }, {});
  const agentsTotal = pagination?.total ?? agents.length;
  const summaryCanCount = fullResultLoaded && !debouncedSearch && !verificationFilter;
  const hasActiveFilters = Boolean(debouncedSearch || verificationFilter);
  const summaryCards = [
    { label: "Total agents", value: agentsTotal, caption: hasActiveFilters ? "Matching current filters" : "Registered couriers", icon: Truck, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Approved", value: summaryCanCount ? countsByStatus.APPROVED || 0 : "—", caption: summaryCanCount ? "Verified to deliver" : "Count unavailable across pages", icon: CheckCircle, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending verification", value: summaryCanCount ? countsByStatus.PENDING || 0 : "—", caption: summaryCanCount ? "Waiting for review" : "Count unavailable across pages", icon: FileText, tint: summaryCanCount && (countsByStatus.PENDING || 0) > 0 ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600", pending: summaryCanCount && (countsByStatus.PENDING || 0) > 0 },
    { label: "Online now", value: summaryCanCount ? agents.filter((agent) => agent.isAvailable).length : "—", caption: summaryCanCount ? "Currently available" : "Count unavailable across pages", icon: Bike, tint: "bg-blue-50 text-blue-700" },
  ];
  const sortedAgents = useMemo(() => [...agents].sort((left, right) => {
    let comparison = 0;
    if (sort.key === "agent") comparison = (left.user?.name || "").localeCompare(right.user?.name || "");
    if (sort.key === "deliveries") comparison = (left._count?.orders || 0) - (right._count?.orders || 0);
    return sort.direction === "asc" ? comparison : -comparison;
  }), [agents, sort]);
  const filtersActive = Boolean(search || verificationFilter);
  const clearFilters = () => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setVerificationFilter(""); setPage(1); };
  const toggleSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const sortHeader = (label, key, align = "left") => <th scope="col" aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className={`sticky top-0 z-10 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}><button type="button" onClick={() => toggleSort(key)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${align === "right" ? "justify-end" : "text-left"}`}>{label}{sort.key === key && (sort.direction === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}</button></th>;
  const rangeStart = sortedAgents.length ? (currentPage - 1) * (pagination?.limit || pageLimit) + 1 : 0;
  const rangeEnd = Math.min(currentPage * (pagination?.limit || pageLimit), pagination?.total ?? sortedAgents.length);
  const agentName = (agent) => agent.user?.name || "Unnamed agent";
  const maskLicense = (license) => license ? `•••• ${license.slice(-4)}` : "Not added";
  const vehicleLabel = (type) => (type || "Not specified").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  const verificationBadge = (agent) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${verificationClasses(agent.verificationStatus)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{(agent.verificationStatus || "UNKNOWN").replaceAll("_", " ")}</span>;
  const accountBadge = (status) => <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${accountClasses(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status === "DEACTIVATED" ? "Blocked" : status || "Unknown"}</span>;

  const openAgentDetail = async (agentId) => {
    try {
      setPayoutReviewReason("");
      setPayoutReviewError("");
      const res = await adminApi.getDeliveryAgentById(agentId);
      setSelectedAgent(res.data);
    } catch (err) {
      alert("Failed to load delivery agent details: " + err.message);
    }
  };

  const handleUpdateVerification = (agentId, newStatus) => {
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "APPROVED" ? "Approve" : newStatus === "REJECTED" ? "Reject" : "Request Revision"} Delivery Agent`,
      message: `Are you sure you want to mark this delivery agent's verification status as ${newStatus}?`,
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateDeliveryAgentVerification(agentId, { verificationStatus: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedAgent && selectedAgent.id === agentId) {
            openAgentDetail(agentId);
          }
          refreshAgents();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const handleToggleAccountStatus = (agentId, currentStatus) => {
    const newStatus = currentStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setConfirmModal({
      isOpen: true,
      title: `${newStatus === "SUSPENDED" ? "Suspend" : "Reactivate"} Agent Account`,
      message: `Are you sure you want to ${newStatus.toLowerCase()} this agent account?`,
      confirmVariant: newStatus === "SUSPENDED" ? "danger" : "emerald",
      action: async () => {
        setConfirmModal((prev) => ({ ...prev, loading: true }));
        try {
          await adminApi.updateDeliveryAgentAccountStatus(agentId, { status: newStatus });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          if (selectedAgent && selectedAgent.id === agentId) {
            openAgentDetail(agentId);
          }
          refreshAgents();
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((prev) => ({ ...prev, loading: false }));
        }
      },
    });
  };

  const reviewPayoutDetails = async (action) => {
    if (!selectedAgent?.payoutDetails || (action === "REJECT" && !payoutReviewReason.trim())) return;
    setPayoutReviewing(true);
    setPayoutReviewError("");
    try {
      const result = await adminApi.reviewDeliveryAgentPayoutDetails(selectedAgent.id, {
        action,
        ...(action === "REJECT" ? { rejectionReason: payoutReviewReason.trim() } : {}),
      });
      setSelectedAgent((current) => current ? { ...current, payoutDetails: result.data } : current);
      setPayoutReviewReason("");
      refreshAgents();
    } catch (reviewError) {
      setPayoutReviewError(reviewError.message || "Payout details could not be reviewed.");
    } finally {
      setPayoutReviewing(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
      <section aria-label="Delivery agent summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && agents.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-20 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-gray-600">{card.pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Pending applications" />}{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
      </section>

      <section aria-label="Delivery agent filters" className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(event) => event.preventDefault()} className="relative w-full sm:w-[min(420px,42vw)]">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" aria-label="Search by name, license number or email" placeholder="Search by name, license number or email" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
              {search && <button type="button" onClick={() => { setLoading(true); setError(null); setSearch(""); setDebouncedSearch(""); setPage(1); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
            </form>
            <p className="whitespace-nowrap text-sm text-gray-500">Showing {agents.length ? rangeStart : 0}–{rangeEnd} of {pagination?.total ?? agents.length} agents</p>
          </div>
          <div role="group" aria-label="Filter agents by verification status" className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {verificationOptions.map((option) => <button key={option.value || "ALL"} type="button" aria-pressed={verificationFilter === option.value} onClick={() => { setLoading(true); setError(null); setVerificationFilter(option.value); setPage(1); }} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${verificationFilter === option.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{option.label}{summaryCanCount && <span className={`text-xs ${verificationFilter === option.value ? "text-white/80" : "text-gray-400"}`}>{option.value ? countsByStatus[option.value] || 0 : agentsTotal}</span>}{option.value === "PENDING" && summaryCanCount && (countsByStatus.PENDING || 0) > 0 && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Pending agents need review" />}</button>)}
          </div>
        </div>

        {error ? <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={refreshAgents} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></section> : loading ? <section aria-label="Loading delivery agents" className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-gray-50" />)}</div>{Array.from({ length: 5 }, (_, index) => <AgentSkeleton key={index} />)}</section> : agents.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Truck className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No delivery agents found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Clear filters</button>}</section> : <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Delivery agents">
          <div className="hidden overflow-x-auto md:block"><table className="w-full table-fixed text-left"><thead className="border-b border-gray-200"><tr>{sortHeader("Agent", "agent")}<th scope="col" className="w-[18%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Vehicle</th><th scope="col" className="hidden w-[16%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">License number</th><th scope="col" className="w-[16%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">Verification</th><th scope="col" className="hidden w-[14%] bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600 lg:table-cell">Account</th>{sortHeader("Deliveries", "deliveries", "right")}<th scope="col" className="w-24 bg-gray-50 px-4 py-3 text-right text-xs font-semibold text-gray-600">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{sortedAgents.map((agent) => <tr key={agent.id} tabIndex={0} onClick={() => void openAgentDetail(agent.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openAgentDetail(agent.id); } }} className={`cursor-pointer border-l-[3px] transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${agent.verificationStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
              <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={agent} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={agentName(agent)}>{agentName(agent)}</p><p className="truncate text-sm text-gray-500" title={agent.user?.email || "No email"}>{agent.user?.email || "No email"}</p><p className="truncate text-sm text-gray-500 lg:hidden" title={agent.user?.phone || "Phone not added"}>{agent.user?.phone || "Phone not added"}</p></div></div></td>
              <td className="px-4 py-3"><div className="flex min-w-0 items-start gap-2"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D2552B]"><Bike className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-700" title={vehicleLabel(agent.vehicleType)}>{vehicleLabel(agent.vehicleType)}</p><p className="truncate text-sm text-gray-500" title="Vehicle plate not recorded">Vehicle plate not recorded</p></div></div></td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-600 lg:table-cell" title={agent.licenseNumber || "Not added"}>{maskLicense(agent.licenseNumber)}</td>
              <td className="px-4 py-3">{verificationBadge(agent)}</td><td className="hidden px-4 py-3 lg:table-cell">{accountBadge(agent.user?.status)}</td><td className="px-4 py-3 text-right text-sm font-medium text-gray-700">{agent._count?.orders ?? "—"}</td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); void openAgentDetail(agent.id); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />View</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="divide-y divide-gray-100 md:hidden">{sortedAgents.map((agent) => <article key={agent.id} tabIndex={0} aria-label={`Open ${agentName(agent)} details`} onClick={() => void openAgentDetail(agent.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void openAgentDetail(agent.id); } }} className={`cursor-pointer space-y-3 border-l-[3px] p-4 transition-colors hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D2552B] ${agent.verificationStatus === "PENDING" ? "border-l-amber-300" : "border-l-transparent"}`}>
            <div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={agent} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]">{agentName(agent)}</p></div>{verificationBadge(agent)}</div><p className="truncate pl-14 text-sm text-gray-500" title={agent.user?.email || "No email"}>{agent.user?.email || "No email"}</p>
            <div className="flex min-w-0 items-start gap-2"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D2552B]"><Bike className="h-4 w-4" /></span><div className="min-w-0"><p className="text-sm font-medium text-gray-700">{vehicleLabel(agent.vehicleType)}</p><p className="text-sm text-gray-500">Vehicle plate not recorded · License {maskLicense(agent.licenseNumber)}</p><p className="truncate text-sm text-gray-500" title={agent.user?.phone || "Phone not added"}>{agent.user?.phone || "Phone not added"}</p></div></div>
            <div className="flex items-center justify-between gap-3 text-sm text-gray-600"><span>Deliveries <strong className="ml-1 text-[#2B1B12]">{agent._count?.orders ?? "—"}</strong></span>{accountBadge(agent.user?.status)}</div>
            <button type="button" onClick={(event) => { event.stopPropagation(); void openAgentDetail(agent.id); }} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-gray-200 text-sm font-semibold text-gray-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Eye className="h-4 w-4" />View</button>
          </article>)}</div>
          <footer className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {rangeStart}–{rangeEnd} of {pagination?.total ?? agents.length} agents</p><nav aria-label="Delivery agent list pages" className="flex items-center justify-end gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => { setLoading(true); setPage((value) => Math.max(1, value - 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => { setLoading(true); setPage(pageNumber); }} className={`h-10 min-w-10 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === currentPage ? "bg-[#D2552B] text-white" : "text-gray-600 hover:bg-gray-100"}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => { setLoading(true); setPage((value) => Math.min(pageCount, value + 1)); }} className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></nav></footer>
        </section>}
      </section>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="delivery-agent-detail-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 id="delivery-agent-detail-title" className="text-xl font-bold text-gray-900">{selectedAgent.user?.name}</h3>
                <p className="text-xs text-gray-500">Delivery Agent ID: {selectedAgent.id}</p>
              </div>
              <button onClick={() => setSelectedAgent(null)} className="p-1 rounded-lg text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 block font-medium">Vehicle Type</span>
                <span className="font-bold text-gray-900">{selectedAgent.vehicleType || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Driving License</span>
                <span className="font-bold text-gray-900 font-mono">{selectedAgent.licenseNumber || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Email / Phone</span>
                <span className="font-bold text-gray-900">{selectedAgent.user?.email} • {selectedAgent.user?.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-500 block font-medium">Verification Status</span>
                <span className="font-bold text-emerald-600 uppercase">{selectedAgent.verificationStatus}</span>
              </div>
            </div>

            <section className="space-y-3 border-t border-gray-100 pt-4" aria-labelledby="agent-payout-review-heading">
              <div className="flex items-center justify-between gap-3">
                <h4 id="agent-payout-review-heading" className="text-sm font-bold text-gray-900">Delivery-fee payment details</h4>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-700">{selectedAgent.payoutDetails?.verificationStatus?.replaceAll("_", " ") || "NOT SUBMITTED"}</span>
              </div>
              {selectedAgent.payoutDetails ? <>
                <div className="rounded-xl bg-gray-50 p-3 text-xs">
                  <span className="block text-gray-500">UPI ID</span>
                  <span className="mt-1 block break-all font-semibold text-gray-900">{selectedAgent.payoutDetails.upiId}</span>
                  <span className="mt-2 block text-gray-500">UPI account holder name</span>
                  <span className="mt-1 block break-words font-semibold text-gray-900">{selectedAgent.payoutDetails.accountHolderName || "Not provided"}</span>
                  {selectedAgent.payoutDetails.rejectionReason && <p className="mt-2 text-red-700">Reason: {selectedAgent.payoutDetails.rejectionReason}</p>}
                </div>
                {selectedAgent.payoutDetails.verificationStatus === "PENDING"
                  && (!selectedAgent.payoutDetails.upiId || !selectedAgent.payoutDetails.accountHolderName?.trim())
                  && <p className="text-xs text-amber-800">The agent must submit both the UPI ID and account holder name before approval.</p>}
                {selectedAgent.payoutDetails.verificationStatus === "PENDING" && <>
                  <label htmlFor="payout-rejection-reason" className="block text-xs font-semibold text-gray-700">Rejection reason (required to reject)</label>
                  <textarea id="payout-rejection-reason" value={payoutReviewReason} onChange={(event) => setPayoutReviewReason(event.target.value)} maxLength={2000} rows={2} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" placeholder="Explain what the agent should correct" />
                  {payoutReviewError && <p role="alert" className="text-xs font-medium text-red-700">{payoutReviewError}</p>}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" disabled={payoutReviewing || !payoutReviewReason.trim()} onClick={() => reviewPayoutDetails("REJECT")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">{payoutReviewing ? "Saving…" : "Reject details"}</button>
                    <button type="button" disabled={payoutReviewing || !selectedAgent.payoutDetails.upiId || !selectedAgent.payoutDetails.accountHolderName?.trim()} onClick={() => reviewPayoutDetails("APPROVE")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{payoutReviewing ? "Saving…" : "Approve details"}</button>
                  </div>
                </>}
                <p className="text-[11px] leading-5 text-gray-500">Approval records admin review of these submitted details; it does not independently verify account ownership or initiate a payout.</p>
              </> : <p className="text-xs text-gray-500">The agent has not submitted payout details.</p>}
            </section>

            {/* Documents */}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" /> Verification Documents
              </h4>
              {selectedAgent.user?.verificationDocuments?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No verification documents found.</p>
              ) : (
                <div className="space-y-2">
                  {selectedAgent.user?.verificationDocuments?.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                      <div>
                        <span className="font-bold text-gray-900">{doc.documentType}</span>
                        <span className="text-gray-500 block text-[11px]">Status: {doc.verificationStatus}</span>
                      </div>
                      <a
                        href={doc.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100"
                      >
                        View Document
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => handleUpdateVerification(selectedAgent.id, "APPROVED")}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Approve Agent
              </button>
              <button
                onClick={() => handleUpdateVerification(selectedAgent.id, "REJECTED")}
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" /> Reject Agent
              </button>
              <button
                onClick={() => handleToggleAccountStatus(selectedAgent.id, selectedAgent.user?.status)}
                className="px-3.5 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-red-400" /> {selectedAgent.user?.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
              </button>
            </div>
          </div>
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

export default AdminDeliveryAgents;
