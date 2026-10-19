import { AlertCircle, ArrowRight, Bike, CheckCircle2, Clock3, IndianRupee, Loader2, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";

const formatRupees = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2,
}).format(Number(amount || 0));

const MetricCard = ({ icon: Icon, label, value, note }) => (
  <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-gray-600">{label}</p><p className="mt-2 text-2xl font-extrabold text-[#2B1B12]">{value}</p></div><span className="rounded-xl bg-red-50 p-2.5 text-red-700"><Icon className="h-5 w-5" aria-hidden="true" /></span></div>
    {note && <p className="mt-2 text-xs leading-5 text-gray-500">{note}</p>}
  </article>
);

export const DeliveryAgentHomePage = () => {
  const { dashboard, loading, loadError, refreshDashboard } = useOutletContext();

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-red-600" />Loading your delivery dashboard...</div>;
  if (loadError) return <section className="mx-auto max-w-2xl rounded-2xl border border-orange-100 bg-white p-6 text-center shadow-sm" role="alert"><AlertCircle className="mx-auto h-9 w-9 text-red-600" /><h1 className="mt-3 text-xl font-bold text-[#2B1B12]">Dashboard unavailable</h1><p className="mt-2 text-sm text-gray-600">{loadError}</p><button type="button" onClick={() => refreshDashboard().catch(() => {})} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2"><RefreshCw className="h-4 w-4" />Try again</button></section>;

  const metrics = dashboard?.metrics || {};
  const readiness = dashboard?.readiness;
  const currentDelivery = dashboard?.currentDelivery;
  const pendingRequirements = readiness?.pendingRequirements || [];
  const payoutOnlyBlocker = pendingRequirements.length === 1 && pendingRequirements[0].id === "payment-details";
  const payoutRequirement = pendingRequirements.find((requirement) => requirement.id === "payment-details");
  const payoutAwaitingReview = payoutRequirement?.action?.includes("awaiting admin approval");
  const payoutNeedsAction = payoutRequirement && !payoutAwaitingReview;
  const profileApproved = dashboard?.agent?.verificationStatus === "APPROVED";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-[#D2552B]">Delivery overview</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#2B1B12]">Home</h1><p className="mt-2 text-sm text-gray-600">Your delivery activity and work readiness at a glance.</p></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" />Verified agent</span>
      </section>

      {!readiness?.readyToWork && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6" aria-labelledby="readiness-title">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-amber-700" /><h2 id="readiness-title" className="text-lg font-extrabold text-amber-950">{payoutAwaitingReview ? "Awaiting Admin Approval" : "Complete setup to go online"}</h2></div><p className="mt-1 text-sm text-amber-900/80">These checks are still pending:</p>
          <ul className="mt-3 space-y-2">{pendingRequirements.map((requirement) => <li key={requirement.id} className="flex items-start gap-2 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><p className="font-bold text-amber-950">{requirement.label}</p><p className="text-amber-900/80">{requirement.action}</p></div></li>)}</ul>
        </div><Link to={profileApproved && (payoutNeedsAction || payoutOnlyBlocker) ? "/delivery-agent/profile#payment-details" : "/delivery-agent/profile"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2">{profileApproved && payoutNeedsAction ? "Complete Profile & Payment Details" : payoutAwaitingReview ? "View payout status" : "Review profile and documents"}<ArrowRight className="h-4 w-4" /></Link></div>
      </section>}

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Delivery summary">
        <MetricCard icon={PackageCheck} label="Deliveries completed today" value={metrics.completedDeliveriesToday ?? 0} />
        <MetricCard icon={IndianRupee} label="Delivery fees earned today" value={formatRupees(metrics.deliveryFeesEarnedToday)} />
      </section>

      <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-extrabold text-[#2B1B12]">Current delivery</h2>
        {currentDelivery ? <div className="mt-4 rounded-xl border border-red-100 bg-[#FFF8F0] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order {currentDelivery.orderNumber}</p><p className="mt-1 font-bold text-[#2B1B12]">{currentDelivery.cookName || "TasteBridge cook"}</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-red-700">{currentDelivery.status.replaceAll("_", " ")}</span></div><ul className="mt-3 space-y-1 text-sm text-gray-700">{currentDelivery.items?.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}</ul></div> : <div className="mt-3 flex items-center gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-600"><Bike className="h-5 w-5 text-gray-400" />No active delivery.</div>}
      </section>

      {readiness?.readyToWork && <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />All current work-readiness checks are complete.</p>}
    </div>
  );
};

export default DeliveryAgentHomePage;
