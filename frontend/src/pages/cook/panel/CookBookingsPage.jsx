import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, Check, CheckCircle2, Clock, Copy, CreditCard, IndianRupee, LoaderCircle, MapPin, Search, UtensilsCrossed, UserRound, Users, X } from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { formatIstDateTime } from "../../../utils/istDateTime.js";
import { getScheduledCompletionAt, isCompletionAllowed } from "../../../utils/cookExperienceBooking.js";
import { copyBookingReference, getExperienceImage } from "../../../utils/bookingPresentation.js";

const tabs = [
  { id: "PENDING", label: "Requests" },
  { id: "ACCEPTED", label: "Awaiting payment" },
  { id: "CONFIRMED", label: "Upcoming reservations" },
  { id: "COMPLETED", label: "Completed" },
  { id: "REJECTED", label: "Declined" },
  { id: "EXPIRED", label: "Expired" },
  { id: "CANCELLED", label: "Cancelled" },
];

const readItems = (response) => {
  const payload = response?.data?.data ?? response?.data ?? response;
  if (!Array.isArray(payload?.items)) throw new Error("Event bookings could not be read. Please retry.");
  return payload.items;
};

const formatDate = formatIstDateTime;

const formatTime = (value) => {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(new Date(value));
};

const formatBookingSchedule = (start, end) => {
  if (!end) return formatDate(start);
  if (!start || !Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) return `${formatDate(start)} – ${formatDate(end)}`;
  const startDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(start));
  const endDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(end));
  return `${formatDate(start)} – ${startDate === endDate ? formatTime(end) : formatDate(end)}`;
};

const formatBookingAmount = (booking, isWorkshop = false) => {
  if (!isWorkshop) {
    const snapshot = booking.totalAmountSnapshot ?? booking.totalAmount;
    const amount = snapshot !== null && snapshot !== undefined
      ? Number(snapshot)
      : Number(booking.pricePerPersonSnapshot ?? booking.pricePerPerson ?? booking.experience?.pricePerPerson) * Number(booking.numberOfGuests);
    if (!Number.isFinite(amount)) return "—";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  }

  const toAmount = (value) => value === null || value === undefined || value === "" ? null : Number(value);
  const succeededPayment = booking.paymentAttempts?.find((attempt) => ["SUCCEEDED", "PAID"].includes(String(attempt.status || "").toUpperCase()));
  const savedAmounts = [booking.totalAmountSnapshot, booking.totalAmount, booking.amountPaid, booking.paidAmount, succeededPayment?.amount]
    .map(toAmount);
  let amount = savedAmounts.find(Number.isFinite);
  if (amount === undefined) {
    const price = toAmount(booking.pricePerPersonSnapshot ?? booking.pricePerPerson ?? booking.experience?.pricePerPerson);
    const guests = toAmount(booking.numberOfGuests);
    if (Number.isFinite(price) && Number.isFinite(guests)) amount = price * guests;
  }
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
};

const paymentLabel = (status) => ["SUCCEEDED", "PAID"].includes(String(status || "UNPAID").toUpperCase()) ? "PAID" : "UNPAID";

function BookingExperienceImage({ experience, isWorkshop = false }) {
  const categories = experience.theme ? [{ name: experience.theme, slug: experience.theme }] : [];
  const image = isWorkshop
    ? { src: experience.image || experience.photos?.[0] || null, alt: experience.title || "Workshop poster" }
    : getExperienceImage(experience, 800, categories);
  const [failedSource, setFailedSource] = useState(null);
  const imageClass = `aspect-video w-full rounded-xl min-[768px]:aspect-[4/3] min-[768px]:w-[200px] ${isWorkshop ? "bg-[#F2ECE4] object-contain" : "object-cover"}`;
  if (!image.src || failedSource === image.src) return <div className="grid aspect-video w-full place-items-center rounded-xl bg-[#F7F2EC] text-[#A89A89] min-[768px]:aspect-[4/3] min-[768px]:w-[200px]" aria-label="Experience image unavailable"><UtensilsCrossed className="h-8 w-8" aria-hidden="true" /></div>;
  return <img src={image.src} alt={image.alt || experience.title || "Dining experience"} loading="lazy" onError={() => setFailedSource(image.src)} className={imageClass} />;
}

function StatusBadge({ booking }) {
  const className = booking.status === "COMPLETED" ? "bg-green-50 text-green-700"
    : booking.status === "CANCELLED" ? "bg-gray-100 text-gray-600"
      : booking.cancellationStatus === "PENDING" ? "border border-amber-300 bg-amber-100 text-amber-900"
        : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex min-h-7 items-center rounded-full px-3 py-1 text-xs font-bold ${className}`}>{booking.cancellationStatus === "PENDING" ? "Cancellation requested" : booking.status.replaceAll("_", " ")}</span>;
}

function PaymentBadge({ status }) {
  const label = paymentLabel(status);
  const paid = label === "PAID";
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 py-1 text-xs font-bold ${paid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{label}</span>;
}

function BookingTabs({ activeTab, bookings, onSelect }) {
  return <nav aria-label="Booking status tabs" className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-[#2B1B12]/10 pb-2 scrollbar-none">
    {tabs.map((tab) => {
      const count = bookings.filter((booking) => booking.status === tab.id).length;
      const active = activeTab === tab.id;
      return <button key={tab.id} type="button" onClick={() => onSelect(tab.id)} aria-pressed={active} className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${active ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-[#2B1B12]/10 bg-white text-[#2B1B12]/70 hover:bg-[#D2552B]/10"}`}>
        <span>{tab.label}</span><span className={`rounded-full px-1.5 py-0.5 text-xs font-extrabold ${active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-700"}`}>{count}</span>
      </button>;
    })}
  </nav>;
}

function BookingDetails({ booking, isWorkshop = false }) {
  const experience = booking.experience || {};
  const start = booking.slot?.startsAt || booking.bookingDate;
  const end = booking.slot?.endsAt;
  const attemptStatus = booking.paymentAttempts?.[0]?.status || "UNPAID";
  return <div className="grid gap-4 min-[768px]:grid-cols-[200px_minmax(0,1fr)] min-[768px]:items-start">
    <BookingExperienceImage experience={experience} isWorkshop={isWorkshop} />
    <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 min-[768px]:grid-cols-2">
      <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><Clock size={14} aria-hidden="true" />Date & time</dt><dd className="mt-1 text-sm font-medium text-[#2B1B12]">{formatBookingSchedule(start, end)}</dd></div>
      <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><MapPin size={14} aria-hidden="true" />Location</dt><dd className="mt-1 text-sm font-medium text-[#2B1B12]">{experience.location || "Venue details unavailable"}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><Users size={14} aria-hidden="true" />Guests</dt><dd className="mt-1 text-sm font-medium text-[#2B1B12]">{booking.numberOfGuests} {booking.numberOfGuests === 1 ? "guest" : "guests"}</dd></div>
      <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><UserRound size={14} aria-hidden="true" />Customer</dt><dd className="mt-1 truncate text-sm font-medium text-[#2B1B12]" title={booking.customer?.name || "TasteBridge customer"}>{booking.customer?.name || "TasteBridge customer"}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><IndianRupee size={14} aria-hidden="true" />Amount</dt><dd className="mt-1 text-sm font-bold text-[#2B1B12]">{formatBookingAmount(booking, isWorkshop)}</dd></div>
      <div><dt className="flex items-center gap-1.5 text-xs text-[#2B1B12]/55"><CreditCard size={14} aria-hidden="true" />Payment</dt><dd className="mt-1"><PaymentBadge status={attemptStatus} /></dd></div>
      {booking.paymentAttempts?.[0]?.refund && <div><dt className="text-xs text-[#2B1B12]/55">Refund</dt><dd className="mt-1 text-sm font-medium text-[#2B1B12]">{booking.paymentAttempts[0].refund.status}{booking.paymentAttempts[0].refund.provider === "SIMULATED" ? " (simulated)" : ""}</dd></div>}
    </dl>
  </div>;
}

function BookingCard({ booking, actingId, now, isWorkshop = false, onDecide, onComplete, onApproveCancellation, onRequestRejectCancellation }) {
  const [copied, setCopied] = useState(false);
  const title = booking.experience?.title || "TasteBridge experience";
  const message = booking.status === "PENDING" ? "Review and respond to this booking request."
    : booking.status === "ACCEPTED" ? "This booking is awaiting customer payment."
      : booking.status === "CONFIRMED" ? "This reservation is confirmed."
        : booking.status === "COMPLETED" ? "This experience has been completed."
          : booking.status === "REJECTED" ? "This booking request was declined."
            : booking.status === "EXPIRED" ? "The booking request expired without confirmation."
              : "This booking has been cancelled.";
  const copyReference = async () => {
    try { await copyBookingReference(booking.id); setCopied(true); }
    catch { setCopied(false); }
  };

  return <article className="rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
    <header className="flex flex-col gap-3 min-[768px]:flex-row min-[768px]:items-center min-[768px]:justify-between">
      <div className="min-w-0">
        <h2 className="truncate text-base font-extrabold text-[#2B1B12] sm:text-lg" title={title}>{title}</h2>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[#2B1B12]/60">
          <span className="shrink-0">Booking ref:</span><span className="min-w-0 truncate" title={booking.id}>{booking.id}</span>
          <button type="button" onClick={() => void copyReference()} aria-label="Copy reference" title={copied ? "Copied" : "Copy reference"} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#2B1B12]/60 transition-colors hover:bg-orange-50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Copy size={15} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="flex shrink-0 self-start min-[768px]:self-center"><StatusBadge booking={booking} /></div>
    </header>

    <div className="my-4 border-t border-[#2B1B12]/10" />
    <BookingDetails booking={booking} isWorkshop={isWorkshop} />

    <footer className="mt-4 flex flex-col gap-3 border-t border-[#2B1B12]/10 pt-4 min-[768px]:flex-row min-[768px]:items-center min-[768px]:justify-between">
      <p className="text-sm text-[#2B1B12]/60">{message}</p>
      <div className="flex w-full flex-col gap-2 min-[768px]:w-auto min-[768px]:shrink-0 min-[768px]:flex-row min-[768px]:gap-3">
        {booking.status === "PENDING" && <>
          <button type="button" onClick={() => void onDecide(booking, "accept")} disabled={Boolean(actingId)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#3E5B3A] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 min-[768px]:w-auto">
            {actingId === booking.id ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}Accept
          </button>
          <button type="button" onClick={() => void onDecide(booking, "reject")} disabled={Boolean(actingId)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-60 min-[768px]:w-auto">
            {actingId === booking.id ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <X size={16} aria-hidden="true" />}Reject
          </button>
        </>}
        {booking.status === "ACCEPTED" && <span className="inline-flex min-h-11 items-center text-sm font-medium text-amber-800">Awaiting customer payment</span>}
        {booking.status === "CONFIRMED" && (
          booking.cancellationStatus === "PENDING" ? <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-900">Awaiting cancellation decision</span>
            : isCompletionAllowed(booking, now) ? <button type="button" onClick={() => void onComplete(booking)} disabled={Boolean(actingId)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 min-[768px]:w-auto">{actingId === booking.id ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}Mark completed</button>
              : <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50 px-3 text-xs font-medium text-blue-800" title={(() => { const end = getScheduledCompletionAt(booking); return end ? `Can be completed after ${formatDate(end)}` : "Authoritative schedule timestamp unavailable"; })()}><Clock size={13} aria-hidden="true" />{(() => { const start = booking.slot?.startsAt || booking.bookingDate; const startDate = start ? new Date(start) : null; return startDate && Number.isFinite(startDate.getTime()) && now >= startDate ? "Experience in progress" : "Experience scheduled"; })()}</span>
        )}
      </div>
    </footer>

    {booking.cancellationStatus === "PENDING" && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold uppercase tracking-wider text-amber-900 text-xs">Guest cancellation request</span>{booking.cancellationRequestedAt && <span className="text-xs text-amber-800/80">Requested {formatDate(booking.cancellationRequestedAt)}</span>}</div>
      <div className="mt-2 rounded-lg border border-amber-200 bg-white/90 p-3"><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Reason provided by guest:</p><p className="text-sm font-medium text-[#2B1B12]">“{booking.cancellationReason}”</p></div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => void onApproveCancellation(booking)} disabled={Boolean(actingId)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-red-700 px-3.5 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60">{actingId === booking.id ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}Approve Cancellation</button>
        <button type="button" onClick={() => onRequestRejectCancellation(booking)} disabled={Boolean(actingId)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"><X size={15} />Reject Cancellation</button>
      </div>
    </div>}
    {booking.cancellationStatus === "REJECTED" && <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold text-gray-900">Cancellation request declined</span>{booking.cancellationDecisionReason && <span className="ml-1 text-gray-600">— Reason: “{booking.cancellationDecisionReason}”</span>}</div>}
    {booking.status === "CANCELLED" && booking.cancellationReason && <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"><span className="font-semibold text-gray-900">Cancellation reason:</span> “{booking.cancellationReason}”</div>}
    {booking.status === "COMPLETED" && booking.completedAt && <p className="mt-3 text-xs text-green-700">Completed {formatDate(booking.completedAt)}</p>}
  </article>;
}

function EmptyState({ activeTab, isWorkshop }) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label.toLowerCase();
  return <section className="space-y-3 rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white p-8 text-center shadow-xs sm:p-12" aria-label="No bookings">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3E5B3A]/10 text-[#3E5B3A]"><CalendarCheck className="h-7 w-7" aria-hidden="true" /></div>
    <h2 className="text-lg font-bold text-[#2B1B12]">{activeTab === "PENDING" ? "No booking requests yet" : `No ${activeLabel} bookings yet`}</h2>
    <p className="text-sm text-[#2B1B12]/60">Reservations for your {isWorkshop ? "workshops" : "dining experiences"} will appear here.</p>
  </section>;
}

export const CookBookingsPage = ({ experienceType = "HOME_DINING" }) => {
  const isWorkshop = experienceType === "WORKSHOP";
  const [bookings, setBookings] = useState([]);
  const [activeTab, setActiveTab] = useState("CONFIRMED");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actingId, setActingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [rejectModalBooking, setRejectModalBooking] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const actingIdRef = useRef(null);
  const now = new Date();

  const loadBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = isWorkshop
        ? await cookApi.getWorkshopExperienceBookings()
        : await cookApi.getExperienceBookings();
      setBookings(readItems(response));
    } catch (requestError) {
      setError(requestError?.message || "Event bookings could not be loaded.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isWorkshop]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void loadBookings(); });
    return () => { active = false; };
  }, [loadBookings]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadBookings({ silent: true });
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadBookings]);

  useEffect(() => {
    if (!isWorkshop || !actionSuccess) return undefined;
    const timeoutId = window.setTimeout(() => setActionSuccess(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [actionSuccess, isWorkshop]);

  const matchingBookings = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return bookings.filter((booking) => {
      if (booking.status !== activeTab) return false;
      if (!term) return true;
      return [booking.id, booking.experience?.title, booking.customer?.name, booking.customer?.email]
        .some((value) => String(value || "").toLocaleLowerCase().includes(term));
    });
  }, [bookings, activeTab, search]);
  const totalPages = Math.max(1, Math.ceil(matchingBookings.length / pageSize));
  const displayedPage = Math.min(page, totalPages);
  const visibleBookings = matchingBookings.slice((displayedPage - 1) * pageSize, displayedPage * pageSize);

  const decideBooking = async (booking, decision) => {
    if (actingIdRef.current) return;
    actingIdRef.current = booking.id;
    setActingId(booking.id);
    setActionError("");
    setActionSuccess("");
    try {
      if (decision === "accept") await cookApi.acceptExperienceBooking(booking.id);
      else await cookApi.rejectExperienceBooking(booking.id);
      setActionSuccess(decision === "accept"
        ? "Booking accepted. It is now awaiting customer payment."
        : "Booking request declined and its held seats were released.");
      setActiveTab(decision === "accept" ? "ACCEPTED" : "REJECTED");
      setPage(1);
      await loadBookings({ silent: true });
    } catch (requestError) {
      if (requestError?.status === 409) {
        setActionError("This booking was already processed or its response window expired. The list has been refreshed.");
        await loadBookings({ silent: true });
      } else {
        setActionError(requestError?.message || "The booking decision could not be saved. Please retry.");
      }
    } finally {
      actingIdRef.current = null;
      setActingId(null);
    }
  };

  const completeBooking = async (booking) => {
    if (actingIdRef.current) return;
    if (booking?.cancellationStatus === "PENDING") {
      setActionError("This booking has a pending cancellation request and cannot be completed.");
      return;
    }
    if (!isCompletionAllowed(booking, now)) {
      setActionError("A confirmed booking cannot be completed before its scheduled experience has ended.");
      return;
    }
    if (!window.confirm(`Confirm that “${booking.experience?.title || "this event"}” took place?`)) return;
    actingIdRef.current = booking.id;
    setActingId(booking.id);
    setActionError("");
    setActionSuccess("");
    try {
      await cookApi.completeExperienceBooking(booking.id);
      setActionSuccess("Booking marked completed.");
      await loadBookings({ silent: true });
      setActiveTab("COMPLETED");
    } catch (requestError) {
      const serverMessage = requestError?.response?.data?.message || requestError?.message;
      if (requestError?.status === 409 || requestError?.response?.status === 409) {
        setActionError(serverMessage || "This booking changed before completion. The list has been refreshed.");
        await loadBookings({ silent: true });
      } else {
        setActionError(serverMessage || "The booking could not be completed. Please retry.");
      }
    } finally {
      actingIdRef.current = null;
      setActingId(null);
    }
  };

  const handleApproveCancellation = async (booking) => {
    if (actingIdRef.current) return;
    if (!window.confirm(`Approve cancellation for “${booking.experience?.title || "this booking"}”? This will cancel the booking, restore the reserved seats, and record a simulated refund when a successful payment exists. No real money will be returned.`)) return;
    actingIdRef.current = booking.id;
    setActingId(booking.id);
    setActionError("");
    setActionSuccess("");
    try {
      await cookApi.approveExperienceCancellation(booking.id);
      setActionSuccess("Cancellation approved. Booking cancelled, seats restored, and the customer notified. Any refund is simulated; no real money was returned.");
      await loadBookings({ silent: true });
    } catch (requestError) {
      const serverMessage = requestError?.response?.data?.message || requestError?.message;
      setActionError(serverMessage || "Failed to approve cancellation. Please retry.");
      await loadBookings({ silent: true });
    } finally {
      actingIdRef.current = null;
      setActingId(null);
    }
  };

  const handleConfirmRejectCancellation = async () => {
    if (!rejectModalBooking || actingIdRef.current) return;
    actingIdRef.current = rejectModalBooking.id;
    setActingId(rejectModalBooking.id);
    setActionError("");
    setActionSuccess("");
    try {
      await cookApi.rejectExperienceCancellation(rejectModalBooking.id, rejectionReason.trim());
      setActionSuccess(`Cancellation request declined. The booking remains ${String(rejectModalBooking.status || "active").toLowerCase()} and the customer has been notified.`);
      setRejectModalBooking(null);
      setRejectionReason("");
      await loadBookings({ silent: true });
    } catch (requestError) {
      const serverMessage = requestError?.response?.data?.message || requestError?.message;
      setActionError(serverMessage || "Failed to decline cancellation request. Please retry.");
      await loadBookings({ silent: true });
    } finally {
      actingIdRef.current = null;
      setActingId(null);
    }
  };

  return (
    <div className={`space-y-6 text-left animate-in fade-in duration-200 ${isWorkshop ? "-mt-4 pt-6 sm:-mt-6 lg:-mt-8" : ""}`}>
      {isWorkshop ? (
        <div>
          <h1 className="sr-only">Workshop Bookings</h1>
          <div className="space-y-4">
            <BookingTabs activeTab={activeTab} bookings={bookings} onSelect={(tab) => { setPage(1); setActionSuccess(""); setActiveTab(tab); }} />
            <label className="block w-full max-w-[560px]">
              <span className="sr-only">Search Workshop bookings</span>
              <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search workshop, customer, or reference" className="h-11 w-full rounded-xl border border-[#2B1B12]/15 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#D2552B]" /></span>
            </label>
          </div>
        </div>
      ) : (
        <>
          <h1 className="sr-only">Dine Bookings</h1>
          <div className="space-y-4">
            <BookingTabs activeTab={activeTab} bookings={bookings} onSelect={(tab) => { setPage(1); setActiveTab(tab); }} />
            <label className="block w-full max-w-[560px]">
              <span className="sr-only">Search Dine bookings</span>
              <span className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search experience, customer, or reference" className="h-11 w-full rounded-xl border border-[#2B1B12]/15 bg-white pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#D2552B]" /></span>
            </label>
          </div>
        </>
      )}

      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}
      {actionSuccess && <div role="status" className={`flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800 ${isWorkshop ? "min-h-11 -mb-2" : ""}`}><span>{actionSuccess}</span>{isWorkshop && <button type="button" aria-label="Dismiss" onClick={() => setActionSuccess("")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"><X size={16} aria-hidden="true" /></button>}</div>}
      {loading ? (
        <section role="status" aria-label="Loading event bookings" className="space-y-5"><span className="sr-only">Loading event bookings…</span>{[1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6"><div className="flex justify-between gap-4"><div className="h-5 w-48 rounded bg-orange-100" /><div className="h-7 w-24 rounded-full bg-orange-100" /></div><div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]"><div className="aspect-[4/3] rounded-xl bg-[#F2ECE4]" /><div className="grid grid-cols-2 gap-4"><div className="h-10 rounded bg-gray-100" /><div className="h-10 rounded bg-gray-100" /><div className="h-10 rounded bg-gray-100" /><div className="h-10 rounded bg-gray-100" /></div></div></div>)}</section>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-white p-8 text-center">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void loadBookings()} className="mt-4 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-bold text-white">Retry</button>
        </div>
      ) : visibleBookings.length === 0 ? (
        <EmptyState activeTab={activeTab} isWorkshop={isWorkshop} />
      ) : (
        <div className="space-y-5">
          {visibleBookings.map((booking) => <BookingCard
            key={booking.id}
            booking={booking}
            actingId={actingId}
            now={now}
            isWorkshop={isWorkshop}
            onDecide={decideBooking}
            onComplete={completeBooking}
            onApproveCancellation={handleApproveCancellation}
            onRequestRejectCancellation={(selected) => { setRejectModalBooking(selected); setRejectionReason(""); }}
          />)}
        </div>
      )}

      {!loading && !error && matchingBookings.length > 0 && totalPages > 1 && (
        <nav aria-label={`${isWorkshop ? "Workshop" : "Dine"} booking pages`} className="flex items-center justify-between rounded-xl border border-[#2B1B12]/10 bg-white px-4 py-3 text-sm">
          <span className="text-[#2B1B12]/60">{matchingBookings.length} bookings · page {displayedPage} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={displayedPage <= 1} onClick={() => setPage(displayedPage - 1)} className="rounded-lg border border-[#2B1B12]/15 px-3 py-1.5 disabled:opacity-40">Previous</button>
            <button type="button" disabled={displayedPage >= totalPages} onClick={() => setPage(displayedPage + 1)} className="rounded-lg border border-[#2B1B12]/15 px-3 py-1.5 disabled:opacity-40">Next</button>
          </div>
        </nav>
      )}

      {/* Reject Cancellation Dialog */}
      {rejectModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="reject-cancellation-title">
            <h2 id="reject-cancellation-title" className="text-xl font-bold text-[#2B1B12]">Decline cancellation request</h2>
            <p className="mt-2 text-sm text-gray-600">
              Declining will keep this booking active and its seats reserved. The customer will be notified of your decision.
            </p>
            <div className="mt-4">
              <label htmlFor="rejection-reason" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                Reason for declining (optional)
              </label>
              <textarea
                id="rejection-reason"
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why cancellation cannot be accepted (e.g. ingredients already prepared)..."
                className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm text-[#2B1B12] focus:border-[#D2552B] focus:outline-none focus:ring-1 focus:ring-[#D2552B]"
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectModalBooking(null);
                  setRejectionReason("");
                }}
                disabled={actingId === rejectModalBooking.id}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectCancellation}
                disabled={actingId === rejectModalBooking.id}
                className="rounded-xl bg-[#2B1B12] px-4 py-2 text-sm font-bold text-white hover:bg-black disabled:cursor-wait disabled:opacity-60"
              >
                {actingId === rejectModalBooking.id ? "Declining…" : "Decline cancellation"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CookBookingsPage;
