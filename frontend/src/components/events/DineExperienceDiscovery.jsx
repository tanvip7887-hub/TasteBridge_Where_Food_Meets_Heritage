import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { AlertCircle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MapPin, RefreshCw } from "lucide-react";
import eventsApi from "../../api/eventsApi.js";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";
import { bookableGuestLimit, createDineBookingPayload, publicExperienceType, validateDineBookingSelection } from "../../utils/dineExperienceBooking.js";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import {
  getOrCreateDineBookingIdempotencyKey,
  isDefinitiveDineBookingRejection,
  isDefinitiveDineBookingSuccess,
  retireDineBookingIdempotencyKey,
} from "../../utils/dineBookingIdempotency.js";

const PAGE_SIZE = 12;
const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const formatDate = formatIstDateTime;
const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
const ExperienceCard = ({ experience, selection, onSelection, onBook, busy, error, detailView = false }) => {
  const slot = experience.slots?.find((item) => item.id === selection.slotId) || experience.slots?.[0];
  const guestLimit = slot ? bookableGuestLimit(experience, slot) : 0;
  const isWorkshop = experience.type === "WORKSHOP";
  const photo = experience.photos?.[0] || experience.image;
  return (
    <article className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
      {photo ? <img src={photo} alt={experience.title} className="h-52 w-full object-cover" loading="lazy" /> : <div className="flex h-52 items-center justify-center bg-orange-50 text-sm text-orange-700">Experience photo unavailable</div>}
      <div className="space-y-4 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#D2552B]">{experience.type === "WORKSHOP" ? "Workshop" : "Home dining"}{experience.isVegetarian ? " · Vegetarian" : ""}</p>
          <h2 className="mt-1 text-xl font-extrabold text-[#2B1B12]">{experience.title}</h2>
          {experience.theme && <p className="mt-1 text-sm font-medium text-gray-700">{experience.theme}</p>}
        </div>
        {experience.description && <p className="text-sm leading-6 text-gray-600">{experience.description}</p>}
        {isWorkshop && detailView && <div className="space-y-3 rounded-xl bg-orange-50/70 p-4 text-sm text-gray-700">
          <p><span className="font-semibold text-gray-900">What you will learn:</span> {experience.learningOutcomes}</p>
          <p><span className="font-semibold text-gray-900">What the Cook will teach:</span> {experience.teachingContent}</p>
          {experience.materialsToBring && <p><span className="font-semibold text-gray-900">Bring:</span> {experience.materialsToBring}</p>}
        </div>}
        <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
          {experience.cuisine && <p><span className="font-semibold">Cuisine:</span> {experience.cuisine}</p>}
          {experience.publicArea && <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" />{experience.publicArea}</p>}
          {Number.isFinite(Number(experience.durationMinutes)) && <p className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-[#D2552B]" aria-hidden="true" />{experience.durationMinutes} minutes</p>}
          <p className="font-bold">{formatPrice(experience.pricePerPerson)} <span className="font-normal text-gray-500">per person</span></p>
          {experience.cook?.businessName && <p><span className="font-semibold">Hosted by:</span> {experience.cook.businessName}</p>}
        </div>
        {experience.dietaryNotes && <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Dietary notes:</span> {experience.dietaryNotes}</p>}
        {experience.menuItems?.length > 0 && <div className="text-sm"><h3 className="font-semibold text-gray-800">Menu</h3><ul className="mt-1 list-inside list-disc text-gray-600">{experience.menuItems.map(({ dish, note }, index) => <li key={dish?.id || index}>{dish?.name || note}{dish?.cuisine ? ` · ${dish.cuisine}` : ""}</li>)}</ul></div>}
        {experience.inclusions?.length > 0 && <p className="text-sm text-gray-600"><span className="font-semibold text-gray-800">Includes:</span> {experience.inclusions.join(", ")}</p>}
        {isWorkshop && !detailView ? <div className="space-y-3 border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600">{experience.slots?.length ? `${experience.slots.length} upcoming date${experience.slots.length === 1 ? "" : "s"} with seats available` : "No upcoming dates with seats available"}</p>
          <Link to={`/workshops/${encodeURIComponent(experience.id)}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-3 text-sm font-bold text-white hover:bg-red-700">View workshop details<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div> : experience.slots?.length > 0 ? (
          <div className="space-y-3 border-t border-gray-100 pt-4">
            <label className="block space-y-1 text-sm font-semibold text-gray-800">Available date and time
              <select value={slot?.id || ""} onChange={(event) => onSelection({ ...selection, slotId: event.target.value, guestCount: Math.min(Number(selection.guestCount) || 1, bookableGuestLimit(experience, experience.slots.find((item) => item.id === event.target.value))) })} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-normal">
                {experience.slots.map((item) => <option key={item.id} value={item.id}>{formatDate(item.startsAt)} · {item.availableSeats} seats available</option>)}
              </select>
            </label>
            {slot?.endsAt && <p className="text-xs text-gray-500">Ends {formatDate(slot.endsAt)}</p>}
            <label className="block space-y-1 text-sm font-semibold text-gray-800">Guests
              <input type="number" min="1" max={guestLimit} step="1" value={selection.guestCount} onChange={(event) => onSelection({ ...selection, guestCount: event.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 font-normal" />
            </label>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button type="button" onClick={onBook} disabled={busy || guestLimit < 1} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60">
              {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Submitting request…</> : <>Request booking · {formatPrice(Number(experience.pricePerPerson) * (Number(selection.guestCount) || 0))}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
            </button>
            <p className="text-xs leading-5 text-gray-500">Your seats are requested first. The Cook must accept before payment is available. This page does not confirm your booking or take payment.</p>
          </div>
        ) : <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">No future slots currently have seats available.</p>}
      </div>
    </article>
  );
};

export const DineExperienceDiscovery = ({
  discoveryType,
  experienceId = "",
  categoryId = "",
  categoryName = "",
  categoriesPending = false,
  categoriesError = false,
  onRetryCategories,
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const [result, setResult] = useState({ identity: "", items: [], pagination: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [selections, setSelections] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [bookingErrors, setBookingErrors] = useState({});
  const [pageNotice, setPageNotice] = useState("");
  const submitLock = useRef(false);
  const pageValue = searchParams.get("page") || "1";
  const page = /^[1-9]\d*$/.test(pageValue) ? Number(pageValue) : 1;
  const sort = ["newest", "price_asc", "price_desc"].includes(searchParams.get("sort")) ? searchParams.get("sort") : "newest";
  const identity = `${discoveryType}:${experienceId}:${page}:${sort}:${categoryName}:${retry}`;
  const categoryUnavailable = Boolean(categoryId && !categoriesPending && !categoriesError && !categoryName);
  const pending = categoriesPending || (!categoriesError && !categoryUnavailable && result.identity !== identity);

  useEffect(() => {
    if (categoriesPending || categoriesError || categoryUnavailable) return undefined;
    const controller = new AbortController();
    const params = {
      type: publicExperienceType(discoveryType),
      page,
      limit: PAGE_SIZE,
      sort,
      ...(categoryName ? { cuisine: categoryName } : {}),
    };
    (experienceId
      ? eventsApi.getExperience(experienceId, { signal: controller.signal })
      : eventsApi.getExperiences(params, { signal: controller.signal }))
      .then((response) => {
        if (controller.signal.aborted) return;
        const payload = unwrap(response);
        if (experienceId && payload?.type !== "WORKSHOP") throw new Error("This workshop is no longer available.");
        const items = experienceId ? (payload?.id ? [payload] : []) : payload?.items;
        const pagination = experienceId ? { page: 1, limit: 1, total: items.length, totalPages: items.length ? 1 : 0 } : payload?.pagination;
        if (!Array.isArray(items) || !pagination) throw new Error("Experiences could not be read. Please try again.");
        setResult({ identity, items, pagination, error: "" });
        setSelections((current) => {
          const next = { ...current };
          for (const experience of items) {
            const currentSlot = experience.slots?.find((slot) => slot.id === current[experience.id]?.slotId);
            const slot = currentSlot || experience.slots?.[0];
            next[experience.id] = { slotId: slot?.id || "", guestCount: current[experience.id]?.guestCount || "1" };
          }
          return next;
        });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ identity, items: [], pagination: null, error: error?.message || "Experiences could not be loaded." });
      });
    return () => controller.abort();
  }, [categoriesError, categoriesPending, categoryName, categoryUnavailable, discoveryType, experienceId, identity, page, retry, sort]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, String(value)); else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  const submitBooking = async (experience) => {
    if (submitLock.current) return;
    if (!isAuthenticated) {
      setPageNotice("Sign in with a customer account to request this booking.");
      window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT));
      return;
    }
    if ((user?.activePortal || user?.role) !== "CUSTOMER") {
      setPageNotice("Switch to the Customer portal to request a booking.");
      return;
    }
    const selection = selections[experience.id] || {};
    const selectionError = validateDineBookingSelection({ experience, slotId: selection.slotId, guestCount: selection.guestCount });
    if (selectionError) {
      setBookingErrors((current) => ({ ...current, [experience.id]: selectionError }));
      return;
    }
    const requestIdentity = {
      customerId: String(user.id),
      experienceId: String(experience.id),
      slotId: String(selection.slotId),
      numberOfGuests: Number(selection.guestCount),
    };
    let idempotencyKey;
    try {
      submitLock.current = true;
      setBusyId(experience.id);
      setPageNotice("");
      setBookingErrors((current) => ({ ...current, [experience.id]: "" }));
      idempotencyKey = getOrCreateDineBookingIdempotencyKey(requestIdentity);
      const payload = createDineBookingPayload({ experience, slotId: selection.slotId, guestCount: selection.guestCount, idempotencyKey });
      const response = await eventsApi.createBooking(payload);
      const booking = unwrap(response);
      if (!isDefinitiveDineBookingSuccess(booking)) throw new Error("The server response did not include the booking status. Check My Events before retrying.");
      try { retireDineBookingIdempotencyKey(requestIdentity); } catch { /* A retained key safely replays the same request to the backend. */ }
      navigate("/my-events", { state: { createdDineBooking: { id: booking.id, status: booking.status } } });
    } catch (error) {
      let message = error?.message || "Booking request could not be submitted. Please retry.";
      if (idempotencyKey && isDefinitiveDineBookingRejection(error)) {
        try {
          retireDineBookingIdempotencyKey(requestIdentity);
        } catch {
          message = `${message} The retry key could not be cleared; retrying this exact request remains safe.`;
        }
      }
      setBookingErrors((current) => ({ ...current, [experience.id]: message }));
    } finally {
      submitLock.current = false;
      setBusyId(null);
    }
  };

  const title = experienceId ? "Workshop details" : discoveryType === "workshop" ? "Cooking workshops" : "Dining experiences";
  const listing = pending ? null : result;
  const clearCuisine = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("categoryId");
    next.delete("page");
    setSearchParams(next);
  };
  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>{experienceId && <Link to="/explore?type=workshop" className="text-sm font-semibold text-[#D2552B] hover:underline">← Back to workshops</Link>}<p className="text-sm font-semibold text-[#D2552B]">Discover TasteBridge</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">{categoryName ? `${categoryName} ${title.toLowerCase()}` : title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{experienceId ? "Review the workshop details and choose an available date before requesting a seat." : "Browse published experiences and request a seat. Available seats can change until the server accepts your booking request."}</p>{categoryId && !categoriesPending && !categoriesError && <button type="button" onClick={clearCuisine} className="mt-2 text-sm font-semibold text-[#D2552B] hover:underline">Clear cuisine filter</button>}</div>
        <label className="text-sm font-semibold text-gray-700">Sort
          <select value={sort} onChange={(event) => updateParam("sort", event.target.value)} className="ml-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5"><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
        </label>
      </header>
      {pageNotice && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{pageNotice}</p>}
      {categoriesPending ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-[#D2552B]" aria-hidden="true" />Loading cuisine…</div>
        : categoriesError ? <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><p className="font-semibold text-red-900">Cuisine filter unavailable</p><p className="mt-1 text-sm text-red-800">Categories could not be loaded.</p><button type="button" onClick={onRetryCategories} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">Retry</button></section>
          : categoryUnavailable ? <section className="rounded-2xl border border-orange-100 bg-white px-6 py-14 text-center"><h2 className="text-lg font-bold text-[#2B1B12]">Cuisine not found</h2><p className="mt-2 text-sm text-gray-600">This cuisine is no longer available.</p><button type="button" onClick={clearCuisine} className="mt-4 text-sm font-semibold text-[#D2552B] hover:underline">Browse all {title.toLowerCase()}</button></section>
        : pending ? <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-[#D2552B]" aria-hidden="true" />Loading experiences…</div>
        : listing.error ? <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert"><AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" /><p className="mt-3 font-semibold text-red-900">Experiences unavailable</p><p className="mt-1 text-sm text-red-800">{listing.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800"><RefreshCw className="h-4 w-4" aria-hidden="true" />Retry</button></section>
          : !listing.items.length ? <section className="rounded-2xl border border-orange-100 bg-white px-6 py-14 text-center"><CalendarDays className="mx-auto h-10 w-10 text-orange-300" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">No available experiences yet</h2><p className="mt-2 text-sm text-gray-600">Published experiences with future open slots will appear here.</p></section>
            : <>
              <div className="flex items-center justify-between text-sm text-gray-600"><span>{listing.pagination.total} {listing.pagination.total === 1 ? "experience" : "experiences"} available</span><span>Page {listing.pagination.page} of {listing.pagination.totalPages}</span></div>
              <div className={`grid gap-5 ${experienceId ? "mx-auto max-w-3xl" : "lg:grid-cols-2"}`}>{listing.items.map((experience) => <ExperienceCard key={experience.id} experience={experience} detailView={Boolean(experienceId)} selection={selections[experience.id] || { slotId: experience.slots?.[0]?.id || "", guestCount: "1" }} onSelection={(value) => setSelections((current) => ({ ...current, [experience.id]: value }))} onBook={() => void submitBooking(experience)} busy={busyId === experience.id} error={bookingErrors[experience.id]} />)}</div>
              {listing.pagination.totalPages > 1 && <nav className="flex items-center justify-center gap-3" aria-label="Experience result pages"><button type="button" onClick={() => updateParam("page", Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button><span>Page {page} of {listing.pagination.totalPages}</span><button type="button" onClick={() => updateParam("page", Math.min(listing.pagination.totalPages, page + 1))} disabled={page >= listing.pagination.totalPages} className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button></nav>}
            </>}
    </main>
  );
};

export default DineExperienceDiscovery;
