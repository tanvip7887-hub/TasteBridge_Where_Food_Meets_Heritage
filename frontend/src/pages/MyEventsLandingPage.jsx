import { BookOpenCheck, CalendarDays, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const eventTypes = [
  { title: "Dine", description: "View your Home Dining reservations, payment updates and cancellation details.", to: "/my-events/dine", icon: CalendarDays },
  { title: "Workshop", description: "View your cooking workshop bookings, schedules and booking updates.", to: "/my-events/workshops", icon: BookOpenCheck },
];

export const MyEventsLandingPage = () => {
  const location = useLocation();
  const createdBookingStatus = location.state?.createdDineBooking?.status;
  const statusLabel = (status) => String(status || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <header>
        <p className="text-sm font-semibold text-[#D2552B]">Customer Panel</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">My Events</h1>
        <p className="mt-2 text-sm text-gray-600">Choose which bookings you want to view.</p>
      </header>
      {createdBookingStatus && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900" role="status">Your booking request was submitted. Current server status: {statusLabel(createdBookingStatus)}. The Cook must accept it before payment is available.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {eventTypes.map(({ title, description, to, icon: Icon }) => (
          <Link key={to} to={to} className="group flex min-h-40 items-center gap-4 rounded-2xl border border-orange-100 bg-white p-6 shadow-sm transition hover:border-orange-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-[#D2552B]"><Icon className="h-7 w-7" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xl font-bold text-[#2B1B12]">{title}</span><span className="mt-1 block text-sm leading-6 text-gray-600">{description}</span></span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#D2552B] transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </main>
  );
};

export default MyEventsLandingPage;
