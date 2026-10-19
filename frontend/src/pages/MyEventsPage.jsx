import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, CreditCard, MapPin, RefreshCw, Star, Ticket, Users } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import eventsApi from "../api/eventsApi.js";
import { groupBookings } from "../utils/eventBookings.js";
import { usePendingReviews } from "../components/reviews/usePendingReviews.js";
import CustomerReviewModal from "../components/reviews/CustomerReviewModal.jsx";
import { TasteBridgePayModal } from "../components/checkout/TasteBridgePayModal.jsx";
import { DINE_PAYMENT_ATTEMPT_LIMIT, dinePaymentState, formatPaymentCountdown } from "../utils/dinePaymentState.js";
import { dineCancellationState } from "../utils/dineCancellationState.js";
import { createServerClock, formatIstDateTime, readServerClock } from "../utils/istDateTime.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const statusLabel = (status) => String(status || "UNKNOWN").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatDate = formatIstDateTime;
const BOOKINGS_PER_PAGE = 10;
const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));

const CancellationAction = ({ booking, now, busy, error, notice, onRequestCancel }) => {
  const state = dineCancellationState(booking, now);
  const confirmed = booking?.status === "CONFIRMED";
  const cancellableStatus = ["PENDING", "ACCEPTED", "CONFIRMED"].includes(booking?.status);

  if (booking?.cancellationStatus === "PENDING") {
    return (
      <section className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5" aria-label="Cancellation request status">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 border border-amber-300">
            Cancellation requested · Awaiting Cook review
          </span>
          {booking.cancellationRequestedAt && (
            <span className="text-xs text-amber-800">
              Requested {formatDate(booking.cancellationRequestedAt)}
            </span>
          )}
        </div>
        {booking.cancellationReason && (
          <p className="mt-2 text-xs text-amber-950 font-medium">
            <span className="font-semibold text-amber-800">Your reason:</span> “{booking.cancellationReason}”
          </p>
        )}
        <p className="text-xs text-amber-800/90">
          Your reservation remains active and your seats remain held while the Cook reviews your request.
        </p>
        {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
        {notice && <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p>}
      </section>
    );
  }

  if (!cancellableStatus) {
    if (notice || error) {
      return (
        <section className="mt-4 space-y-2" aria-label="Booking cancellation">
          {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
          {notice && <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p>}
        </section>
      );
    }
    return null;
  }

  return (
    <section className="mt-4 space-y-2" aria-label="Booking cancellation">
      {booking.cancellationStatus === "REJECTED" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 font-medium">
          The Cook declined your previous cancellation request{booking.cancellationDecisionReason ? `: “${booking.cancellationDecisionReason}”` : "."} Your booking remains {statusLabel(booking.status).toLowerCase()}.
        </div>
      )}
      {state.eligible ? (
        <>
          {confirmed && <p className="text-sm text-gray-600">Cancel by {formatDate(state.deadline)} for a simulated full refund. No real money will be returned.</p>}
          {!confirmed && <p className="text-sm text-gray-600">This unpaid booking can be cancelled before {formatDate(state.deadline)}. No refund is due.</p>}
          <button
            type="button"
            onClick={() => onRequestCancel(booking)}
            disabled={busy}
            className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Submitting…" : "Cancel booking"}
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-500">{state.reason || "Cancellation is not available for this booking."}</p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p>}
    </section>
  );
};


const BookingCard = ({ booking, group, pendingItem, onReview, paymentActions, cancellationAction }) => (
  <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">Experience booking</p>
        <h3 className="mt-1 text-lg font-bold text-[#2B1B12]">{booking.title || "TasteBridge event"}</h3>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${group === "cancelled" ? "bg-red-50 text-red-700" : group === "past" ? "bg-gray-100 text-gray-700" : "bg-emerald-50 text-emerald-800"}`}>
        {statusLabel(booking.status)} · {group === "upcoming" ? "Upcoming" : group === "past" ? "Past" : "Cancelled"}
      </span>
    </div>
    <div className="mt-4 grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
      <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span>{formatDate(booking.bookingDate)}</span></p>
      <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span>{booking.venue || "Venue not available"}</span></p>
      {Number.isInteger(booking.numberOfGuests) && <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span>{booking.numberOfGuests} {booking.numberOfGuests === 1 ? "guest" : "guests"}</span></p>}
      <p className="flex items-start gap-2"><Ticket className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span className="break-all">Reference: {booking.referenceId || booking.id}</span></p>
      {Number.isInteger(booking.availableSeats) && <p className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span>{booking.availableSeats} {booking.availableSeats === 1 ? "seat" : "seats"} available in slot</span></p>}
    </div>
    {booking.status === "COMPLETED" && pendingItem && onReview && (
      <button
        type="button"
        onClick={() => onReview(pendingItem)}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-orange-50"
      >
        <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
        Review this experience
      </button>
    )}
    {booking.status === "CANCELLED" && booking.cancellationReason && (
      <p className="mt-3 text-xs text-gray-600">
        <span className="font-semibold text-gray-800">Cancellation reason:</span> “{booking.cancellationReason}”
      </p>
    )}
    {booking.status === "EXPIRED" && booking.cancellationStatus === "EXPIRED" && (
      <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
        The booking expired before the Cook reviewed the cancellation request. Its reserved seats have been released.
      </p>
    )}
    {booking.status === "CANCELLED" && booking.refund && (
      <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" aria-label="Simulated refund result">
        <p className="font-bold">Simulated refund {statusLabel(booking.refund.status)}</p>
        <p>{formatPrice(booking.refund.amount)} {booking.refund.currency || "INR"} recorded against this booking.</p>
        <p className="mt-1 text-xs font-medium">No real money was returned.</p>
      </section>
    )}
    {booking.status === "CANCELLED" && booking.cancellationStatus === "APPROVED" && !booking.refund && (
      <p className="mt-3 text-sm text-gray-600">Cancellation approved. No refund was due because no successful payment was recorded.</p>
    )}
    {cancellationAction}
    {paymentActions}
  </article>
);

const DinePaymentActions = ({ booking, now, busy, error, onOutcome, notice, onOpenModal }) => {
  const state = dinePaymentState(booking, now);
  const paymentRelevant = booking.status === "ACCEPTED" || state.attempts.length > 0;
  if (!paymentRelevant) return null;
  const deadlineLabel = state.deadlineValid ? formatDate(booking.paymentExpiresAt) : "Unavailable";
  const latestAttempt = state.attempts.at(-1);
  return (
    <section className="mt-5 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Simulated experience payment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-amber-950">Payment</h4>
        {state.succeeded && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">Payment succeeded</span>}
        {!state.succeeded && latestAttempt && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-700">Latest attempt: {statusLabel(latestAttempt.status)}</span>}
      </div>
      <p className="text-sm text-amber-950">Payment deadline: {deadlineLabel}</p>
      {booking.totalAmount !== undefined && <p className="text-sm font-semibold text-amber-950">Amount: {formatPrice(booking.totalAmount)}</p>}
      {booking.status === "ACCEPTED" && state.deadlineValid && !state.expired && <p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><Clock3 className="h-4 w-4" aria-hidden="true" />Time remaining: <span aria-live="off">{formatPaymentCountdown(state.remainingMilliseconds)}</span></p>}
      {booking.status === "ACCEPTED" && state.deadlineValid && !state.clockValid && <p role="status" className="text-sm text-amber-900">Server time could not be verified, so the countdown and payment actions are unavailable. Refresh your bookings.</p>}
      <p className="text-xs text-amber-900">Attempts used: {state.attempts.length} / {DINE_PAYMENT_ATTEMPT_LIMIT}. Simulated payment only; no money is charged.</p>
      {state.attempts.length > 0 && <ul className="space-y-1 text-xs text-gray-700" aria-label="Payment attempt history">{state.attempts.map((attempt) => <li key={attempt.id}>Attempt {attempt.attemptNumber}: {statusLabel(attempt.status)} · {formatDate(attempt.createdAt)}</li>)}</ul>}
      {state.eligible && <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpenModal ? onOpenModal(booking) : onOutcome(booking, "success")} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 shadow-xs">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          Pay now
        </button>
      </div>}
      {!state.succeeded && booking.status === "ACCEPTED" && state.expired && <p className="text-sm font-semibold text-red-800">The payment window has expired. Refresh to see the server-updated booking status.</p>}
      {!state.succeeded && state.attemptLimitReached && <p className="text-sm font-semibold text-red-800">The maximum of three payment attempts has been reached.</p>}
      {!state.succeeded && booking.status !== "ACCEPTED" && <p className="text-sm text-gray-700">This booking is no longer waiting for payment.</p>}
      {error && <p className="text-sm font-semibold text-red-800" role="alert">{error}</p>}
      {notice && <p className="text-sm font-semibold text-emerald-800" role="status">{notice}</p>}
      {booking.status === "ACCEPTED" && <p className="text-xs leading-5 text-amber-900">The server controls the original deadline and attempt limit. Your booking is not confirmed unless the server confirms simulated payment success.</p>}
    </section>
  );
};

const BookingSection = ({ title, group, bookings, page, onPageChange, getPendingBookingItem, onReview, now, paymentBusyId, paymentErrors, paymentNotices, onPaymentOutcome, onOpenPaymentModal, cancellationBusyId, cancellationErrors, cancellationNotices, onRequestCancel }) => {
  if (!bookings.length) return null;
  const pageCount = Math.ceil(bookings.length / BOOKINGS_PER_PAGE);
  const visiblePage = Math.min(page, pageCount);
  const visibleBookings = bookings.slice((visiblePage - 1) * BOOKINGS_PER_PAGE, visiblePage * BOOKINGS_PER_PAGE);
  return <section className="space-y-3" aria-label={title}>
    <h2 className="text-lg font-bold text-[#2B1B12]">{title}<span className="ml-2 text-sm font-medium text-gray-500">({bookings.length})</span></h2>
    <div className="grid gap-4">
      {visibleBookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          group={group}
          pendingItem={getPendingBookingItem ? getPendingBookingItem(booking.id) : null}
          onReview={onReview}
          cancellationAction={<CancellationAction booking={booking} now={now} busy={cancellationBusyId === booking.id} error={cancellationErrors[booking.id]} notice={cancellationNotices[booking.id]} onRequestCancel={onRequestCancel} />}
          paymentActions={<DinePaymentActions booking={booking} now={now} busy={paymentBusyId === booking.id} error={paymentErrors[booking.id]} notice={paymentNotices[booking.id]} onOutcome={onPaymentOutcome} onOpenModal={onOpenPaymentModal} />}
        />
      ))}
    </div>
    {pageCount > 1 && <nav className="flex items-center justify-between rounded-xl border border-orange-100 bg-white px-4 py-3" aria-label={`${title} booking pages`}>
      <span className="text-sm text-gray-600">Page {visiblePage} of {pageCount}</span>
      <div className="flex gap-2"><button type="button" disabled={visiblePage <= 1} onClick={() => onPageChange(Math.max(1, visiblePage - 1))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button><button type="button" disabled={visiblePage >= pageCount} onClick={() => onPageChange(Math.min(pageCount, visiblePage + 1))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button></div>
    </nav>}
  </section>;
};

export const MyEventsPage = ({ experienceType = "HOME_DINING" }) => {
  const isWorkshop = experienceType === "WORKSHOP";
  const location = useLocation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [sectionPages, setSectionPages] = useState({ upcoming: 1, past: 1, cancelled: 1 });
  const [reviewTarget, setReviewTarget] = useState(null);
  const [now, setNow] = useState(null);
  const [paymentBusyId, setPaymentBusyId] = useState(null);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [paymentNotices, setPaymentNotices] = useState({});
  const [cancellationTarget, setCancellationTarget] = useState(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [cancellationReasonError, setCancellationReasonError] = useState("");
  const [cancellationBusyId, setCancellationBusyId] = useState(null);
  const [cancellationErrors, setCancellationErrors] = useState({});
  const [cancellationNotices, setCancellationNotices] = useState({});
  const [modalBooking, setModalBooking] = useState(null);
  const [modalAttempt, setModalAttempt] = useState(null);
  const [modalStage, setModalStage] = useState("gateway");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const actionLock = useRef(false);
  const cancellationLock = useRef(false);
  const serverClock = useRef(null);
  const initiationKeys = useRef(new Map());
  const activeAttempts = useRef(new Map());

  const { getPendingBookingItem, refresh: refreshPending } = usePendingReviews();

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const requestStartedAt = performance.now();
      const payload = unwrap(await (isWorkshop
        ? eventsApi.getMyWorkshopBookings({ signal })
        : eventsApi.getMyDineBookings({ signal })));
      const responseReceivedAt = performance.now();
      if (!Array.isArray(payload?.items)) throw new Error("Event bookings could not be read. Please retry.");
      if (!signal?.aborted) {
        serverClock.current = createServerClock(payload.serverTime, requestStartedAt, responseReceivedAt);
        setNow(readServerClock(serverClock.current, responseReceivedAt));
        for (const booking of payload.items) {
          const pendingAttempt = booking.paymentAttempts?.find((attempt) => attempt.status === "PENDING");
          if (pendingAttempt) activeAttempts.current.set(booking.id, pendingAttempt);
          else activeAttempts.current.delete(booking.id);
        }
        setBookings(payload.items);
      }
    } catch (requestError) {
      if (!signal?.aborted) setError(requestError?.message || "Your event bookings could not be loaded.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [isWorkshop]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve().then(() => {
      if (active) void load(controller.signal);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [load, retry]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(readServerClock(serverClock.current, performance.now())), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handlePaymentOutcome = async (booking, mockOutcome) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setPaymentBusyId(booking.id);
    setPaymentErrors((current) => ({ ...current, [booking.id]: "" }));
    setPaymentNotices((current) => ({ ...current, [booking.id]: "" }));
    try {
      let attempt = activeAttempts.current.get(booking.id)
        || booking.paymentAttempts?.find((item) => item.status === "PENDING");
      if (!attempt) {
        let key = initiationKeys.current.get(booking.id);
        if (!key) {
          key = globalThis.crypto.randomUUID();
          initiationKeys.current.set(booking.id, key);
        }
        attempt = unwrap(await eventsApi.initiateDinePayment(booking.id, key));
        if (!attempt?.id || attempt.status !== "PENDING") throw new Error("The server did not return an active payment attempt.");
        initiationKeys.current.delete(booking.id);
        activeAttempts.current.set(booking.id, attempt);
      }
      const result = unwrap(await eventsApi.confirmDinePayment(booking.id, attempt.id, mockOutcome));
      if (!result?.booking?.status || !result?.paymentAttempt?.status) throw new Error("Payment result was incomplete. Refresh your booking history before retrying.");
      activeAttempts.current.delete(booking.id);
      setPaymentNotices((current) => ({
        ...current,
        [booking.id]: result.paymentAttempt.status === "SUCCEEDED"
          ? `Server confirmed simulated payment. Booking status: ${statusLabel(result.booking.status)}.`
          : `Simulated payment ${statusLabel(result.paymentAttempt.status).toLowerCase()}. Booking status: ${statusLabel(result.booking.status)}.`,
      }));
      await load();
    } catch (requestError) {
      setPaymentErrors((current) => ({ ...current, [booking.id]: requestError?.message || "Payment could not be recorded. Retry safely or refresh your bookings." }));
    } finally {
      actionLock.current = false;
      setPaymentBusyId(null);
    }
  };

  const handleOpenPaymentModal = async (booking) => {
    setModalBooking(booking);
    setModalError("");
    setModalBusy(true);
    try {
      let attempt = activeAttempts.current.get(booking.id)
        || booking.paymentAttempts?.find((item) => item.status === "PENDING");
      if (!attempt) {
        let key = initiationKeys.current.get(booking.id);
        if (!key) {
          key = globalThis.crypto.randomUUID();
          initiationKeys.current.set(booking.id, key);
        }
        attempt = unwrap(await eventsApi.initiateDinePayment(booking.id, key));
        if (!attempt?.id || attempt.status !== "PENDING") {
          throw new Error("The server did not return an active payment attempt.");
        }
        initiationKeys.current.delete(booking.id);
        activeAttempts.current.set(booking.id, attempt);
      }
      setModalAttempt(attempt);
      setModalStage(attempt.status === "PENDING" ? "gateway" : attempt.status === "SUCCEEDED" ? "success" : "failure");
    } catch (requestError) {
      setModalError(requestError?.response?.data?.message || requestError?.message || "Payment attempt could not be initiated.");
      setModalStage("failure");
    } finally {
      setModalBusy(false);
    }
  };

  const handleModalConfirm = async (mockOutcome) => {
    if (!modalBooking || modalBusy) return;
    setModalBusy(true);
    setModalStage("processing");
    setModalError("");
    const outcome = typeof mockOutcome === "string" ? mockOutcome.toLowerCase() : mockOutcome;
    try {
      let attempt = modalAttempt || activeAttempts.current.get(modalBooking.id)
        || modalBooking.paymentAttempts?.find((item) => item.status === "PENDING");
      if (!attempt) {
        let key = initiationKeys.current.get(modalBooking.id);
        if (!key) {
          key = globalThis.crypto.randomUUID();
          initiationKeys.current.set(modalBooking.id, key);
        }
        attempt = unwrap(await eventsApi.initiateDinePayment(modalBooking.id, key));
        if (!attempt?.id || attempt.status !== "PENDING") throw new Error("The server did not return an active payment attempt.");
        initiationKeys.current.delete(modalBooking.id);
        activeAttempts.current.set(modalBooking.id, attempt);
        setModalAttempt(attempt);
      }
      const result = unwrap(await eventsApi.confirmDinePayment(modalBooking.id, attempt.id, outcome));
      if (!result?.booking?.status || !result?.paymentAttempt?.status) {
        throw new Error("Payment result was incomplete. Refresh your booking history before retrying.");
      }
      activeAttempts.current.delete(modalBooking.id);
      setModalAttempt(result.paymentAttempt);
      if (result.paymentAttempt.status === "SUCCEEDED") {
        setModalStage("success");
      } else {
        setModalStage("failure");
        setModalError("The simulated payment failed or was declined. You can retry with a new attempt if the payment deadline is active.");
      }
      await load();
    } catch (requestError) {
      setModalError(requestError?.response?.data?.message || requestError?.message || "Payment could not be recorded. Retry safely or refresh your bookings.");
      setModalStage("failure");
      await load();
    } finally {
      setModalBusy(false);
    }
  };

  const handleCloseModal = () => {
    setModalBooking(null);
    setModalAttempt(null);
    setModalStage("gateway");
    setModalError("");
  };

  const handleModalRetry = () => {
    setModalAttempt(null);
    setModalStage("gateway");
    setModalError("");
    if (modalBooking) {
      handleOpenPaymentModal(modalBooking);
    }
  };

  const handleCancellation = async () => {
    const booking = cancellationTarget;
    if (!booking || cancellationLock.current || !dineCancellationState(booking, now).eligible) return;
    const trimmed = cancellationReason.trim();
    if (!trimmed || trimmed.length < 5) {
      setCancellationReasonError("Please enter a cancellation reason of at least 5 characters.");
      return;
    }
    if (trimmed.length > 500) {
      setCancellationReasonError("Cancellation reason cannot exceed 500 characters.");
      return;
    }
    cancellationLock.current = true;
    setCancellationBusyId(booking.id);
    setCancellationErrors((current) => ({ ...current, [booking.id]: "" }));
    setCancellationNotices((current) => ({ ...current, [booking.id]: "" }));
    try {
      unwrap(await eventsApi.cancelDineBooking(booking.id, trimmed));
      setCancellationNotices((current) => ({
        ...current,
        [booking.id]: "Cancellation request submitted. The Cook has been notified to review your request.",
      }));
      setCancellationTarget(null);
      setCancellationReason("");
      setCancellationReasonError("");
      await load();
    } catch (requestError) {
      setCancellationErrors((current) => ({
        ...current,
        [booking.id]: requestError?.response?.data?.message || requestError?.message || "Cancellation request could not be submitted. Refresh your bookings and retry safely.",
      }));
      await load();
    } finally {
      cancellationLock.current = false;
      setCancellationBusyId(null);
    }
  };

  const groups = groupBookings(bookings);
  const hasBookings = bookings.length > 0;
  const createdDineBooking = location.state?.createdDineBooking;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#D2552B]">Customer Panel</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">{isWorkshop ? "Workshop Bookings" : "Dine Bookings"}</h1>
          <p className="mt-2 text-sm text-gray-600">{isWorkshop ? "Your cooking workshop bookings and updates." : "Your Home Dining bookings and updates."}</p>
        </div>
        <Link to="/my-events" className="text-sm font-semibold text-[#D2552B] hover:underline">All event types</Link>
        <button type="button" onClick={() => setRetry((value) => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </header>

      {createdDineBooking?.status && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900" role="status">Your booking request was submitted. Current server status: {statusLabel(createdDineBooking.status)}. The Cook must accept it before payment is available.</p>}

      {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span><button type="button" onClick={() => setRetry((value) => value + 1)} className="font-bold underline">Retry</button></div>}
      {loading ? <div role="status" className="rounded-2xl border border-orange-100 bg-white py-14 text-center text-sm text-gray-600">Loading your events…</div>
        : error ? null
          : !hasBookings ? <section className="rounded-2xl border border-orange-100 bg-white px-6 py-14 text-center shadow-sm">
            <CalendarDays className="mx-auto h-10 w-10 text-orange-300" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold text-[#2B1B12]">No {isWorkshop ? "workshop" : "Dine"} bookings yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">Your {isWorkshop ? "workshop" : "Home Dining"} bookings will appear here.</p>
            <Link to="/explore" className="mt-5 inline-flex rounded-xl bg-[#D2552B] px-5 py-3 text-sm font-bold text-white hover:bg-red-700">Explore TasteBridge</Link>
          </section>
          : <div className="space-y-8">
            <BookingSection
              title="Upcoming"
              group="upcoming"
              bookings={groups.upcoming}
              page={sectionPages.upcoming}
              onPageChange={(value) => setSectionPages((current) => ({ ...current, upcoming: value }))}
              getPendingBookingItem={getPendingBookingItem}
              onReview={setReviewTarget}
              now={now} paymentBusyId={paymentBusyId} paymentErrors={paymentErrors} paymentNotices={paymentNotices} onPaymentOutcome={handlePaymentOutcome}
              onOpenPaymentModal={handleOpenPaymentModal}
              cancellationBusyId={cancellationBusyId} cancellationErrors={cancellationErrors} cancellationNotices={cancellationNotices} onRequestCancel={setCancellationTarget}
            />
            <BookingSection
              title="Past"
              group="past"
              bookings={groups.past}
              page={sectionPages.past}
              onPageChange={(value) => setSectionPages((current) => ({ ...current, past: value }))}
              getPendingBookingItem={getPendingBookingItem}
              onReview={setReviewTarget}
              now={now} paymentBusyId={paymentBusyId} paymentErrors={paymentErrors} paymentNotices={paymentNotices} onPaymentOutcome={handlePaymentOutcome}
              onOpenPaymentModal={handleOpenPaymentModal}
              cancellationBusyId={cancellationBusyId} cancellationErrors={cancellationErrors} cancellationNotices={cancellationNotices} onRequestCancel={setCancellationTarget}
            />
            <BookingSection
              title="Cancelled"
              group="cancelled"
              bookings={groups.cancelled}
              page={sectionPages.cancelled}
              onPageChange={(value) => setSectionPages((current) => ({ ...current, cancelled: value }))}
              getPendingBookingItem={getPendingBookingItem}
              onReview={setReviewTarget}
              now={now} paymentBusyId={paymentBusyId} paymentErrors={paymentErrors} paymentNotices={paymentNotices} onPaymentOutcome={handlePaymentOutcome}
              onOpenPaymentModal={handleOpenPaymentModal}
              cancellationBusyId={cancellationBusyId} cancellationErrors={cancellationErrors} cancellationNotices={cancellationNotices} onRequestCancel={setCancellationTarget}
            />
          </div>}

      <CustomerReviewModal
        isOpen={Boolean(reviewTarget)}
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onSuccess={() => {
          refreshPending();
        }}
      />

      {cancellationTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="cancel-booking-title" aria-describedby="cancel-booking-description">
          <h2 id="cancel-booking-title" className="text-xl font-bold text-[#2B1B12]">Cancel this booking?</h2>
          <p id="cancel-booking-description" className="mt-3 text-sm leading-6 text-gray-700">
            {cancellationTarget.status === "CONFIRMED"
              ? "Your cancellation request will be submitted to the Cook for review. Upon Cook approval, the booking will be cancelled and a full simulated refund will be recorded (no real money will be returned)."
              : "This booking is unpaid. Submitting a cancellation request will allow the Cook to release its reserved seats."}
          </p>
          <div className="mt-4">
            <label htmlFor="cancellation-reason" className="block text-xs font-bold uppercase tracking-wider text-gray-700">
              Reason for cancellation <span className="text-red-600">*</span>
            </label>
            <textarea
              id="cancellation-reason"
              rows={3}
              value={cancellationReason}
              onChange={(e) => {
                setCancellationReason(e.target.value);
                if (cancellationReasonError) setCancellationReasonError("");
              }}
              placeholder="Please explain why you need to cancel this booking (minimum 5 characters)..."
              className="mt-1.5 w-full rounded-xl border border-gray-300 p-3 text-sm text-[#2B1B12] focus:border-[#D2552B] focus:outline-none focus:ring-1 focus:ring-[#D2552B]"
            />
            {cancellationReasonError && (
              <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{cancellationReasonError}</p>
            )}
          </div>
          {cancellationErrors[cancellationTarget.id] && <p role="alert" className="mt-3 text-sm font-semibold text-red-800">{cancellationErrors[cancellationTarget.id]}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCancellationTarget(null);
                setCancellationReason("");
                setCancellationReasonError("");
              }}
              disabled={cancellationBusyId === cancellationTarget.id}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
            >
              Keep booking
            </button>
            <button
              type="button"
              onClick={handleCancellation}
              disabled={cancellationBusyId === cancellationTarget.id}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60"
            >
              {cancellationBusyId === cancellationTarget.id ? "Submitting…" : "Submit cancellation request"}
            </button>
          </div>
        </section>
      </div>}

      {modalBooking && (() => {
        const modalBookingState = dinePaymentState(modalBooking, now);
        return (
          <TasteBridgePayModal
            isOpen={Boolean(modalBooking)}
            onClose={handleCloseModal}
            title="TasteBridge Pay"
            subtitle="Choose a payment method"
            amount={modalAttempt?.amount ?? modalBooking.totalAmount}
            reference={modalAttempt?.reference || "TB-SIM-DEMO"}
            status={modalAttempt?.status || "PENDING"}
            countdown={modalBookingState.deadlineValid && !modalBookingState.expired ? formatPaymentCountdown(modalBookingState.remainingMilliseconds) : null}
            expired={modalBookingState.expired}
            details={
              <div className="space-y-1.5">
                <p className="font-bold text-gray-900">{modalBooking.title || "TasteBridge Experience"}</p>
                <p className="text-gray-600">{formatDate(modalBooking.bookingDate)} · {modalBooking.venue || "Venue not available"}</p>
                {Number.isInteger(modalBooking.numberOfGuests) && (
                  <p className="text-gray-600">{modalBooking.numberOfGuests} {modalBooking.numberOfGuests === 1 ? "guest" : "guests"}</p>
                )}
              </div>
            }
            paymentStage={modalStage}
            paymentBusy={modalBusy}
            paymentError={modalError}
            onConfirm={handleModalConfirm}
            onCancel={handleCloseModal}
            onRetry={handleModalRetry}
            successProps={{
              title: "Booking Payment Confirmed",
              description: `Your payment was confirmed and your ${isWorkshop ? "Workshop" : "Dine"} booking for ${modalBooking.title || "this experience"} is now confirmed! The Cook has been notified.`,
              actionLabel: "View your bookings",
              onAction: handleCloseModal,
            }}
            failureProps={{
              title: "Payment Not Completed",
              description: modalError || "Your payment could not be completed. Your booking seats remain held until the payment window expires.",
              backLabel: "Back to my events",
              retryLabel: "Try again",
            }}
          />
        );
      })()}
    </main>
  );
};

export default MyEventsPage;
