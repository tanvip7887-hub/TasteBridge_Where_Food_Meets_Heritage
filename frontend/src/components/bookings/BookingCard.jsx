import { CalendarDays, MapPin, Star, Ticket, Users } from "lucide-react";
import BookingThumbnail from "./BookingThumbnail.jsx";
import InfoItem from "./InfoItem.jsx";
import StatusChip from "./StatusChip.jsx";

export const BookingCard = ({ booking, group, pendingItem, onReview, paymentActions, cancellationAction, isDine, isWorkshop, formatDate, formatPrice, statusLabel }) => {
  if (!isDine && !isWorkshop) return <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
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
    {booking.status === "COMPLETED" && pendingItem && onReview && <button type="button" onClick={() => onReview(pendingItem)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-orange-50"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />Review this experience</button>}
    {booking.status === "CANCELLED" && booking.cancellationReason && <p className="mt-3 text-xs text-gray-600"><span className="font-semibold text-gray-800">Cancellation reason:</span> “{booking.cancellationReason}”</p>}
    {booking.status === "EXPIRED" && booking.cancellationStatus === "EXPIRED" && <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">The booking expired before the Cook reviewed the cancellation request. Its reserved seats have been released.</p>}
    {booking.status === "CANCELLED" && booking.refund && <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" aria-label="Simulated refund result"><p className="font-bold">Simulated refund {statusLabel(booking.refund.status)}</p><p>{formatPrice(booking.refund.amount)} {booking.refund.currency || "INR"} recorded against this booking.</p><p className="mt-1 text-xs font-medium">No real money was returned.</p></section>}
    {booking.status === "CANCELLED" && booking.cancellationStatus === "APPROVED" && !booking.refund && <p className="mt-3 text-sm text-gray-600">Cancellation approved. No refund was due because no successful payment was recorded.</p>}
    {cancellationAction}{paymentActions}
  </article>;

  if (isWorkshop) {
    const reference = booking.referenceId || booking.id;
    const groupText = group === "upcoming" ? "Upcoming" : group === "past" ? "Past" : "Cancelled";
    return <article className="group grid gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md sm:grid-cols-[140px_minmax(0,1fr)] sm:p-5">
      <BookingThumbnail booking={booking} type="workshop" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#68733F]">Workshop</p>
            <h3 className="mt-1 text-xl font-extrabold leading-tight text-[#2B1B12]">{booking.title || "TasteBridge workshop"}</h3>
            {booking.kitchenName && <p className="mt-1 text-xs text-gray-500">Hosted by {booking.kitchenName}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="Booking status">
            <StatusChip type="workshop" status={booking.status}>{statusLabel(booking.status)}</StatusChip>
            <StatusChip type="workshop" status={group}>{groupText}</StatusChip>
          </div>
        </div>
        <div className="mt-4 grid gap-3 border-t border-orange-50 pt-4 sm:grid-cols-2">
          <InfoItem icon={CalendarDays} label="Date and time" value={formatDate(booking.bookingDate)} />
          <InfoItem icon={MapPin} label="Location" value={booking.venue || "Venue not available"} />
          {Number.isInteger(booking.numberOfGuests) && <InfoItem icon={Users} label="Guests" value={`${booking.numberOfGuests} ${booking.numberOfGuests === 1 ? "guest" : "guests"}`} />}
          <InfoItem icon={Ticket} label="Booking reference" copyValue={reference} />
        </div>
        {booking.status === "COMPLETED" && pendingItem && onReview && <button type="button" onClick={() => onReview(pendingItem)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-[#D2552B] transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />Review this experience</button>}
        {booking.status === "CANCELLED" && booking.cancellationReason && <p className="mt-4 rounded-xl bg-[#FFF8F0] px-3 py-2 text-xs text-gray-600"><span className="font-semibold text-gray-800">Cancellation reason:</span> “{booking.cancellationReason}”</p>}
        {booking.status === "EXPIRED" && booking.cancellationStatus === "EXPIRED" && <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">The booking expired before the Cook reviewed the cancellation request. Its reserved seats have been released.</p>}
        {booking.status === "CANCELLED" && booking.refund && <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" aria-label="Simulated refund result"><p className="font-bold">Simulated refund {statusLabel(booking.refund.status)}</p><p>{formatPrice(booking.refund.amount)} {booking.refund.currency || "INR"} recorded against this booking.</p><p className="mt-1 text-xs font-medium">No real money was returned.</p></section>}
        {booking.status === "CANCELLED" && booking.cancellationStatus === "APPROVED" && !booking.refund && <p className="mt-4 text-sm text-gray-600">Cancellation approved. No refund was due because no successful payment was recorded.</p>}
        {cancellationAction}{paymentActions}
      </div>
    </article>;
  }

  const reference = booking.referenceId || booking.id;
  const groupText = group === "upcoming" ? "Upcoming" : group === "past" ? "Past" : "Cancelled";
  return <article className="group grid gap-5 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-5">
    <BookingThumbnail booking={booking} />
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#D2552B]">Home dining</p>
          <h3 className="mt-1 text-xl font-extrabold leading-tight text-[#2B1B12]">{booking.title || "TasteBridge event"}</h3>
          {booking.kitchenName && <p className="mt-1 text-xs text-gray-500">Hosted by {booking.kitchenName}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Booking status">
          <StatusChip status={booking.status}>{statusLabel(booking.status)}</StatusChip>
          <StatusChip status={group}>{groupText}</StatusChip>
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-orange-50 pt-4 sm:grid-cols-2">
        <InfoItem icon={CalendarDays} label="Date and time" value={formatDate(booking.bookingDate)} />
        <InfoItem icon={MapPin} label="Location" value={booking.venue || "Venue not available"} />
        {Number.isInteger(booking.numberOfGuests) && <InfoItem icon={Users} label="Guests" value={`${booking.numberOfGuests} ${booking.numberOfGuests === 1 ? "guest" : "guests"}`} />}
        <InfoItem icon={Ticket} label="Booking reference" copyValue={reference} />
      </div>
      {booking.status === "COMPLETED" && pendingItem && onReview && <button type="button" onClick={() => onReview(pendingItem)} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-[#D2552B] transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />Review this experience</button>}
      {booking.status === "CANCELLED" && booking.cancellationReason && <p className="mt-4 rounded-xl bg-[#FFF8F0] px-3 py-2 text-xs text-gray-600"><span className="font-semibold text-gray-800">Cancellation reason:</span> “{booking.cancellationReason}”</p>}
      {booking.status === "EXPIRED" && booking.cancellationStatus === "EXPIRED" && <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-700">The booking expired before the Cook reviewed the cancellation request. Its reserved seats have been released.</p>}
      {booking.status === "CANCELLED" && booking.refund && <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" aria-label="Simulated refund result"><p className="font-bold">Simulated refund {statusLabel(booking.refund.status)}</p><p>{formatPrice(booking.refund.amount)} {booking.refund.currency || "INR"} recorded against this booking.</p><p className="mt-1 text-xs font-medium">No real money was returned.</p></section>}
      {booking.status === "CANCELLED" && booking.cancellationStatus === "APPROVED" && !booking.refund && <p className="mt-4 text-sm text-gray-600">Cancellation approved. No refund was due because no successful payment was recorded.</p>}
      {cancellationAction}{paymentActions}
    </div>
  </article>;
};

export default BookingCard;
