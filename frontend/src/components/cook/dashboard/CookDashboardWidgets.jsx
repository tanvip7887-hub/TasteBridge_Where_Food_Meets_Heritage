import { ArrowRight, Plus, ShoppingBag, CalendarCheck, Sparkles, ChefHat } from "lucide-react";
import { Link } from "react-router-dom";

export function HeroBanner({ cookName, isOpen, readiness }) {
  return (
    <section className="grid min-h-[200px] grid-cols-1 items-center gap-8 rounded-[20px] bg-[#D2552B] p-8 text-white lg:grid-cols-[minmax(0,1fr)_auto] lg:p-10">
      <div className="max-w-[560px]">
        <div className="mb-3 flex items-center gap-3 text-xs font-medium text-white/85">
          <span>TasteBridge Certified Cook</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOpen ? "bg-emerald-400" : "bg-stone-300"}`} aria-hidden="true" />
          <span>{isOpen ? "Kitchen Open" : "Kitchen Closed"}</span>
          {readiness?.heading && <>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden="true" />
            <span>{readiness.heading}</span>
          </>}
        </div>
        <h2 className="text-[28px] font-extrabold leading-[1.2] tracking-tight sm:text-[32px]">Welcome back, {cookName}!</h2>
        <p className="mt-2 line-clamp-2 max-w-[560px] text-base leading-[1.6] text-white/85">
          Your home kitchen is ready to share authentic regional flavors. View today's incoming orders, track customer dining bookings, and curate your heritage dishes.
        </p>
      </div>
      <div className="hidden items-center justify-end pr-2 text-white/25 md:flex" aria-hidden="true">
        <ChefHat className="h-16 w-16 md:h-32 md:w-32 xl:h-36 xl:w-36" strokeWidth={1.2} />
      </div>
    </section>
  );
}

export function StatCard({ card }) {
  const Icon = card.icon;
  return (
    <Link to={card.route} className="group flex min-h-[140px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-1 hover:border-[#D2552B]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#2B1B12]/70 transition-colors group-hover:text-[#D2552B]">{card.title}</span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.bgColor} ${card.iconColor}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      </div>
      <div className={`mt-3 font-extrabold text-[#2B1B12] ${card.isUnavailable ? "text-lg text-amber-700/80" : "text-[32px]"}`}>{card.value}</div>
      <p className="mt-auto pt-1 text-[13px] leading-snug text-[#2B1B12]/55">{card.description}</p>
    </Link>
  );
}

export function EmptyState({ icon: Icon, title, description, actionLabel, to, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "rounded-xl border border-dashed border-[#2B1B12]/15 px-4 py-4" : "flex-1 py-8"}`}>
      <span className={`mb-3 flex items-center justify-center rounded-2xl ${compact ? "h-10 w-10" : "h-14 w-14"} ${Icon === CalendarCheck ? "bg-[#3E5B3A]/10 text-[#3E5B3A]" : "bg-[#D2552B]/10 text-[#D2552B]"}`}>
        <Icon className={compact ? "h-5 w-5" : "h-7 w-7"} aria-hidden="true" />
      </span>
      <p className={`${compact ? "text-sm" : "text-base"} font-bold text-[#2B1B12]`}>{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-[#2B1B12]/60">{description}</p>}
      {actionLabel && <Link to={to} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${compact ? "mt-2 border border-[#2B1B12]/20 bg-white text-[#2B1B12] hover:border-[#D2552B]" : "mt-4 bg-[#D2552B] text-white shadow-sm hover:bg-[#C4461C]"}`}>
        {compact ? <Sparkles className="h-4 w-4 text-[#3E5B3A]" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}{actionLabel}
      </Link>}
    </div>
  );
}

export function OrderRow({ title, details, status, amount, statusClass }) {
  return (
    <li className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#2B1B12]/10 px-3 py-2.5 text-[15px] transition duration-150 last:border-b-0 hover:bg-[#FFF8F0] sm:px-4">
      <div className="min-w-0 space-y-1">
        <p className="truncate font-bold text-[#2B1B12]" title={title}>{title}</p>
        <p className="truncate text-sm text-[#2B1B12]/60">{details}</p>
      </div>
      <div className="flex min-w-[100px] flex-col items-end gap-1.5">
        <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-bold ${statusClass}`}>{status}</span>
        <p className="text-sm font-extrabold text-[#2B1B12]">{amount}</p>
      </div>
    </li>
  );
}

function PanelHeader({ icon: Icon, title, id, to, linkLabel = "View all", iconClass = "bg-[#D2552B]/10 text-[#D2552B]" }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[#2B1B12]/10 pb-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <h2 id={id} className="truncate text-lg font-extrabold text-[#2B1B12] sm:text-xl">{title}</h2>
      </div>
      <Link to={to} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-bold text-[#D2552B] transition duration-150 hover:bg-orange-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">
        {linkLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function OrdersCard({ orders, getStatusBadge }) {
  return (
    <section aria-labelledby="recent-orders-heading" className="flex min-h-[420px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6">
      <PanelHeader icon={ShoppingBag} title="Recent Orders Feed" id="recent-orders-heading" to="/cook/orders" linkLabel="View all" />
      {orders.length ? <ul className="mt-2">
        {orders.map((order) => <OrderRow key={order.id} title={`Order #${order.orderNumber}`} details={`Customer: ${order.customer?.name || "Customer"} · ${order.items?.length || 0} item(s)`} status={order.status} statusClass={getStatusBadge(order.status)} amount={`₹${(order.cookEarning || order.totalAmount || 0).toFixed(2)}`} />)}
      </ul> : <EmptyState icon={ShoppingBag} title="No active orders right now" description="Incoming orders will appear here with customer names, delivery slots, and preparation countdowns." actionLabel="Add Dishes to Menu" to="/cook/dishes" />}
    </section>
  );
}

export function ExperiencesCard({ experiences }) {
  return (
    <section aria-labelledby="dining-experiences-heading" className="flex min-h-[420px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6">
      <PanelHeader icon={CalendarCheck} title="Dining Experiences" id="dining-experiences-heading" to="/cook/events" linkLabel="View all" iconClass="bg-[#3E5B3A]/10 text-[#3E5B3A]" />
      {experiences.length ? <ul className="mt-2">
        {experiences.map((experience) => <OrderRow key={experience.id} title={experience.title} details={`${experience.cuisine} · Max ${experience.maxGuests} guests`} status={experience.status} statusClass="border-emerald-200 bg-emerald-100 text-emerald-800" amount={`₹${experience.pricePerPerson} / guest`} />)}
      </ul> : <EmptyState icon={CalendarCheck} title="No scheduled dining experiences" description="Host culinary workshops or invite guests to dine at your home table for ancestral food storytelling." actionLabel="Create New Experience" to="/cook/events" />}
      {experiences.length > 0 && experiences.length < 3 && <div className="mt-auto pt-4"><EmptyState compact icon={CalendarCheck} title="Have another experience to share?" actionLabel="Add experience" to="/cook/events" /></div>}
    </section>
  );
}
