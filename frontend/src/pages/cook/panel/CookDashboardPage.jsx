import { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Clock,
  Sparkles,
  Wallet,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { isApprovedCook } from "../../../utils/cookAuth.js";
import { normalizeCookReadiness } from "../../../utils/cookReadiness.js";
import { ExperiencesCard, HeroBanner, OrdersCard, StatCard } from "../../../components/cook/dashboard/CookDashboardWidgets.jsx";

export const CookDashboardPage = () => {
  const { user } = useSelector((state) => state.auth);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const dashboardLoadRef = useRef(null);
  const isReadyCook = user?.activePortal === "COOK" && isApprovedCook(user);

  const requestDashboardData = useCallback(async () => {
    if (!isReadyCook) return null;
    if (dashboardLoadRef.current) return dashboardLoadRef.current;

    const request = (async () => {
      const res = await cookApi.getDashboard();
      return res.data?.data || res.data;
    })();

    dashboardLoadRef.current = request;
    try {
      return await request;
    } finally {
      dashboardLoadRef.current = null;
    }
  }, [isReadyCook]);

  const fetchDashboardData = async () => {
    if (!isReadyCook) return;
    try {
      const data = await requestDashboardData();
      if (data) setDashboardData(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load dashboard metrics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshDashboardData = async () => {
    if (!isReadyCook || refreshing) return;
    setRefreshing(true);
    setError(null);
    await fetchDashboardData();
  };

  useEffect(() => {
    if (!isReadyCook) return undefined;

    let active = true;

    requestDashboardData()
      .then((data) => {
        if (active && data) setDashboardData(data);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || err.message || "Failed to load dashboard metrics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isReadyCook, requestDashboardData]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] space-y-8 text-left animate-pulse">
        {/* Banner Skeleton */}
        <div className="h-44 bg-gradient-to-r from-orange-200/50 to-amber-200/50 rounded-3xl" />

        {/* 4 Cards Skeleton */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={`skel-${i}`} className="h-36 space-y-4 rounded-2xl border border-orange-100/60 bg-white p-5">
              <div className="h-4 w-28 rounded-md bg-orange-100/60" />
              <div className="h-9 w-20 rounded-lg bg-orange-100/40" />
              <div className="h-3 w-36 rounded bg-orange-100/40" />
            </div>
          ))}
        </div>

        {/* Feeds Skeleton */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {[1, 2].map((panel) => <div key={`panel-${panel}`} className={`min-h-96 rounded-2xl border border-orange-100/60 bg-white p-6 ${panel === 1 ? "lg:col-span-7" : "lg:col-span-5"}`}>
            <div className="mb-5 h-10 w-48 rounded bg-orange-100/50" />
            {[1, 2, 3].map((row) => <div key={`row-${row}`} className="flex h-[72px] items-center justify-between border-b border-orange-100/50"><div className="space-y-2"><div className="h-4 w-48 rounded bg-orange-100/50" /><div className="h-3 w-32 rounded bg-orange-100/40" /></div><div className="h-8 w-20 rounded-full bg-orange-100/40" /></div>)}
          </div>)}
        </div>
      </div>
    );
  }

  const kitchen = dashboardData?.kitchen;
  const readiness = normalizeCookReadiness(dashboardData?.readiness);
  const summary = dashboardData?.summary;
  const recentOrders = dashboardData?.recentOrders || [];
  const experiences = dashboardData?.experiences || [];

  const cookName = kitchen?.businessName || user?.cookProfile?.businessName || user?.name || "Home Cook";
  const isOpen = kitchen?.isOpen ?? user?.cookProfile?.isOpen ?? true;

  const todayOrders = summary?.todayOrders ?? 0;
  const pendingRequests = summary?.pendingRequests ?? 0;
  const upcomingExperiences = summary?.upcomingExperiences ?? 0;

  // Real Metric Cards backed 100% by PostgreSQL database
  const summaryCards = [
    {
      title: "Today's Orders",
      value: String(todayOrders),
      description: todayOrders === 0 ? "No orders received today" : `${todayOrders} active order(s) today`,
      icon: ShoppingBag,
      iconColor: "text-[#D2552B]",
      bgColor: "bg-[#D2552B]/10",
      route: "/cook/orders",
    },
    {
      title: "Pending Requests",
      value: String(pendingRequests),
      description: pendingRequests === 0 ? "No pending actions needed" : `${pendingRequests} order(s) awaiting kitchen action`,
      icon: Clock,
      iconColor: "text-[#F4A52A]",
      bgColor: "bg-[#F4A52A]/10",
      route: "/cook/orders",
    },
    {
      title: "Upcoming Experiences",
      value: String(upcomingExperiences),
      description: upcomingExperiences === 0 ? "No active dining sessions" : `${upcomingExperiences} approved dining workshop(s)`,
      icon: Sparkles,
      iconColor: "text-[#3E5B3A]",
      bgColor: "bg-[#3E5B3A]/10",
      route: "/cook/events",
    },
    {
      title: "Earnings",
      // If earnings module/settlement records don't exist yet, show "Not available yet" per requirements
      value: summary?.earnings?.isAvailable ? summary.earnings.formattedAmount : "Not available yet",
      isUnavailable: !summary?.earnings?.isAvailable,
      description: summary?.earnings?.isAvailable ? "Fulfilled orders revenue" : "Payment settlement pending fulfillment",
      icon: Wallet,
      iconColor: "text-[#D2552B]",
      bgColor: "bg-[#D2552B]/10",
      route: "/cook/earnings",
    },
  ];

  // Helper for Order Status badges
  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "CONFIRMED":
      case "PREPARING":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "DELIVERED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "CANCELLED":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8 pb-12 text-left animate-in fade-in duration-200">
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        <div className="flex items-center gap-2"><AlertCircle className="h-5 w-5 shrink-0" /><span>{error}</span></div>
        <button type="button" onClick={refreshDashboardData} className="min-h-11 rounded-xl bg-red-600 px-4 py-2 font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">Retry</button>
      </div>}

      {dashboardData && !readiness && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Selling readiness could not be loaded. Refresh the dashboard to try again.</div>}

      {readiness?.showChecklist && <section aria-labelledby="selling-readiness-heading" className="space-y-4 rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
          <div>
            <h2 id="selling-readiness-heading" className="text-lg font-extrabold text-[#2B1B12]">{readiness.heading}</h2>
            <p className="mt-1 text-sm text-[#2B1B12]/65">Complete the items below before your kitchen can sell on TasteBridge.</p>
            {readiness.readyToSell && kitchen?.isOpen === false && <p className="mt-2 text-sm text-amber-800">Your kitchen is currently closed, so customers cannot see your dishes until you open it.</p>}
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {readiness.checklist.map((item) => <li key={item.id} className={`rounded-xl border p-4 ${item.complete ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
            <div className="flex items-start gap-3"><CheckCircle2 aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${item.complete ? "text-emerald-700" : "text-[#2B1B12]/25"}`} />
              <div className="min-w-0"><p className="text-sm font-bold text-[#2B1B12]">{item.label}</p><p className="mt-1 text-sm leading-relaxed text-[#2B1B12]/70">{item.message}</p>
                {!item.complete && item.actionHref && <Link to={item.actionHref} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Review kitchen profile <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
              </div>
            </div>
          </li>)}
        </ul>
      </section>}

      {readiness?.readyToSell && kitchen?.isOpen === false && !readiness.showChecklist && <p className="-mt-4 text-sm text-amber-800">Your kitchen is currently closed, so customers cannot see your dishes until you open it.</p>}

      <HeroBanner cookName={cookName} isOpen={isOpen} readiness={readiness} />

      <section aria-labelledby="kitchen-overview-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="kitchen-overview-heading" className="text-lg font-extrabold text-[#2B1B12]">Today's Kitchen Overview</h2><p className="mt-1 text-sm text-[#2B1B12]/60">A quick view of your kitchen activity.</p></div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[#2B1B12]/60"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />Live database sync</span>
            <button type="button" onClick={refreshDashboardData} disabled={refreshing} aria-label="Refresh dashboard data" title="Refresh dashboard data" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#2B1B12]/15 bg-white text-[#2B1B12] transition duration-150 hover:border-[#D2552B]/50 hover:text-[#D2552B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-12">
          {summaryCards.map((card, idx) => <div className="lg:col-span-3" key={`summary-${idx}`}><StatCard card={card} /></div>)}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-7"><OrdersCard orders={recentOrders} getStatusBadge={getStatusBadge} /></div>
        <div className="lg:col-span-5"><ExperiencesCard experiences={experiences} /></div>
      </div>
    </div>
  );
};

export default CookDashboardPage;
