import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, ChefHat, Clock3, MapPin, Table2 } from "lucide-react";
import { bookableGuestLimit } from "../../utils/dineExperienceBooking.js";
import { formatIstDateTime } from "../../utils/istDateTime.js";
import { getExperienceImage } from "../../utils/bookingPresentation.js";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
const formatDate = formatIstDateTime;
const initials = (value) => String(value || "TasteBridge")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0].toUpperCase())
  .join("") || "TB";

export const ExperienceImage = ({ experience, type, horizontal = false, categories = [] }) => {
  const image = getExperienceImage(experience, 800, categories);
  const [failedSource, setFailedSource] = useState(null);
  const failed = !image.src || failedSource === image.src;
  if (failed) {
    const PlaceholderIcon = type === "workshop" ? ChefHat : Table2;
    return <div className={`grid ${horizontal ? "aspect-[4/3] w-24 place-items-center rounded-xl sm:w-36" : "aspect-[8/5] w-full place-items-center rounded-t-2xl"} bg-[#F7F2EC] text-[#A89A89]`} aria-label={`${type === "workshop" ? "Workshop" : "Home dining"} image unavailable`}>
      <PlaceholderIcon className="h-10 w-10" aria-hidden="true" />
    </div>;
  }
  return <img src={image.src} alt={image.alt} loading="lazy" onError={() => setFailedSource(image.src)} className={horizontal ? "aspect-[4/3] w-24 rounded-xl object-cover sm:w-36" : "aspect-[8/5] w-full rounded-t-2xl object-cover"} />;
};

const HostedBy = ({ cook }) => {
  const [failedSource, setFailedSource] = useState(null);
  const showPhoto = cook?.profileImage && failedSource !== cook.profileImage;
  return <div className="flex min-w-0 items-center gap-2.5 text-sm text-gray-600">
    {showPhoto
      ? <img src={cook.profileImage} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-full border border-orange-100 object-cover" onError={() => setFailedSource(cook.profileImage)} />
      : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F0EBDD] text-xs font-bold text-[#68733F]" aria-hidden="true">{initials(cook?.businessName)}</span>}
    <span className="truncate">Hosted by <span className="font-semibold text-[#2B1B12]">{cook?.businessName || "TasteBridge Cook"}</span></span>
  </div>;
};

const ExperienceCardSkeleton = () => <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm" aria-hidden="true">
  <div className="aspect-[8/5] animate-pulse bg-[#F2ECE4]" />
  <div className="space-y-3 p-5"><div className="h-4 w-1/3 animate-pulse rounded bg-[#F2ECE4]" /><div className="h-6 w-4/5 animate-pulse rounded bg-[#F2ECE4]" /><div className="h-4 w-full animate-pulse rounded bg-[#F2ECE4]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[#F2ECE4]" /></div>
</div>;

export const ExperienceCard = ({ experience, type, selection, onSelection, onBook, busy, error, detailView = false, categories = [] }) => {
  const normalizedType = type === "workshop" ? "workshop" : "dining";
  const isWorkshop = normalizedType === "workshop";
  const isDining = !isWorkshop;
  const slot = experience.slots?.find((item) => item.id === selection?.slotId) || experience.slots?.[0];
  const guestLimit = slot ? bookableGuestLimit(experience, slot) : 0;
  const durationAvailable = experience.durationMinutes !== null && experience.durationMinutes !== undefined
    && Number.isFinite(Number(experience.durationMinutes));
  const Card = isWorkshop && !detailView ? Link : "article";
  const cardProps = Card === Link ? { to: `/workshops/${encodeURIComponent(experience.id)}` } : {};

  return <Card {...cardProps} className={`group h-full overflow-hidden rounded-2xl border border-orange-100 bg-white text-left text-inherit shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${isDining ? "grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-0 p-3 sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-x-4 sm:p-4" : "flex flex-col"}`}>
    <div className={`relative ${isDining ? "w-24 sm:w-36" : ""}`}>
      <ExperienceImage experience={experience} type={normalizedType} horizontal={isDining} categories={categories} />
      <span className={`absolute left-1 top-1 rounded-full px-1.5 py-1 text-[8px] font-bold tracking-wide shadow-sm sm:left-2 sm:top-2 sm:px-2 sm:text-[10px] ${isWorkshop ? "bg-[#68733F] text-white" : "bg-[#D2552B] text-white"}`}>{isWorkshop ? "WORKSHOP" : "HOME DINING"}</span>
      {durationAvailable && <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full bg-[#2B1B12]/85 px-1.5 py-1 text-[9px] font-semibold text-white sm:bottom-2 sm:right-2 sm:text-xs"><Clock3 className="h-3 w-3" aria-hidden="true" />{experience.durationMinutes} min</span>}
    </div>

    <div className={`flex min-w-0 flex-1 flex-col ${isDining ? "gap-2 px-0 py-0.5 sm:gap-2.5" : "gap-3.5 p-4 sm:p-5"}`}>
      <HostedBy cook={experience.cook} />
      <div>
        <h2 className="line-clamp-2 text-lg font-extrabold leading-snug text-[#2B1B12] sm:text-xl">{experience.title}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {experience.theme && <span className="inline-flex max-w-full rounded-full bg-[#F4EFE4] px-2.5 py-1 text-xs font-medium text-[#62563E]">{experience.theme}</span>}
          {experience.cuisine && experience.cuisine !== experience.theme && <span className="inline-flex max-w-full rounded-full bg-[#F4EFE4] px-2.5 py-1 text-xs font-medium text-[#62563E]">{experience.cuisine}</span>}
          {experience.isVegetarian && <span className="inline-flex rounded-full bg-[#EFF3E8] px-2.5 py-1 text-xs font-medium text-[#526338]">Vegetarian</span>}
        </div>
      </div>
      {experience.description && <p className="line-clamp-2 text-sm leading-5 text-gray-600">{experience.description}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
        {experience.publicArea && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span className="truncate">{experience.publicArea}</span></span>}
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 shrink-0 text-[#68733F]" aria-hidden="true" />{experience.slots?.length || 0} upcoming {experience.slots?.length === 1 ? "date" : "dates"}</span>
      </div>
      {experience.slots?.length > 0 && <p className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />Seats available</p>}

      {isWorkshop && detailView && <div className="space-y-3 rounded-xl bg-[#F7F2EC] p-4 text-sm text-gray-700">
        <p><span className="font-semibold text-[#2B1B12]">What you will learn:</span> {experience.learningOutcomes}</p>
        <p><span className="font-semibold text-[#2B1B12]">What the Cook will teach:</span> {experience.teachingContent}</p>
        {experience.materialsToBring && <p><span className="font-semibold text-[#2B1B12]">Bring:</span> {experience.materialsToBring}</p>}
      </div>}
      {experience.dietaryNotes && <p className="text-sm text-gray-600"><span className="font-semibold text-[#2B1B12]">Dietary notes:</span> {experience.dietaryNotes}</p>}
      {experience.menuItems?.length > 0 && <div className="text-sm"><h3 className="font-semibold text-[#2B1B12]">Menu</h3><ul className="mt-1 list-inside list-disc text-gray-600">{experience.menuItems.map(({ dish, note }, index) => <li key={dish?.id || index}>{dish?.name || note}{dish?.cuisine ? ` · ${dish.cuisine}` : ""}</li>)}</ul></div>}
      {experience.inclusions?.length > 0 && <p className="text-sm text-gray-600"><span className="font-semibold text-[#2B1B12]">Includes:</span> {experience.inclusions.join(", ")}</p>}

      {!isDining && <footer className="mt-auto border-t border-orange-100 pt-3.5">
        <div className="mb-3 flex items-end justify-between gap-3">
          <p><span className="block text-[10px] font-medium text-gray-500">Price per person</span><span className="text-lg font-extrabold text-[#2B1B12]">{formatPrice(experience.pricePerPerson)}</span></p>
          {isWorkshop && !detailView && <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[#D2552B]">View details<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}
        </div>
        {!isWorkshop && experience.slots?.length > 0 ? <div className="space-y-3">
          <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">Available date and time
            <select value={slot?.id || ""} onChange={(event) => onSelection({ ...selection, slotId: event.target.value, guestCount: Math.min(Number(selection.guestCount) || 1, bookableGuestLimit(experience, experience.slots.find((item) => item.id === event.target.value))) })} onClick={(event) => event.stopPropagation()} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-normal focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-orange-100">
              {experience.slots.map((item) => <option key={item.id} value={item.id}>{formatDate(item.startsAt)} · {item.availableSeats} seats available</option>)}
            </select>
          </label>
          {slot?.endsAt && <p className="text-xs text-gray-500">Ends {formatDate(slot.endsAt)}</p>}
          <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">Guests
            <input type="number" min="1" max={guestLimit} step="1" value={selection?.guestCount || "1"} onChange={(event) => onSelection({ ...selection, guestCount: event.target.value })} onClick={(event) => event.stopPropagation()} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 font-normal focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-orange-100" />
          </label>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <button type="button" onClick={onBook} disabled={busy || guestLimit < 1} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#AD4324] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
            {busy ? "Submitting request…" : <>Request booking · {formatPrice(Number(experience.pricePerPerson) * (Number(selection?.guestCount) || 0))}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
          </button>
          <p className="text-xs leading-5 text-gray-500">Your seats are requested first. The Cook must accept before payment is available. This page does not confirm your booking or take payment.</p>
        </div> : isWorkshop && !detailView ? null : experience.slots?.length > 0 ? <>
          {error && <p className="mb-3 text-sm text-red-700" role="alert">{error}</p>}
          <div className="space-y-3">
            <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">Available date and time
              <select value={slot?.id || ""} onChange={(event) => onSelection({ ...selection, slotId: event.target.value, guestCount: Math.min(Number(selection.guestCount) || 1, bookableGuestLimit(experience, experience.slots.find((item) => item.id === event.target.value))) })} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 font-normal">
                {experience.slots.map((item) => <option key={item.id} value={item.id}>{formatDate(item.startsAt)} · {item.availableSeats} seats available</option>)}
              </select>
            </label>
            {slot?.endsAt && <p className="text-xs text-gray-500">Ends {formatDate(slot.endsAt)}</p>}
            <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">Guests
              <input type="number" min="1" max={guestLimit} step="1" value={selection.guestCount} onChange={(event) => onSelection({ ...selection, guestCount: event.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 font-normal" />
            </label>
            <button type="button" onClick={onBook} disabled={busy || guestLimit < 1} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#AD4324] disabled:cursor-wait disabled:opacity-60">{busy ? "Submitting request…" : <>Request booking · {formatPrice(Number(experience.pricePerPerson) * (Number(selection.guestCount) || 0))}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}</button>
            <p className="text-xs leading-5 text-gray-500">Your seats are requested first. The Cook must accept before payment is available. This page does not confirm your booking or take payment.</p>
          </div>
        </> : <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">No future slots currently have seats available.</p>}
      </footer>}
    </div>
    {isDining && <footer className="col-span-full mt-1 grid min-w-0 gap-3 border-t border-orange-100 pt-3 sm:grid-cols-2 sm:items-end">
      <div className="flex min-w-0 items-end justify-between gap-3 sm:col-span-2">
        <p><span className="block text-xs font-medium text-gray-500">Price per person</span><span className="text-lg font-extrabold text-[#2B1B12]">{formatPrice(experience.pricePerPerson)}</span></p>
        {slot?.endsAt && <p className="text-right text-xs text-gray-500">Ends {formatDate(slot.endsAt)}</p>}
      </div>
      {experience.slots?.length > 0 ? <>
        <label className="block min-w-0 space-y-1 text-sm font-semibold text-[#2B1B12]">Available date and time
          <select value={slot?.id || ""} onChange={(event) => onSelection({ ...selection, slotId: event.target.value, guestCount: Math.min(Number(selection.guestCount) || 1, bookableGuestLimit(experience, experience.slots.find((item) => item.id === event.target.value))) })} className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-2.5 py-2.5 text-xs font-normal focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-orange-100 sm:text-sm">
            {experience.slots.map((item) => <option key={item.id} value={item.id}>{formatDate(item.startsAt)} · {item.availableSeats} seats available</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-semibold text-[#2B1B12]">Guests
          <input type="number" min="1" max={guestLimit} step="1" value={selection?.guestCount || "1"} onChange={(event) => onSelection({ ...selection, guestCount: event.target.value })} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-normal focus:border-[#D2552B] focus:outline-none focus:ring-2 focus:ring-orange-100" />
        </label>
        {error && <p className="text-sm text-red-700 sm:col-span-2" role="alert">{error}</p>}
        <button type="button" onClick={onBook} disabled={busy || guestLimit < 1} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#AD4324] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:col-span-2">
          {busy ? "Submitting request…" : <>Request booking · {formatPrice(Number(experience.pricePerPerson) * (Number(selection?.guestCount) || 0))}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </button>
        <p className="text-xs leading-5 text-gray-500 sm:col-span-2">Your seats are requested first. The Cook must accept before payment is available. This page does not confirm your booking or take payment.</p>
      </> : <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 sm:col-span-2">No future slots currently have seats available.</p>}
    </footer>}
  </Card>;
};

export { ExperienceCardSkeleton };
export default ExperienceCard;
