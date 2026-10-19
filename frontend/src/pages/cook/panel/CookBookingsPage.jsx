import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck, Check, CheckCircle2, Clock, LoaderCircle, MapPin, RefreshCw, Users, X } from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { formatIstDateTime } from "../../../utils/istDateTime.js";
import { getScheduledCompletionAt, isCompletionAllowed } from "../../../utils/cookExperienceBooking.js";

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
    <div className="space-y-6 text-left animate-in fade-in duration-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12] tracking-tight">{isWorkshop ? "Workshop Bookings" : "Dine Bookings"}</h2>
          <p className="text-xs sm:text-sm text-[#2B1B12]/70 mt-1">Review {isWorkshop ? "workshop" : "home dining"} reservations and their status.</p>
        </div>
        <button type="button" onClick={() => void loadBookings()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-3 py-2 text-sm font-semibold text-[#2B1B12] hover:bg-[#D2552B]/5 disabled:opacity-60">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#2B1B12]/10">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" onClick={() => { setPage(1); setActiveTab(tab.id); }} aria-pressed={activeTab === tab.id} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-[#D2552B] text-white" : "bg-white text-[#2B1B12]/70 hover:bg-[#D2552B]/10 border border-[#2B1B12]/10"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <label className="block max-w-lg">
        <span className="sr-only">Search {isWorkshop ? "Workshop" : "Dine"} bookings</span>
        <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${isWorkshop ? "workshop" : "experience"}, customer, or reference`} className="w-full rounded-xl border border-[#2B1B12]/15 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#D2552B]" />
      </label>

      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{actionError}</div>}
      {actionSuccess && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{actionSuccess}</div>}
      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-3xl border border-[#2B1B12]/10 bg-white p-12 text-[#2B1B12]/70"><LoaderCircle className="animate-spin" size={20} /> Loading event bookings…</div>
      ) : error ? (
        <div className="rounded-3xl border border-red-200 bg-white p-8 text-center">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void loadBookings()} className="mt-4 rounded-xl bg-[#D2552B] px-4 py-2 text-sm font-bold text-white">Retry</button>
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#2B1B12]/10 p-8 sm:p-14 text-center space-y-3 shadow-xs">
          <div className="w-16 h-16 rounded-3xl bg-[#3E5B3A]/10 text-[#3E5B3A] flex items-center justify-center mx-auto"><CalendarCheck className="w-8 h-8" /></div>
          <h3 className="text-lg font-bold text-[#2B1B12]">No {tabs.find((tab) => tab.id === activeTab)?.label.toLowerCase()} bookings</h3>
          <p className="text-xs sm:text-sm text-[#2B1B12]/60">Reservations for your {isWorkshop ? "workshops" : "dining experiences"} will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleBookings.map((booking) => (
            <article key={booking.id} className="rounded-2xl border border-[#2B1B12]/10 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-bold text-[#2B1B12]">{booking.experience?.title || "TasteBridge experience"}</h3>
                  <p className="mt-1 text-xs text-[#2B1B12]/60">Booking reference: {booking.id}</p>
                  <div className="mt-3 grid gap-2 text-sm text-[#2B1B12]/75 sm:grid-cols-2">
                    <span className="inline-flex items-center gap-2"><Clock size={15} />{formatDate(booking.slot?.startsAt || booking.bookingDate)}{booking.slot?.endsAt ? ` – ${formatDate(booking.slot.endsAt)}` : ""}</span>
                    <span className="inline-flex items-center gap-2"><MapPin size={15} />{booking.experience?.location || "Venue details unavailable"}</span>
                    <span className="inline-flex items-center gap-2"><Users size={15} />{booking.numberOfGuests} {booking.numberOfGuests === 1 ? "guest" : "guests"}</span>
                    <span>Customer: {booking.customer?.name || "TasteBridge customer"}</span>
                    <span>Amount: ₹{Number(booking.totalAmountSnapshot ?? booking.totalAmount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>Payment: {booking.paymentAttempts?.[0]?.status || "UNPAID"}</span>
                    {booking.paymentAttempts?.[0]?.refund && <span>Refund: {booking.paymentAttempts[0].refund.status}{booking.paymentAttempts[0].refund.provider === "SIMULATED" ? " (simulated)" : ""}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${booking.status === "COMPLETED" ? "bg-green-50 text-green-700" : booking.status === "CANCELLED" ? "bg-gray-100 text-gray-600" : booking.cancellationStatus === "PENDING" ? "bg-amber-100 text-amber-900 border border-amber-300" : "bg-amber-50 text-amber-800"}`}>
                    {booking.cancellationStatus === "PENDING" ? "Cancellation requested" : booking.status.replaceAll("_", " ")}
                  </span>
                  {booking.status === "PENDING" && <>
                    <button type="button" onClick={() => void decideBooking(booking, "accept")} disabled={Boolean(actingId)} className="inline-flex items-center gap-2 rounded-xl bg-[#3E5B3A] px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">
                      {actingId === booking.id ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />} Accept
                    </button>
                    <button type="button" onClick={() => void decideBooking(booking, "reject")} disabled={Boolean(actingId)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:cursor-wait disabled:opacity-60">
                      {actingId === booking.id ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />} Reject
                    </button>
                  </>}
                  {booking.status === "ACCEPTED" && <span className="text-xs font-medium text-amber-800">Awaiting customer payment</span>}
                  {booking.status === "CONFIRMED" && (
                    booking.cancellationStatus === "PENDING" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 border border-amber-200">
                        Awaiting cancellation decision
                      </span>
                    ) : isCompletionAllowed(booking, now) ? (
                      <button
                        type="button"
                        onClick={() => void completeBooking(booking)}
                        disabled={Boolean(actingId)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-3 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60"
                      >
                        {actingId === booking.id ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark completed
                      </button>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 border border-blue-200/80"
                        title={(() => {
                          const end = getScheduledCompletionAt(booking);
                          return end ? `Can be completed after ${formatDate(end)}` : "Authoritative schedule timestamp unavailable";
                        })()}
                      >
                        <Clock size={13} aria-hidden="true" />
                        {(() => {
                          const startRaw = booking.slot?.startsAt || booking.bookingDate;
                          const start = startRaw ? new Date(startRaw) : null;
                          const isStarted = start && Number.isFinite(start.getTime()) && now >= start;
                          return isStarted ? "Experience in progress" : "Experience scheduled";
                        })()}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Pending Cancellation Review Banner */}
              {booking.cancellationStatus === "PENDING" && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-xs text-amber-950">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold uppercase tracking-wider text-amber-900 text-[11px]">Guest cancellation request</span>
                    {booking.cancellationRequestedAt && (
                      <span className="text-amber-800/80">Requested {formatDate(booking.cancellationRequestedAt)}</span>
                    )}
                  </div>
                  <div className="mt-2 rounded-lg bg-white/90 p-3 border border-amber-200">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-1">Reason provided by guest:</p>
                    <p className="text-sm font-medium text-[#2B1B12]">“{booking.cancellationReason}”</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleApproveCancellation(booking)}
                      disabled={Boolean(actingId)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60 shadow-xs"
                    >
                      {actingId === booking.id ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />} Approve Cancellation
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectModalBooking(booking);
                        setRejectionReason("");
                      }}
                      disabled={Boolean(actingId)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 shadow-xs"
                    >
                      <X size={14} /> Reject Cancellation
                    </button>
                  </div>
                </div>
              )}

              {/* Cook Rejection Decision Banner */}
              {booking.cancellationStatus === "REJECTED" && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">Cancellation request declined</span>
                  {booking.cancellationDecisionReason && (
                    <span className="ml-1 text-gray-600">— Reason: “{booking.cancellationDecisionReason}”</span>
                  )}
                </div>
              )}

              {/* Cancelled booking reason */}
              {booking.status === "CANCELLED" && booking.cancellationReason && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-700">
                  <span className="font-semibold text-gray-900">Cancellation reason:</span> “{booking.cancellationReason}”
                </div>
              )}

              {booking.status === "COMPLETED" && booking.completedAt && <p className="mt-3 text-xs text-green-700">Completed {formatDate(booking.completedAt)}</p>}
            </article>
          ))}
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
