import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import { ExperienceImage } from "../../components/events/ExperienceCard.jsx";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import {
  CalendarDays,
  CheckCircle,
  Clock3,
  MapPin,
  Search,
  Sparkles,
  Users,
  X,
  ChefHat,
  BadgeCheck,
  CircleDot,
  Ban,
  Pause,
} from "lucide-react";

const statusLabels = {
  PUBLISHED: "Published",
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAUSED: "Paused",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
};

const statusLabel = (status) => String(status || "UNPUBLISHED").replaceAll("_", " ");
const StatusBadge = ({ status }) => <span className="inline-flex whitespace-nowrap rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-[#D2552B]">{statusLabel(status)}</span>;

const ExperienceSkeleton = () => <article className="grid animate-pulse gap-4 rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6 min-[520px]:grid-cols-[190px_minmax(0,1fr)]"><div className="aspect-[16/9] max-h-[200px] w-full rounded-xl bg-gray-100 min-[520px]:aspect-[4/3] min-[520px]:w-[190px]" /><div className="space-y-4"><div className="h-6 w-2/3 rounded bg-gray-100" /><div className="flex gap-2"><div className="h-8 w-28 rounded-full bg-gray-100" /><div className="h-8 w-24 rounded-full bg-gray-100" /></div><div className="h-4 w-full rounded bg-gray-100" /><div className="h-4 w-4/5 rounded bg-gray-100" /></div></article>;

const ExperienceCard = ({ experience, onUpdateStatus, categories }) => {
  const status = experience.status;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const canPublish = ["APPROVED", "PAUSED", "DRAFT"].includes(status);
  const canUnpublish = status === "PUBLISHED";
  const hostName = experience.cook?.businessName || "Kitchen";
  const cookName = experience.cook?.user?.name;
  const description = experience.description?.trim();
  const price = experience.pricePerPerson;
  const hasPrice = price !== null && price !== undefined && price !== "" && Number.isFinite(Number(price));
  const typeLabel = experience.type === "HOME_DINING" ? "Home dining" : experience.type?.replaceAll("_", " ");
  const slots = Array.isArray(experience.slots) ? experience.slots : [];
  const shownSlots = showAllDates ? slots : slots.slice(0, 3);
  const actionButtons = () => <div className="flex w-full flex-col gap-2 min-[768px]:w-auto min-[768px]:flex-row">
    {canUnpublish && <button type="button" onClick={() => onUpdateStatus(experience, "PAUSED")} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#3E5B3A] px-3 text-sm font-bold text-white transition duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3E5B3A] focus-visible:ring-offset-2 md:w-auto"><Pause className="h-4 w-4" aria-hidden="true" />Unpublish</button>}
    {canPublish && <button type="button" onClick={() => onUpdateStatus(experience, "PUBLISHED")} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 min-[768px]:w-auto"><CheckCircle className="h-4 w-4" aria-hidden="true" />Publish</button>}
  </div>;

  const availabilityStatus = (slot) => {
    const remaining = Number(slot.availableSeats);
    if (slot.status === "CLOSED" || slot.status === "CANCELLED") return { label: "Closed", classes: "bg-gray-100 text-gray-700" };
    if (slot.status === "FULL" || (Number.isFinite(remaining) && remaining <= 0)) return { label: "Full", classes: "bg-amber-50 text-amber-800" };
    return { label: "Open", classes: "bg-emerald-50 text-emerald-800" };
  };

  const renderAvailability = () => <section className="mt-4 border-t border-[#2B1B12]/10 pt-4" aria-label="Experience availability">
    <div className="mb-2 flex items-center justify-between gap-3">
      <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2B1B12]/70"><CalendarDays className="h-4 w-4" aria-hidden="true" /><span>Availability</span><span className="normal-case tracking-normal">· {slots.length} {slots.length === 1 ? "date" : "dates"}</span></h3>
      {slots.length > 3 && <button type="button" onClick={() => setShowAllDates((value) => !value)} aria-expanded={showAllDates} className="min-h-11 shrink-0 text-sm font-bold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{showAllDates ? "Show fewer dates" : "Show all dates"}</button>}
    </div>
    <ul className="overflow-hidden rounded-xl bg-gray-50 px-3">{slots.length ? shownSlots.map((slot, index) => {
      const capacity = Math.max(Number(slot.capacity) || 0, 0);
      const remaining = Math.max(Number(slot.availableSeats) || 0, 0);
      const progress = capacity ? Math.min((remaining / capacity) * 100, 100) : 0;
      const currentStatus = availabilityStatus(slot);
      return <li key={slot.id} className={`flex min-h-14 min-w-0 flex-wrap items-center gap-2 py-2 text-sm text-[#2B1B12]/75 ${index < shownSlots.length - 1 ? "border-b border-gray-200" : ""}`}>
        <span className="inline-flex min-w-0 flex-1 items-center gap-2"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 truncate" title={`${formatIstDateTime(slot.startsAt)} · ${formatIstDateTime(slot.endsAt)}`}>{formatIstDateTime(slot.startsAt)} · {formatIstDateTime(slot.endsAt)}</span></span>
        <div className="ml-auto flex shrink-0 items-center gap-2"><span className="whitespace-nowrap text-xs">{remaining}/{capacity} seats</span><span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-gray-200 sm:block" aria-label={`${Math.round(progress)}% seats available`}><span className="block h-full bg-[#3E5B3A]" style={{ width: `${progress}%` }} /></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${currentStatus.classes}`}>{currentStatus.label.toUpperCase()}</span></div>
      </li>;
    }) : <li className="flex min-h-14 items-center py-2 text-sm text-[#2B1B12]/60">No dates scheduled.</li>}</ul>
  </section>;

  return <article className="min-w-0 rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex min-w-0 flex-col gap-4 min-[768px]:flex-row min-[768px]:items-center min-[768px]:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="max-w-full truncate text-lg font-extrabold text-[#2B1B12]" title={experience.title}>{experience.title || "Untitled experience"}</h2><StatusBadge status={status} />{typeLabel && <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{typeLabel}</span>}</div>
        <p className="mt-1 truncate text-sm text-[#2B1B12]/70" title={experience.theme || experience.cuisine || "Experience"}>{experience.theme || experience.cuisine || "Experience"}</p>
      </div>
      {(canPublish || canUnpublish) && <div className="min-[768px]:shrink-0">{actionButtons()}</div>}
    </header>

    <div className="my-4 border-t border-[#2B1B12]/10" />
    <div className="grid min-w-0 gap-4 min-[520px]:grid-cols-[190px_minmax(0,1fr)] min-[520px]:items-start min-[520px]:gap-5">
      <div className="relative aspect-[16/9] max-h-[200px] w-full overflow-hidden rounded-xl bg-[#F7F2EC] [&>img]:!h-full [&>img]:!w-full [&>div]:!h-full [&>div]:!w-full min-[520px]:aspect-[4/3] min-[520px]:h-auto min-[520px]:w-[190px]">
        <ExperienceImage experience={experience} type="dining" horizontal categories={categories} />
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap gap-2 text-sm text-[#2B1B12]/70">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{experience.publicArea || experience.location || "Area not set"}</span>
          {hasPrice && <span className="rounded-lg bg-gray-50 px-2.5 py-2">₹{price} per person</span>}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><Users className="h-4 w-4 shrink-0" aria-hidden="true" />Up to {experience.maxGuests ?? "—"} guests per booking</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><ChefHat className="h-4 w-4 shrink-0" aria-hidden="true" />{hostName}{cookName ? ` · ${cookName}` : ""}</span>
        </div>

        {description && <div className="mt-3"><p className={`whitespace-pre-wrap text-sm leading-6 text-[#2B1B12]/75 ${descriptionExpanded ? "" : "line-clamp-3"}`}>{description}</p><button type="button" onClick={() => setDescriptionExpanded((value) => !value)} aria-expanded={descriptionExpanded} className="mt-2 min-h-11 text-sm font-bold text-[#D2552B] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{descriptionExpanded ? "Read less" : "Read more"}</button></div>}
      </div>
    </div>

    {experience.reviewRejectionReason && status === "REJECTED" && <p className="mt-4 line-clamp-2 rounded-xl bg-red-50 p-3 text-sm text-red-800" title={experience.reviewRejectionReason}><strong>Review note:</strong> {experience.reviewRejectionReason}</p>}
    {renderAvailability()}
  </article>;
};

const statusFilterOptions = ["PUBLISHED", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DRAFT", "CANCELLED"];
const isUnpublished = (status) => ["APPROVED", "REJECTED", "PAUSED", "DRAFT", "CANCELLED"].includes(status);

export const AdminDineManagement = () => {
  const [experiences, setExperiences] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", action: null, loading: false });
  const requestControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const fetchExperiences = useCallback(async (showLoading = false) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getAllExperiences({ type: "HOME_DINING" }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setExperiences(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load experiences.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchExperiences(true);
    adminApi.getFoodCategories().then((response) => {
      if (active) setCategories(Array.isArray(response.data) ? response.data : []);
    }).catch(() => {
      if (active) setCategories([]);
    });
    const refreshIfVisible = () => { if (document.visibilityState === "visible") void fetchExperiences(); };
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      active = false;
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [fetchExperiences]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = useMemo(() => experiences.reduce((result, experience) => {
    result[experience.status] = (result[experience.status] || 0) + 1;
    if (experience.status === "PUBLISHED") result.published += 1;
    if (experience.status === "PENDING") result.pending += 1;
    if (isUnpublished(experience.status)) result.unpublished += 1;
    return result;
  }, { published: 0, pending: 0, unpublished: 0 }), [experiences]);

  const visibleExperiences = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    return experiences.filter((experience) => {
      const statusMatches = !statusFilter
        || (statusFilter === "UNPUBLISHED" ? isUnpublished(experience.status) : experience.status === statusFilter);
      const queryMatches = !query || [experience.title, experience.location, experience.city, experience.cook?.businessName]
        .some((value) => String(value || "").toLowerCase().includes(query));
      return statusMatches && queryMatches;
    });
  }, [experiences, statusFilter, debouncedSearch]);

  const statusCounts = experiences.reduce((result, experience) => {
    result[experience.status] = (result[experience.status] || 0) + 1;
    return result;
  }, {});
  const actualStatusOptions = statusFilterOptions.filter((status) => statusCounts[status]);
  const filterOptions = [
    { label: "All", value: "", count: experiences.length },
    { label: "Published", value: "PUBLISHED", count: counts.published },
    { label: "Unpublished", value: "UNPUBLISHED", count: counts.unpublished },
    ...actualStatusOptions.filter((status) => !["PUBLISHED"].includes(status)).map((status) => ({ label: statusLabels[status] || status, value: status, count: statusCounts[status] })),
  ];
  const pendingStatusExists = statusCounts.PENDING > 0;
  const summaryCards = [
    { label: "Total experiences", value: experiences.length, caption: "Across all kitchens", icon: CalendarDays, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Published", value: counts.published, caption: "Live on marketplace", icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending review", value: counts.pending, caption: "Waiting for approval", icon: CircleDot, tint: "bg-amber-50 text-amber-700", dot: pendingStatusExists },
    { label: "Unpublished", value: counts.unpublished, caption: "Hidden from customers", icon: Ban, tint: "bg-gray-100 text-gray-600" },
  ];
  const filtersActive = Boolean(search || statusFilter);
  const clearFilters = () => { setSearch(""); setDebouncedSearch(""); setStatusFilter(""); };

  const requestStatusChange = (experience, status) => {
    const actionLabels = { APPROVED: "approve", REJECTED: "reject", PUBLISHED: "publish", PAUSED: "unpublish" };
    const actionLabel = actionLabels[status] || "update";
    const message = status === "PAUSED"
      ? `Unpublish “${experience.title}”? It will be hidden from customers.`
      : status === "PUBLISHED"
        ? `Publish “${experience.title}” on the marketplace?`
        : `Are you sure you want to ${actionLabel} “${experience.title}”?`;
    setConfirmModal({
      isOpen: true,
      title: `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)} dining experience`,
      message,
      action: async () => {
        setConfirmModal((previous) => ({ ...previous, loading: true }));
        try {
          await adminApi.updateExperienceStatus(experience.id, { status });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          await fetchExperiences();
        } catch (err) {
          alert(`Error: ${err.message}`);
          setConfirmModal((previous) => ({ ...previous, loading: false }));
        }
      },
    });
  };

  return <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
    <section aria-label="Dining experience summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && experiences.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-16 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : summaryCards.map((card) => <article key={card.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-gray-600">{card.dot && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Pending experiences exist" />}{card.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><card.icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{card.value}</p><p className="mt-2 text-[13px] text-gray-500">{card.caption}</p></article>)}
    </section>

    <section aria-label="Dining experience filters" className="space-y-4">
      <div role="group" aria-label="Filter dining experiences by status" className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{filterOptions.map((option) => <button key={option.value || "ALL"} type="button" aria-pressed={statusFilter === option.value} onClick={() => setStatusFilter(option.value)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === option.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{option.label}<span className={`text-xs ${statusFilter === option.value ? "text-white/80" : "text-gray-400"}`}>{option.count}</span></button>)}</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={(event) => event.preventDefault()} className="relative w-full md:max-w-[560px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" aria-label="Search by title, location or kitchen" placeholder="Search by title, location or kitchen" value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
          {search && <button type="button" onClick={() => { setSearch(""); setDebouncedSearch(""); }} aria-label="Clear search" className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><X className="h-4 w-4" /></button>}
        </form>
        <p className="text-right text-sm text-gray-500">Showing {visibleExperiences.length} of {experiences.length} experiences</p>
      </div>

      {error ? <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={() => void fetchExperiences(true)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></section> : loading && experiences.length === 0 ? <section aria-label="Loading dining experiences" className="space-y-4">{Array.from({ length: 6 }, (_, index) => <ExperienceSkeleton key={index} />)}</section> : visibleExperiences.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Sparkles className="h-6 w-6" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No experiences found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button>}</section> : <section aria-label="Dining experiences" className="space-y-4">{visibleExperiences.map((experience) => <ExperienceCard key={experience.id} experience={experience} categories={categories} onUpdateStatus={requestStatusChange} />)}</section>}
    </section>

    <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} loading={confirmModal.loading} onConfirm={() => confirmModal.action?.()} onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })} />
  </main>;
};

export default AdminDineManagement;
