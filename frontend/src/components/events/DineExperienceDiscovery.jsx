import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { AlertCircle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import eventsApi from "../../api/eventsApi.js";
import ExperienceCard, { ExperienceCardSkeleton } from "./ExperienceCard.jsx";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";
import { createDineBookingPayload, publicExperienceType, validateDineBookingSelection } from "../../utils/dineExperienceBooking.js";
import {
  getOrCreateDineBookingIdempotencyKey,
  isDefinitiveDineBookingRejection,
  isDefinitiveDineBookingSuccess,
  retireDineBookingIdempotencyKey,
} from "../../utils/dineBookingIdempotency.js";

const PAGE_SIZE = 12;
const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
export const DineExperienceDiscovery = ({
  discoveryType,
  experienceId = "",
  categoryId = "",
  categoryName = "",
  regionalCategories = [],
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
  const subtitle = experienceId
    ? "Review the workshop details and choose an available date before requesting a seat."
    : discoveryType === "workshop"
      ? "Learn traditional recipes hands-on from home cooks near you."
      : "Eat at a local family's home.";
  const listing = pending ? null : result;
  const clearCuisine = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("categoryId");
    next.delete("page");
    setSearchParams(next);
  };
  const pageNumbers = listing?.pagination?.totalPages > 1
    ? Array.from({ length: listing.pagination.totalPages }, (_, index) => index + 1)
    : [];
  const experienceGridClass = experienceId
    ? "mx-auto grid max-w-3xl grid-cols-1 gap-5"
    : discoveryType === "dining"
      ? "grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2"
      : "grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3";

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-5 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#68733F]">Discover TasteBridge</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12] sm:text-4xl">{categoryName ? `${categoryName} ${title.toLowerCase()}` : title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{subtitle}</p>
            {categoryId && !categoriesPending && !categoriesError && <button type="button" onClick={clearCuisine} className="mt-3 text-sm font-semibold text-[#D2552B] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Clear cuisine filter</button>}
          </div>
        </div>
      </header>
      {pageNotice && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{pageNotice}</p>}
      <div className="flex flex-col gap-3 border-b border-orange-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        {!pending && !listing?.error && listing?.items?.length > 0
          ? <span className="text-sm text-gray-600" aria-live="polite">{listing.pagination.total} {listing.pagination.total === 1 ? "experience" : "experiences"} available</span>
          : <span className="hidden sm:block" aria-hidden="true" />}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          {!pending && !listing?.error && listing?.items?.length > 0 && <span className="text-xs text-gray-500">Page {listing.pagination.page} of {listing.pagination.totalPages}</span>}
          <label htmlFor="experience-sort" className="flex items-center gap-2 text-sm font-medium text-gray-500">Sort
            <span className="relative">
              <select id="experience-sort" value={sort} onChange={(event) => updateParam("sort", event.target.value)} className="min-h-11 appearance-none rounded-xl border border-orange-100 bg-[#FFFCF8] py-2.5 pl-3 pr-9 text-sm font-semibold text-[#2B1B12] outline-none transition hover:border-orange-200 focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100"><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
            </span>
          </label>
        </div>
      </div>
      {categoriesPending || pending ? <div className="space-y-3" role="status" aria-label="Loading experiences"><span className="sr-only">Loading experiences…</span><div className={`grid grid-cols-1 items-stretch gap-5 ${discoveryType === "dining" ? "lg:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"}`}>{Array.from({ length: 3 }, (_, index) => <ExperienceCardSkeleton key={index} />)}</div></div>
        : categoriesError ? <section className="rounded-2xl border border-red-100 bg-white px-5 py-12 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-9 w-9 text-red-500" aria-hidden="true" /><p className="mt-3 font-semibold text-[#2B1B12]">Cuisine filter unavailable</p><p className="mt-1 text-sm text-gray-600">Categories could not be loaded.</p><button type="button" onClick={onRetryCategories} className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50">Retry</button></section>
          : categoryUnavailable ? <section className="rounded-2xl border border-orange-100 bg-white px-6 py-14 text-center shadow-sm"><CalendarDays className="mx-auto h-9 w-9 text-[#68733F]" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">Cuisine not found</h2><p className="mt-2 text-sm text-gray-600">This cuisine is no longer available.</p><button type="button" onClick={clearCuisine} className="mt-4 text-sm font-semibold text-[#D2552B] hover:underline">Browse all {title.toLowerCase()}</button></section>
            : listing.error ? <section className="rounded-2xl border border-red-100 bg-white px-5 py-12 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-9 w-9 text-red-500" aria-hidden="true" /><p className="mt-3 font-semibold text-[#2B1B12]">Experiences unavailable</p><p className="mt-1 text-sm text-gray-600">{listing.error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Retry</button></section>
              : !listing.items.length ? <section className="rounded-2xl border border-orange-100 bg-white px-6 py-14 text-center shadow-sm"><CalendarDays className="mx-auto h-10 w-10 text-[#68733F]" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold text-[#2B1B12]">No available experiences yet</h2><p className="mt-2 text-sm text-gray-600">Published experiences with future open slots will appear here.</p></section>
                : <>
                    <div className={experienceGridClass}>{listing.items.map((experience) => <ExperienceCard key={experience.id} experience={experience} type={discoveryType} categories={regionalCategories} detailView={Boolean(experienceId)} selection={selections[experience.id] || { slotId: experience.slots?.[0]?.id || "", guestCount: "1" }} onSelection={(value) => setSelections((current) => ({ ...current, [experience.id]: value }))} onBook={() => void submitBooking(experience)} busy={busyId === experience.id} error={bookingErrors[experience.id]} />)}</div>
                  {pageNumbers.length > 0 && <nav className="flex flex-wrap items-center justify-center gap-2 pt-2" aria-label="Experience result pages">
                    <button type="button" onClick={() => updateParam("page", Math.max(1, page - 1))} disabled={page <= 1} aria-label="Previous page" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-semibold text-[#2B1B12] transition hover:border-orange-200 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button>
                    {pageNumbers.map((pageNumber) => <button key={pageNumber} type="button" aria-label={`Page ${pageNumber}`} aria-current={pageNumber === page ? "page" : undefined} onClick={() => updateParam("page", pageNumber)} className={`min-h-10 min-w-10 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${pageNumber === page ? "bg-[#D2552B] text-white" : "border border-orange-100 bg-white text-[#2B1B12] hover:bg-orange-50"}`}>{pageNumber}</button>)}
                    <span className="px-2 text-xs text-gray-500">Page {page} of {listing.pagination.totalPages}</span>
                    <button type="button" onClick={() => updateParam("page", Math.min(listing.pagination.totalPages, page + 1))} disabled={page >= listing.pagination.totalPages} aria-label="Next page" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-orange-100 bg-white px-3 py-2 text-sm font-semibold text-[#2B1B12] transition hover:border-orange-200 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                  </nav>}
                </>}
    </main>
  );
};

export default DineExperienceDiscovery;
