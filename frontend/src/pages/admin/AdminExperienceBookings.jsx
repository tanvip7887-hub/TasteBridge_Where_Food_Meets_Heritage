import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Ban, CalendarCheck2, CalendarDays, Clock3, Copy, CreditCard, IndianRupee, Search, UtensilsCrossed, UserRound, Users } from "lucide-react";
import adminApi from "../../api/adminApi.js";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import { copyBookingReference, getExperienceImage } from "../../utils/bookingPresentation.js";

const PAGE_SIZE = 20;
const STATUS_TABS = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Requests" },
  { id: "ACCEPTED", label: "Awaiting payment" },
  { id: "CONFIRMED", label: "Upcoming" },
  { id: "COMPLETED", label: "Completed" },
  { id: "REJECTED", label: "Declined" },
  { id: "EXPIRED", label: "Expired" },
  { id: "CANCELLED", label: "Cancelled" },
];

const payloadOf = (response) => response?.data?.data ?? response?.data ?? response;
const numericValue = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const amountFor = (booking) => {
  const candidates = [booking.totalAmountSnapshot, booking.totalAmount, booking.amountPaid, booking.paidAmount];
  for (const value of candidates) {
    const amount = numericValue(value);
    if (amount !== null) return amount;
  }
  const price = numericValue(booking.pricePerPersonSnapshot ?? booking.pricePerPerson ?? booking.experience?.pricePerPerson);
  const guests = numericValue(booking.numberOfGuests);
  return price !== null && guests !== null ? price * guests : null;
};
const money = (value) => Number.isFinite(value)
  ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : "Not available";
const formatTime = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(date) : "Time unavailable";
};
const schedule = (start, end) => {
  if (!start) return "Date unavailable";
  const startDate = new Date(start);
  if (!Number.isFinite(startDate.getTime())) return formatIstDateTime(start);
  const startLabel = formatIstDateTime(start);
  if (!end) return `${startLabel} (IST)`;
  const endDate = new Date(end);
  if (!Number.isFinite(endDate.getTime())) return `${startLabel} – ${formatIstDateTime(end)} (IST)`;
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(startDate)
    === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(endDate);
  return `${startLabel} – ${sameDay ? formatTime(end) : formatIstDateTime(end)} (IST)`;
};

function BookingStatusBadge({ booking }) {
  const status = String(booking.status || "UNKNOWN").toUpperCase();
  const styles = status === "COMPLETED" ? "bg-green-50 text-green-700"
    : status === "CANCELLED" || status === "REJECTED" ? "bg-gray-100 text-gray-700"
      : status === "EXPIRED" ? "bg-red-50 text-red-700"
        : booking.cancellationStatus === "PENDING" || status === "PENDING" || status === "ACCEPTED" ? "bg-amber-50 text-amber-800"
          : "bg-blue-50 text-blue-800";
  const label = booking.cancellationStatus === "PENDING" ? "Cancellation requested" : status.replaceAll("_", " ");
  return <span className={`inline-flex min-h-7 shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${styles}`}>{label}</span>;
}

function PaymentBadge({ payment, refund }) {
  const status = String(refund?.status === "SUCCEEDED" ? "REFUNDED" : payment?.status || "NO_ATTEMPT").toUpperCase();
  const paid = ["SUCCEEDED", "PAID"].includes(status);
  const warning = ["PENDING", "UNPAID", "NO_ATTEMPT", "EXPIRED"].includes(status);
  const style = paid ? "bg-green-50 text-green-700" : warning ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  const label = status === "NO_ATTEMPT" ? "No payment attempt" : status.replaceAll("_", " ");
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

function BookingImage({ experience, isWorkshop, categories }) {
  const image = isWorkshop
    ? { src: experience?.image || experience?.photos?.[0] || null, alt: experience?.title || "Workshop" }
    : getExperienceImage(experience, 800, categories);
  const [failedSource, setFailedSource] = useState(null);
  const failed = !image.src || failedSource === image.src;
  if (failed) return <div className="grid aspect-[16/9] w-full place-items-center rounded-xl bg-[#F7F2EC] text-[#A89A89] md:aspect-[4/3] md:h-[150px] md:w-[200px]" role="img" aria-label={`${experience?.title || "Experience"} image unavailable`}><UtensilsCrossed className="h-8 w-8" aria-hidden="true" /></div>;
  return <img src={image.src} alt={image.alt} loading="lazy" onError={() => setFailedSource(image.src)} className={`aspect-[16/9] max-h-[200px] w-full rounded-xl bg-gray-50 md:aspect-[4/3] md:h-[150px] md:w-[200px] ${isWorkshop ? "object-contain" : "object-cover"}`} />;
}

function Detail({ icon: Icon, label, children }) {
  return <div className="min-w-0">
    <dt className="flex items-center gap-1.5 text-xs font-medium text-[#2B1B12]/55"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{label}</dt>
    <dd className="mt-1 min-w-0 text-sm font-medium leading-5 text-[#2B1B12]">{children}</dd>
  </div>;
}

function BookingCard({ booking, isWorkshop, categories }) {
  const [copied, setCopied] = useState(false);
  const experience = booking.experience || {};
  const payment = booking.paymentAttempts?.[0];
  const refund = payment?.refund;
  const start = booking.slot?.startsAt || booking.bookingDate;
  const end = booking.slot?.endsAt;
  const amount = amountFor(booking);
  const statusMessage = booking.status === "PENDING" ? "Awaiting review."
    : booking.status === "ACCEPTED" ? "Awaiting customer payment."
      : booking.status === "CONFIRMED" ? "Reservation confirmed."
        : booking.status === "COMPLETED" ? "Experience completed."
          : booking.status === "REJECTED" ? "Booking declined."
            : booking.status === "EXPIRED" ? "Booking request expired."
              : "Booking cancelled.";

  const copyId = async () => {
    try {
      await copyBookingReference(booking.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };

  return <article className="min-w-0 rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-extrabold text-[#2B1B12] sm:text-lg" title={experience.title || "TasteBridge experience"}>{experience.title || "TasteBridge experience"}</h2>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[#2B1B12]/60">
          <span className="shrink-0">Booking ref:</span><span className="min-w-0 truncate" title={booking.id}>{booking.id}</span>
          <button type="button" onClick={() => void copyId()} aria-label="Copy booking ID" title={copied ? "Copied" : "Copy booking ID"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#2B1B12]/60 transition-colors hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Copy className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>
      <BookingStatusBadge booking={booking} />
    </header>

    <div className="my-4 border-t border-[#2B1B12]/10" />
    <div className="grid min-w-0 gap-4 md:grid-cols-[200px_minmax(0,1fr)] md:items-start md:gap-5">
      <BookingImage experience={experience} isWorkshop={isWorkshop} categories={categories} />
      <dl className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <Detail icon={Clock3} label="Date & time">{schedule(start, end)}</Detail>
        <Detail icon={CalendarCheck2} label="Cook / kitchen">{experience.cook?.businessName || experience.cook?.user?.name || "Unavailable"}</Detail>
        <Detail icon={UserRound} label="Customer"><span className="block truncate" title={booking.customer?.name || "Unavailable"}>{booking.customer?.name || "Unavailable"}</span>{booking.customer?.email && <span className="block truncate text-xs font-normal text-[#2B1B12]/55" title={booking.customer.email}>{booking.customer.email}</span>}</Detail>
        <Detail icon={Users} label="Participants">{booking.numberOfGuests ?? "Unavailable"} {Number(booking.numberOfGuests) === 1 ? "guest" : "guests"}</Detail>
        <Detail icon={IndianRupee} label="Booking amount">{money(amount)}</Detail>
        <Detail icon={CreditCard} label="Payment"><PaymentBadge payment={payment} refund={refund} />{payment?.verificationMode === "SIMULATED" && <span className="ml-2 text-xs font-normal text-[#2B1B12]/55">Simulated</span>}</Detail>
      </dl>
    </div>

    {(booking.cancellationReason || booking.cancellationDecisionReason || refund) && <div className="mt-4 space-y-2">
      {booking.cancellationReason && <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"><strong>Cancellation reason:</strong> {booking.cancellationReason}</p>}
      {booking.cancellationDecisionReason && <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700"><strong>Decision:</strong> {booking.cancellationDecisionReason}</p>}
      {refund && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800"><strong>Refund:</strong> {refund.status}{refund.amount != null ? ` · ${money(Number(refund.amount))}` : ""}</p>}
    </div>}

    <footer className="mt-4 flex flex-col gap-2 border-t border-[#2B1B12]/10 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[#2B1B12]/55">{booking.createdAt ? `Booked on ${formatIstDateTime(booking.createdAt).split(",")[0]}` : ""}</p>
      <p className="font-medium text-[#2B1B12]/65 sm:text-right">{statusMessage}</p>
    </footer>
  </article>;
}

function BookingSkeleton() {
  return <article aria-hidden="true" className="grid animate-pulse gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 md:grid-cols-[200px_minmax(0,1fr)]"><div className="aspect-[16/9] max-h-[200px] rounded-xl bg-gray-100 md:aspect-[4/3] md:h-[150px] md:w-[200px]" /><div className="space-y-4"><div className="h-6 w-1/2 rounded bg-gray-100" /><div className="grid grid-cols-2 gap-4"><div className="h-12 rounded bg-gray-100" /><div className="h-12 rounded bg-gray-100" /><div className="h-12 rounded bg-gray-100" /><div className="h-12 rounded bg-gray-100" /></div></div></article>;
}

function StatCard({ label, value, caption, icon: Icon, tint }) {
  return <article className="flex min-h-32 flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{label}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon className="h-5 w-5" aria-hidden="true" /></span></div>
    <p className="mt-3 text-[30px] font-bold leading-none text-[#2B1B12]">{value}</p><p className="mt-2 text-[13px] text-gray-500">{caption}</p>
  </article>;
}

export const AdminExperienceBookings = ({ experienceType = "HOME_DINING" }) => {
  const isWorkshop = experienceType === "WORKSHOP";
  const [bookings, setBookings] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_SIZE, pages: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState([]);
  const requestId = useRef(0);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (isWorkshop) return undefined;
    let active = true;
    adminApi.getFoodCategories().then((response) => {
      if (active) setCategories(Array.isArray(response.data) ? response.data : []);
    }).catch(() => {
      if (active) setCategories([]);
    });
    return () => { active = false; };
  }, [isWorkshop]);

  const loadBookings = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const params = { page, limit: PAGE_SIZE, ...(search && { search }), ...(status && { status }), ...(paymentStatus && { paymentStatus }) };
      const response = isWorkshop
        ? await adminApi.getWorkshopBookings(params, { signal: controller.signal })
        : await adminApi.getDineBookings(params, { signal: controller.signal });
      if (id !== requestId.current || controller.signal.aborted) return;
      const data = payloadOf(response);
      if (!Array.isArray(data?.bookings)) throw new Error("Booking records could not be read. Please retry.");
      setBookings(data.bookings);
      setPagination(data.pagination || { total: data.bookings.length, page, limit: PAGE_SIZE, pages: 1 });
    } catch (requestError) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setError(requestError?.message || "Bookings could not be loaded. Please retry.");
    } finally {
      if (id === requestId.current) { controllerRef.current = null; setLoading(false); }
    }
  }, [isWorkshop, page, paymentStatus, search, status]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void loadBookings(); });
    return () => { active = false; controllerRef.current?.abort(); requestId.current += 1; };
  }, [loadBookings]);

  const submitSearch = (event) => { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); };
  const updateFilter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  const activeTab = status || "ALL";
  const counts = Object.fromEntries(STATUS_TABS.map((tab) => [tab.id, tab.id === "ALL" ? pagination.total : bookings.filter((booking) => booking.status === tab.id).length]));
  const confirmedCount = bookings.filter((booking) => booking.status === "CONFIRMED").length;
  const pendingCount = bookings.filter((booking) => booking.status === "PENDING").length;
  const closedCount = bookings.filter((booking) => ["CANCELLED", "EXPIRED"].includes(booking.status)).length;
  const stats = [
    { label: "Total bookings", value: pagination.total, caption: "All matching records", icon: CalendarCheck2, tint: "bg-orange-50 text-[#D2552B]" },
    { label: "Confirmed / Upcoming", value: confirmedCount, caption: "Confirmed and completed", icon: BadgeCheck, tint: "bg-emerald-50 text-emerald-700" },
    { label: "Pending", value: pendingCount, caption: "Requests awaiting review", icon: Clock3, tint: "bg-amber-50 text-amber-700" },
    { label: "Cancelled / Expired", value: closedCount, caption: "Closed reservations", icon: Ban, tint: "bg-gray-100 text-gray-600" },
  ];

  return <main className="space-y-6 pb-12" aria-label={isWorkshop ? "Workshop bookings" : "Dine bookings"}>
    <h1 className="sr-only">{isWorkshop ? "Workshop Bookings" : "Dine Bookings"}</h1>
    <section aria-label="Booking overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading && bookings.length === 0 ? Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="min-h-32 animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-16 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>) : stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
    </section>

    <section className="space-y-4" aria-label="Filter bookings">
      <nav aria-label="Booking status tabs" className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-[#2B1B12]/10 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => { setStatus(tab.id === "ALL" ? "" : tab.id); setPage(1); }} aria-pressed={activeTab === tab.id} className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${activeTab === tab.id ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-[#2B1B12]/10 bg-white text-[#2B1B12]/70 hover:bg-[#D2552B]/10"}`}>
          <span>{tab.label}</span><span className={`rounded-full px-1.5 py-0.5 text-xs font-extrabold ${activeTab === tab.id ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"}`}>{counts[tab.id]}</span>
        </button>)}
      </nav>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form onSubmit={submitSearch} className="relative w-full flex-1 md:max-w-[560px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input aria-label="Search bookings" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, Cook, customer or booking ID" className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm text-[#2B1B12] outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-red-100" />
        </form>
        <select aria-label="Filter payment status" value={paymentStatus} onChange={updateFilter(setPaymentStatus)} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-[#2B1B12] md:w-auto md:min-w-52">
          <option value="">All payment statuses</option>{["UNPAID", "PENDING", "SUCCEEDED", "FAILED", "EXPIRED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </div>
    </section>

    {error ? <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-center text-sm text-red-800 shadow-sm"><p>{error}</p><button type="button" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#D2552B] px-4 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]" onClick={() => void loadBookings()}>Try again</button></section>
      : loading && bookings.length === 0 ? <section aria-label="Loading bookings" className="space-y-5">{[1, 2, 3].map((index) => <BookingSkeleton key={index} />)}</section>
        : bookings.length === 0 ? <section className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white px-5 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#3E5B3A]/10 text-[#3E5B3A]"><CalendarDays className="h-7 w-7" aria-hidden="true" /></span><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">No bookings found</h2><p className="mt-1 text-sm text-[#2B1B12]/60">No reservations match these filters.</p><button type="button" onClick={() => { setSearchInput(""); setSearch(""); setStatus(""); setPaymentStatus(""); setPage(1); }} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#2B1B12]/15 bg-white px-4 text-sm font-semibold text-[#2B1B12] hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear filters</button></section>
          : <section aria-label="Booking records" className="space-y-5">{bookings.map((booking) => <BookingCard key={booking.id} booking={booking} isWorkshop={isWorkshop} categories={categories} />)}</section>}

    <nav aria-label="Booking pagination" className="flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-5 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
      <span>{pagination.total} booking{pagination.total === 1 ? "" : "s"}</span>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
        <span className="whitespace-nowrap">Page {page} of {Math.max(1, pagination.pages || 1)}</span>
        <button type="button" disabled={page >= (pagination.pages || 1) || loading} onClick={() => setPage((value) => value + 1)} className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 font-semibold transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
      </div>
    </nav>
  </main>;
};

export default AdminExperienceBookings;
