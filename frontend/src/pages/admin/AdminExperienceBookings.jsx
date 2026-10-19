import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarCheck2, RefreshCw, Search } from "lucide-react";
import adminApi from "../../api/adminApi.js";
import { formatIstDateTime } from "../../utils/istDateTime.js";

const PAGE_SIZE = 20;
const payloadOf = (response) => response?.data?.data ?? response?.data ?? response;
const money = (value, currency = "INR") => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amount)
    : "Amount unavailable";
};

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
  const requestId = useRef(0);
  const controllerRef = useRef(null);

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
      if (!Array.isArray(data?.bookings)) throw new Error("Booking records could not be read. Please refresh.");
      setBookings(data.bookings);
      setPagination(data.pagination || { total: data.bookings.length, page, limit: PAGE_SIZE, pages: 1 });
    } catch (requestError) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setError(requestError?.message || "Bookings could not be loaded. Please retry.");
    } finally {
      if (id === requestId.current) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, [isWorkshop, page, paymentStatus, search, status]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void loadBookings(); });
    return () => {
      active = false;
      controllerRef.current?.abort();
      requestId.current += 1;
    };
  }, [loadBookings]);

  const submitSearch = (event) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };
  const updateFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  return (
    <section className="space-y-5" aria-labelledby="experience-bookings-title">
      <header className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="experience-bookings-title" className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <CalendarCheck2 className="h-6 w-6 text-red-600" /> {isWorkshop ? "Workshop Bookings" : "Dine Bookings"}
          </h2>
          <p className="mt-1 text-sm text-gray-500">Read-only booking records for {isWorkshop ? "approved workshops" : "home dining experiences"}.</p>
        </div>
        <button type="button" onClick={() => void loadBookings()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input aria-label="Search bookings" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, Cook, customer or booking ID" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm" />
        </form>
        <select aria-label="Filter booking status" value={status} onChange={updateFilter(setStatus)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
          <option value="">All booking statuses</option>
          {["PENDING", "ACCEPTED", "CONFIRMED", "COMPLETED", "CANCELLED", "EXPIRED", "REJECTED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
        <select aria-label="Filter payment status" value={paymentStatus} onChange={updateFilter(setPaymentStatus)} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm">
          <option value="">All payment statuses</option>
          {["UNPAID", "PENDING", "SUCCEEDED", "FAILED", "EXPIRED"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
        </select>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" className="ml-2 font-bold underline" onClick={() => void loadBookings()}>Retry</button></div>}
      {loading ? <div role="status" className="rounded-2xl bg-white p-10 text-center text-sm text-gray-500">Loading bookings…</div>
        : !error && bookings.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No {isWorkshop ? "workshop" : "Dine"} bookings match these filters.</div>
          : !error && <div className="space-y-4">
            {bookings.map((booking) => {
              const payment = booking.paymentAttempts?.[0];
              const refund = payment?.refund;
              return <article key={booking.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h3 className="text-lg font-bold text-gray-900">{booking.experience?.title || "Experience"}</h3><p className="text-xs text-gray-500">Booking {booking.id}</p></div>
                  <div className="flex flex-wrap gap-2"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{booking.status?.replaceAll("_", " ") || "Status unavailable"}</span>{booking.cancellationStatus && <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900">Cancellation {booking.cancellationStatus.toLowerCase()}</span>}</div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-xs text-gray-500">Cook</dt><dd>{booking.experience?.cook?.businessName || booking.experience?.cook?.user?.name || "Unavailable"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Customer</dt><dd>{booking.customer?.name || "Unavailable"}{booking.customer?.email ? ` · ${booking.customer.email}` : ""}</dd></div>
                  <div><dt className="text-xs text-gray-500">Schedule (IST)</dt><dd>{formatIstDateTime(booking.slot?.startsAt || booking.bookingDate)}{booking.slot?.endsAt ? ` – ${formatIstDateTime(booking.slot.endsAt)}` : ""}</dd></div>
                  <div><dt className="text-xs text-gray-500">Participants</dt><dd>{booking.numberOfGuests ?? "Unavailable"}</dd></div>
                  <div><dt className="text-xs text-gray-500">Booking amount</dt><dd>{money(booking.totalAmountSnapshot ?? booking.totalAmount)}</dd></div>
                  <div><dt className="text-xs text-gray-500">Payment</dt><dd>{payment ? `${payment.status.replaceAll("_", " ")} · ${money(payment.amount, payment.currency)}` : "No payment attempt"}{payment?.verificationMode === "SIMULATED" ? " · Simulated" : ""}</dd></div>
                </dl>
                {booking.cancellationReason && <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm"><strong>Cancellation reason:</strong> {booking.cancellationReason}</p>}
                {booking.cancellationDecisionReason && <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm"><strong>Decision:</strong> {booking.cancellationDecisionReason}</p>}
                {refund && <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm"><strong>Refund record:</strong> {refund.status} · {money(refund.amount, refund.currency)}{refund.verificationMode === "SIMULATED" ? " · Simulated; no real money was returned" : ""}</p>}
              </article>;
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
              <span>{pagination.total} booking{pagination.total === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {page} of {Math.max(1, pagination.pages || 1)}</span><button type="button" disabled={page >= (pagination.pages || 1) || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
            </div>
          </div>}
    </section>
  );
};

export default AdminExperienceBookings;
