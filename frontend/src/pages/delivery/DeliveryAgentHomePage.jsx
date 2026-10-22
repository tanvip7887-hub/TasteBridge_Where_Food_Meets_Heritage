import { AlertCircle, ArrowRight, Bike, CheckCircle2, Clock3, IndianRupee, MapPin, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

const formatRupees = (amount) => {
  const value = Number(amount);
  return Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
    : "—";
};

const MetricCard = ({ icon: Icon, label, value, note, tone }) => (
  <article className="flex min-h-[140px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-1 hover:shadow-md">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-bold text-[#2B1B12]/70">{label}</p>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
    </div>
    <p className="mt-3 text-[32px] font-extrabold leading-tight text-[#2B1B12]">{value}</p>
    <p className="mt-auto pt-1 text-[13px] leading-snug text-[#2B1B12]/55">{note}</p>
  </article>
);

const LoadingDashboard = () => (
  <div className="mx-auto w-full max-w-[1400px] animate-pulse space-y-8 pb-12" role="status" aria-label="Loading delivery dashboard">
    <div className="h-52 rounded-[20px] bg-[#D2552B]/30" />
    <section aria-label="Loading today's overview" className="space-y-4">
      <div className="h-8 w-64 rounded-lg bg-[#2B1B12]/10" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[140px] rounded-2xl border border-[#2B1B12]/10 bg-white" />)}</div>
    </section>
    <div className="grid gap-6 lg:grid-cols-12"><div className="h-64 rounded-2xl bg-white lg:col-span-7" /><div className="h-64 rounded-2xl bg-white lg:col-span-5" /></div>
    <span className="sr-only">Loading your delivery dashboard…</span>
  </div>
);

export const DeliveryAgentHomePage = () => {
  const { dashboard, loading, loadError, refreshDashboard, isOnline = false, availabilityUpdating = false, toggleAvailability } = useOutletContext();

  if (loading) return <LoadingDashboard />;
  if (loadError) return <section className="mx-auto max-w-2xl rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-9 w-9 text-red-600" aria-hidden="true" /><h1 className="mt-3 text-xl font-bold text-[#2B1B12]">Dashboard unavailable</h1><p className="mt-2 text-sm text-gray-600">{loadError}</p><button type="button" onClick={() => refreshDashboard().catch(() => {})} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button></section>;

  const metrics = dashboard?.metrics || {};
  const readiness = dashboard?.readiness;
  const currentDelivery = dashboard?.currentDelivery;
  const agent = dashboard?.agent;
  const pendingRequirements = readiness?.pendingRequirements || [];
  const requirements = readiness?.requirements || pendingRequirements;
  const readinessComplete = readiness?.readyToWork === true;
  const ready = readinessComplete && isOnline;
  const readinessItems = [...requirements, { id: "online-status", label: "Online status", complete: isOnline, message: isOnline ? "You are available for delivery assignments." : "Go online to receive delivery assignments." }];
  const readinessItemCount = readinessItems.filter((item) => !item.complete).length;
  const activeStatus = currentDelivery?.status?.replaceAll("_", " ") || "Active";
  const firstName = agent?.name?.trim()?.split(/\s+/)[0] || "there";
  const statusLabel = (value) => value ? value.charAt(0) + value.slice(1).toLowerCase() : "Status unavailable";

  const cards = [
    { icon: PackageCheck, label: "Deliveries completed today", value: metrics.completedDeliveriesToday ?? 0, note: "Completed so far today", tone: "bg-red-50 text-red-700" },
    { icon: IndianRupee, label: "Delivery fees earned today", value: formatRupees(metrics.deliveryFeesEarnedToday), note: "Earned today", tone: "bg-emerald-50 text-emerald-700" },
    { icon: Clock3, label: "Available deliveries", value: metrics.availableDeliveriesCount ?? "—", note: "Waiting for pickup", tone: "bg-amber-50 text-amber-700" },
    { icon: Bike, label: "Current delivery status", value: currentDelivery ? "Active" : "None", note: currentDelivery ? `Order ${currentDelivery.orderNumber}` : "No active delivery", tone: "bg-blue-50 text-blue-700" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 pb-12 text-left">
      <section className="relative grid min-h-[220px] grid-cols-1 items-center gap-8 overflow-hidden rounded-[24px] bg-[#D2552B] p-8 text-white shadow-sm sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto]" aria-labelledby="delivery-welcome-title">
        <div className="relative z-10 max-w-[620px]">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-medium text-white/85">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" aria-hidden="true" />TasteBridge Verified Agent</span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOnline ? "bg-emerald-300" : "bg-white/55"}`} aria-hidden="true" />
            <span>{isOnline ? "Online" : "Offline"}</span>
            {ready && <><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" aria-hidden="true" /><span>Ready for deliveries</span></>}
          </div>
          <h1 id="delivery-welcome-title" className="text-[28px] font-extrabold leading-[1.2] tracking-tight sm:text-[32px]">Welcome back, {firstName}!</h1>
          <p className="mt-2 max-w-[560px] text-base leading-[1.6] text-white/85">{isOnline ? "You're online and ready to pick up orders. Check available deliveries and track your earnings." : "You're offline. Go online to start receiving deliveries."}</p>
        </div>
        <div className="hidden items-center justify-end pr-2 text-white/25 md:flex" aria-hidden="true"><Bike className="h-28 w-28 lg:h-36 lg:w-36" strokeWidth={1.1} /></div>
      </section>

      <section aria-labelledby="delivery-overview-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="delivery-overview-heading" className="text-lg font-extrabold text-[#2B1B12]">Today's Overview</h2><p className="mt-1 text-sm text-[#2B1B12]/60">A quick view of your delivery activity.</p></div>
          <div className="flex items-center gap-3"><span className="inline-flex items-center gap-2 text-sm font-medium text-[#2B1B12]/60"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />Live sync</span><button type="button" onClick={() => refreshDashboard().catch(() => {})} aria-label="Refresh dashboard data" title="Refresh dashboard data" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#2B1B12]/15 bg-white text-[#2B1B12] transition duration-150 hover:border-[#D2552B]/50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2"><RefreshCw className="h-4 w-4" aria-hidden="true" /></button></div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <MetricCard key={card.label} {...card} />)}</div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <section aria-labelledby="current-delivery-heading" className="flex min-h-[260px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-3 border-b border-[#2B1B12]/10 pb-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D2552B]/10 text-[#D2552B]"><Bike className="h-5 w-5" aria-hidden="true" /></span><h2 id="current-delivery-heading" className="text-lg font-extrabold text-[#2B1B12]">Current delivery</h2></div>{currentDelivery && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">{statusLabel(activeStatus)}</span>}</div>
          {currentDelivery ? <div className="flex flex-1 flex-col pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1B12]/55">Order {currentDelivery.orderNumber}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="flex gap-3"><span className="mt-0.5 text-[#D2552B]"><PackageCheck className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-semibold text-[#2B1B12]/55">Pickup</p><p className="mt-1 text-sm font-semibold text-[#2B1B12]">{currentDelivery.cookName || "TasteBridge kitchen"}</p>{(currentDelivery.pickupArea || currentDelivery.cookArea) && <p className="text-sm text-[#2B1B12]/65">{currentDelivery.pickupArea || currentDelivery.cookArea}</p>}</div></div>
              {(currentDelivery.deliveryArea || currentDelivery.customerArea) && <div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><div><p className="text-xs font-semibold text-[#2B1B12]/55">Drop-off</p><p className="mt-1 text-sm font-semibold text-[#2B1B12]">{currentDelivery.deliveryArea || currentDelivery.customerArea}</p></div></div>}
            </div>
            {(currentDelivery.distance || currentDelivery.deliveryFee != null) && <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[#2B1B12]/10 pt-4 text-sm text-[#2B1B12]/70">{currentDelivery.distance && <span>{currentDelivery.distance} km</span>}{currentDelivery.deliveryFee != null && <span>Delivery fee: {formatRupees(currentDelivery.deliveryFee)}</span>}</div>}
            {currentDelivery.items?.length > 0 && <p className="mt-3 text-sm text-[#2B1B12]/65">{currentDelivery.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>}
            <Link to="/delivery-agent/current" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Open delivery<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div> : <div className="flex flex-1 flex-col items-center justify-center py-7 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D2552B]/10 text-[#D2552B]"><Bike className="h-7 w-7" aria-hidden="true" /></span><p className="mt-3 font-bold text-[#2B1B12]">No active delivery</p><p className="mt-1 text-sm text-[#2B1B12]/60">Accept an available delivery to get started.</p><Link to="/delivery-agent/available" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#2B1B12]/20 bg-white px-4 py-2 text-sm font-bold text-[#2B1B12] transition duration-150 hover:border-[#D2552B] hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Browse available deliveries<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>}
        </section>

        <section aria-labelledby="work-readiness-heading" className="flex min-h-[260px] flex-col rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-3 border-b border-[#2B1B12]/10 pb-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span><h2 id="work-readiness-heading" className="text-lg font-extrabold text-[#2B1B12]">Work readiness</h2></div><span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${readinessItemCount === 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{readinessItemCount === 0 ? "All set" : `${readinessItemCount} pending`}</span></div>
          <ul className="mt-4 space-y-3">{readinessItems.map((requirement) => <li key={requirement.id} className="flex items-start gap-3"><span className={`mt-0.5 ${requirement.complete ? "text-emerald-700" : "text-amber-700"}`}>{requirement.complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#2B1B12]">{requirement.label}</p>{!requirement.complete && <p className="mt-0.5 text-xs leading-relaxed text-[#2B1B12]/60">{requirement.message || requirement.action}</p>}</div>{!requirement.complete && requirement.id === "online-status" && <button type="button" onClick={() => toggleAvailability?.()} disabled={!readinessComplete || availabilityUpdating || !toggleAvailability} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-60">Go online<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}{!requirement.complete && requirement.id !== "online-status" && requirement.href && <Link to={requirement.href} className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Fix<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}</li>)}</ul>
        </section>
      </div>
    </div>
  );
};

export default DeliveryAgentHomePage;
