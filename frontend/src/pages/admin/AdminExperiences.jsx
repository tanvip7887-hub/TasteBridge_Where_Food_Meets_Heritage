import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../api/adminApi.js";
import AdminDineManagement from "./AdminDineManagement.jsx";
import ConfirmationModal from "../../components/admin/ConfirmationModal.jsx";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import {
  Sparkles, Search, CheckCircle, XCircle, MapPin, Clock, Users, CalendarDays,
  ChefHat, Wallet, CircleDot, Ban, BadgeCheck, ClipboardList, ChevronDown, ChevronUp,
} from "lucide-react";

const workshopUnpublished = (experience) => ["DRAFT", "PAUSED", "APPROVED", "CANCELLED"].includes(experience.status);
const formatMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
};
const formatDuration = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value)} mins` : "—";

const WorkshopStatusBadge = ({ status }) => {
  const classes = status === "PENDING" ? "bg-amber-100 text-amber-800" : ["APPROVED", "PUBLISHED"].includes(status) ? "bg-emerald-100 text-emerald-800" : status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700";
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold uppercase ${classes}`}>{String(status || "DRAFT").replaceAll("_", " ")}</span>;
};

const WorkshopCardSkeleton = () => <article aria-hidden="true" className="grid animate-pulse gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 md:grid-cols-[200px_minmax(0,1fr)]">
  <div className="aspect-[16/9] max-h-[200px] rounded-xl bg-gray-100 md:aspect-[4/3] md:h-[150px] md:w-[200px]" />
  <div className="space-y-4"><div className="h-6 w-2/3 rounded bg-gray-100" /><div className="flex gap-2"><div className="h-8 w-28 rounded-full bg-gray-100" /><div className="h-8 w-24 rounded-full bg-gray-100" /></div><div className="h-4 w-full rounded bg-gray-100" /><div className="h-12 w-full rounded-xl bg-gray-100" /></div>
</article>;

const WorkshopCard = ({ experience, rejectionReason, onReasonChange, onReview }) => {
  const [expanded, setExpanded] = useState(false);
  const [showAllDates, setShowAllDates] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const slots = Array.isArray(experience.slots) ? experience.slots : [];
  const shownSlots = showAllDates ? slots : slots.slice(0, 3);
  const image = experience.image || experience.photos?.[0];
  const kitchenName = experience.cook?.businessName || "Kitchen";
  const cookName = experience.cook?.user?.name;
  const detailsExist = Boolean(experience.teachingContent || experience.learningOutcomes || experience.materialsToBring);
  const status = experience.status;
  const availabilityStatus = (slot) => {
    const seats = Number(slot.availableSeats);
    if (["CLOSED", "CANCELLED"].includes(slot.status)) return { label: "CLOSED", classes: "bg-gray-200 text-gray-700" };
    if (slot.status === "FULL" || (Number.isFinite(seats) && seats <= 0)) return { label: "FULL", classes: "bg-amber-100 text-amber-900" };
    return { label: "OPEN", classes: "bg-emerald-100 text-emerald-800" };
  };

  return <article className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="max-w-full truncate text-lg font-extrabold text-[#2B1B12]" title={experience.title}>{experience.title || "Untitled workshop"}</h2><WorkshopStatusBadge status={status} /><span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">Workshop</span></div>
        <p className="mt-1 truncate text-sm text-[#2B1B12]/70" title={experience.theme || experience.cuisine || "Workshop"}>{experience.theme || experience.cuisine || "Workshop"}</p>
      </div>
      {status === "PENDING" && <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:shrink-0">
        <button type="button" onClick={() => onReview(experience.id, "PUBLISHED")} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 md:w-auto"><CheckCircle className="h-4 w-4" aria-hidden="true" />Approve and publish</button>
        <button type="button" disabled={rejectionReason.trim().length < 5} onClick={() => onReview(experience.id, "REJECTED")} className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"><XCircle className="h-4 w-4" aria-hidden="true" />Reject</button>
      </div>}
    </header>

    <div className="my-4 border-t border-gray-100" />
    <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:items-start md:gap-5">
      <div className="grid aspect-[16/9] max-h-[200px] w-full place-items-center overflow-hidden rounded-xl bg-gray-50 md:aspect-[4/3] md:h-[150px] md:w-[200px]">
        {image && !imageFailed ? <img src={image} alt={experience.title || "Workshop"} loading="lazy" onError={() => setImageFailed(true)} className="h-full w-full object-contain" /> : <ChefHat className="h-10 w-10 text-gray-400" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{experience.publicArea || experience.location || "Area not set"}</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{formatDuration(experience.durationMinutes)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><Users className="h-4 w-4 shrink-0" aria-hidden="true" />Max {experience.maxGuests ?? "—"} guests</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />{formatMoney(experience.pricePerPerson)} / person</span>
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-2"><ChefHat className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{kitchenName}{cookName ? ` · ${cookName}` : ""}</span></span>
        </div>
        {experience.description && <p className={`mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600 ${expanded ? "" : "line-clamp-2"}`}>{experience.description}</p>}
        {detailsExist && expanded && <div className="mt-3 space-y-2 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">
          {experience.teachingContent && <p><strong className="text-gray-800">What will be taught</strong><br />{experience.teachingContent}</p>}
          {experience.learningOutcomes && <p><strong className="text-gray-800">Participants will learn</strong><br />{experience.learningOutcomes}</p>}
          {experience.materialsToBring && <p><strong className="text-gray-800">Bring</strong><br />{experience.materialsToBring}</p>}
        </div>}
        {(experience.description || detailsExist) && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-bold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{expanded ? "Show less" : detailsExist ? "Read more / Show details" : "Read more"}{expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}</button>}
        {status === "PENDING" && <label className="mt-3 block space-y-1.5 text-sm font-semibold text-gray-700">Rejection reason (required to reject)<textarea value={rejectionReason} onChange={(event) => onReasonChange(experience.id, event.target.value)} maxLength={2000} rows={2} className="w-full rounded-xl border border-gray-200 p-3 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-red-200" /></label>}
        {status === "REJECTED" && experience.reviewRejectionReason && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"><strong>Rejection reason:</strong> {experience.reviewRejectionReason}</p>}
      </div>
    </div>

    {slots.length > 0 && <section className="mt-4 border-t border-gray-100 pt-4" aria-label="Workshop availability">
      <div className="mb-2 flex items-center justify-between gap-3"><h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600"><CalendarDays className="h-4 w-4" aria-hidden="true" />Availability <span className="normal-case tracking-normal">· {slots.length} {slots.length === 1 ? "date" : "dates"}</span></h3>{slots.length > 3 && <button type="button" onClick={() => setShowAllDates((value) => !value)} aria-expanded={showAllDates} className="min-h-11 shrink-0 text-sm font-semibold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">{showAllDates ? "Show fewer dates" : "Show all dates"}</button>}</div>
      <ul className="overflow-hidden rounded-xl bg-gray-50 px-3">{shownSlots.map((slot, index) => {
        const capacity = Math.max(Number(slot.capacity) || 0, 0);
        const seats = Math.max(Number(slot.availableSeats) || 0, 0);
        const percentage = capacity ? Math.min((seats / capacity) * 100, 100) : 0;
        const slotStatus = availabilityStatus(slot);
        return <li key={slot.id} className={`flex min-h-14 min-w-0 flex-col items-start gap-2 py-2 text-sm text-gray-700 md:flex-row md:items-center ${index < shownSlots.length - 1 ? "border-b border-gray-200" : ""}`}>
          <span className="inline-flex min-w-0 w-full flex-1 items-center gap-2 md:w-auto"><Clock className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 truncate" title={`${formatIstDateTime(slot.startsAt)} – ${formatIstDateTime(slot.endsAt)}`}>{formatIstDateTime(slot.startsAt)} – {formatIstDateTime(slot.endsAt)}</span></span>
          <span className="flex w-full shrink-0 items-center justify-between gap-2 md:ml-auto md:w-56"><span className="whitespace-nowrap text-xs">{seats}/{capacity} seats</span><span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-label={`${Math.round(percentage)}% seats available`} aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={seats}><span className="block h-full bg-emerald-700" style={{ width: `${percentage}%` }} /></span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${slotStatus.classes}`}>{slotStatus.label}</span></span>
        </li>;
      })}</ul>
    </section>}
  </article>;
};

const AdminWorkshopReview = () => {
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState({});
  const requestIdRef = useRef(0);
  const requestControllerRef = useRef(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", action: null, loading: false });

  const fetchExperiences = useCallback(async (showLoading = true) => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getAllExperiences({ type: "WORKSHOP" }, { signal: controller.signal });
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setExperiences(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (requestId !== requestIdRef.current || controller.signal.aborted) return;
      setError(err.message || "Failed to load experiences list.");
    } finally {
      if (requestId === requestIdRef.current) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchExperiences(true);
    return () => {
      requestControllerRef.current?.abort();
      requestIdRef.current += 1;
    };
  }, [fetchExperiences]);

  const counts = {
    total: experiences.length,
    published: experiences.filter((experience) => experience.status === "PUBLISHED").length,
    pending: experiences.filter((experience) => experience.status === "PENDING").length,
    unpublished: experiences.filter(workshopUnpublished).length,
    rejected: experiences.filter((experience) => experience.status === "REJECTED").length,
  };
  const statusTabs = [
    { label: "All", value: "", count: counts.total },
    { label: "Pending review", value: "PENDING", count: counts.pending },
    { label: "Published", value: "PUBLISHED", count: counts.published },
    { label: "Unpublished", value: "UNPUBLISHED", count: counts.unpublished },
    { label: "Rejected", value: "REJECTED", count: counts.rejected },
  ];
  const searchTerm = appliedSearch.trim().toLowerCase();
  const visibleExperiences = experiences.filter((experience) => {
    const statusMatches = !statusFilter || (statusFilter === "UNPUBLISHED" ? workshopUnpublished(experience) : experience.status === statusFilter);
    const searchMatches = !searchTerm || [experience.title, experience.location, experience.publicArea, experience.theme, experience.description, experience.cook?.businessName, experience.cook?.user?.name]
      .some((value) => String(value || "").toLowerCase().includes(searchTerm));
    return statusMatches && searchMatches;
  });
  const stats = [
    { label: "Total workshops", value: counts.total, caption: "Across all kitchens", icon: ClipboardList, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Published", value: counts.published, caption: "Live on marketplace", icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending review", value: counts.pending, caption: "Waiting for approval", icon: CircleDot, tint: "bg-amber-50 text-amber-700" },
    { label: "Unpublished", value: counts.unpublished, caption: "Hidden from customers", icon: Ban, tint: "bg-gray-100 text-gray-600" },
  ];

  const handleUpdateStatus = (id, newStatus) => {
    const rejectionReason = rejectionReasons[id]?.trim() || "";
    setConfirmModal({
      isOpen: true,
      title: `Update Experience Status to ${newStatus}`,
      message: `Are you sure you want to mark this experience as ${newStatus}?`,
      action: async () => {
        setConfirmModal((previous) => ({ ...previous, loading: true }));
        try {
          await adminApi.reviewWorkshop(id, {
            action: newStatus === "PUBLISHED" ? "APPROVE" : "REJECT",
            ...(newStatus === "REJECTED" ? { rejectionReason } : {}),
          });
          setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false });
          await fetchExperiences(true);
        } catch (err) {
          alert("Error: " + err.message);
          setConfirmModal((previous) => ({ ...previous, loading: false }));
        }
      },
    });
  };
  const clearFilters = () => { setSearch(""); setAppliedSearch(""); setStatusFilter(""); };
  const filtersActive = Boolean(appliedSearch || statusFilter);

  return <main className="mx-auto max-w-7xl space-y-6 pb-12 pt-6">
    <h1 className="sr-only">Workshop Review</h1>
    <section aria-label="Workshop overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && experiences.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-16 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : stats.map((stat) => <article key={stat.label} className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{stat.label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.tint}`}><stat.icon className="h-5 w-5" aria-hidden="true" /></span></div><p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{stat.value}</p><p className="mt-2 text-[13px] text-gray-500">{stat.caption}</p></article>)}
    </section>

    <section aria-label="Workshop filters" className="space-y-4">
      <div role="group" aria-label="Filter workshops by status" className="flex w-full max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{statusTabs.map((tab) => <button key={tab.value || "ALL"} type="button" aria-pressed={statusFilter === tab.value} onClick={() => setStatusFilter(tab.value)} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${statusFilter === tab.value ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-200 bg-white text-gray-600 hover:border-orange-200 hover:bg-orange-50"}`}>{tab.label}<span className={`text-xs ${statusFilter === tab.value ? "text-white/80" : "text-gray-400"}`}>{tab.count}</span></button>)}</div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search); }} className="relative w-full md:max-w-[560px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input type="search" aria-label="Search workshops" placeholder="Search workshop title, location, kitchen..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-11 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
        </form>
        <p className="text-right text-sm text-gray-500">Showing {visibleExperiences.length} of {experiences.length} workshops</p>
      </div>

      {error ? <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={() => void fetchExperiences(true)} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Try again</button></section>
        : loading && experiences.length === 0 ? <section aria-label="Loading workshops" className="space-y-5">{[1, 2, 3].map((item) => <WorkshopCardSkeleton key={item} />)}</section>
          : visibleExperiences.length === 0 ? <section className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Sparkles className="h-6 w-6" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-semibold text-[#2B1B12]">No workshops found</h2><p className="mt-1 text-sm text-gray-500">Try a different search or status filter.</p>{filtersActive && <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl bg-[#D2552B] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button>}</section>
            : <section aria-label="Workshops" className="space-y-5">{visibleExperiences.map((experience) => <WorkshopCard key={experience.id} experience={experience} rejectionReason={rejectionReasons[experience.id] || ""} onReasonChange={(id, value) => setRejectionReasons((previous) => ({ ...previous, [id]: value }))} onReview={handleUpdateStatus} />)}</section>}
    </section>

    <ConfirmationModal isOpen={confirmModal.isOpen} title={confirmModal.title} message={confirmModal.message} loading={confirmModal.loading} onConfirm={() => confirmModal.action?.()} onCancel={() => setConfirmModal({ isOpen: false, title: "", message: "", action: null, loading: false })} />
  </main>;
};

export const AdminExperiences = ({ experienceType = "HOME_DINING" }) => experienceType === "WORKSHOP" ? <AdminWorkshopReview /> : <AdminDineManagement />;

export default AdminExperiences;
