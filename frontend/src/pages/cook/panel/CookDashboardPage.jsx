import { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  Clock,
  Sparkles,
  Wallet,
  ChefHat,
  ArrowRight,
  Plus,
  ShieldCheck,
  CalendarCheck,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import { isApprovedCook } from "../../../utils/cookAuth.js";
import { normalizeCookReadiness } from "../../../utils/cookReadiness.js";

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
      <div className="space-y-8 text-left animate-pulse">
        {/* Banner Skeleton */}
        <div className="h-44 bg-gradient-to-r from-orange-200/50 to-amber-200/50 rounded-3xl" />

        {/* 4 Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={`skel-${i}`} className="h-28 bg-white rounded-2xl border border-orange-100/60 p-4 space-y-3">
              <div className="h-4 bg-orange-100/60 rounded-md w-24" />
              <div className="h-8 bg-orange-100/40 rounded-lg w-16" />
            </div>
          ))}
        </div>

        {/* Feeds Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-white rounded-3xl border border-orange-100/60 p-6" />
          <div className="h-64 bg-white rounded-3xl border border-orange-100/60 p-6" />
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
    <div className="space-y-6 text-left animate-in fade-in duration-200 pb-12">
      {/* Top Page Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#2B1B12] tracking-tight">
          Home
        </h1>
        <p className="text-xs sm:text-sm text-[#2B1B12]/70 mt-1">
          Welcome to your kitchen headquarters. Monitor incoming orders, dining events, and profile status.
        </p>
      </div>

      {/* Top Error Alert if API error */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-700 border border-red-200 flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={refreshDashboardData}
            className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {dashboardData && !readiness && (
        <div role="alert" className="p-4 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 text-sm">
          Selling readiness could not be loaded. Refresh the dashboard to try again.
        </div>
      )}

      {readiness && (
        <section aria-labelledby="selling-readiness-heading" className="p-5 sm:p-6 bg-white rounded-3xl border border-[#2B1B12]/10 space-y-4">
          <div className="flex items-start gap-3">
            {readiness.readyToSell
              ? <CheckCircle2 aria-hidden="true" className="w-6 h-6 mt-0.5 shrink-0 text-emerald-700" />
              : <AlertCircle aria-hidden="true" className="w-6 h-6 mt-0.5 shrink-0 text-amber-700" />}
            <div>
              <h2 id="selling-readiness-heading" className="text-base sm:text-lg font-extrabold text-[#2B1B12]">
                {readiness.heading}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#2B1B12]/65">
                {readiness.readyToSell
                  ? "Your account and required approvals are in place."
                  : "Complete the items below before your kitchen can sell on TasteBridge."}
              </p>
              {readiness.readyToSell && kitchen?.isOpen === false && (
                <p className="mt-2 text-xs text-amber-800">
                  Your kitchen is currently closed, so customers cannot see your dishes until you open it.
                </p>
              )}
            </div>
          </div>

          {readiness.showChecklist && (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {readiness.checklist.map((item) => (
                <li key={item.id} className={`rounded-2xl border p-4 ${item.complete ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 aria-hidden="true" className={`w-4 h-4 mt-0.5 shrink-0 ${item.complete ? "text-emerald-700" : "text-[#2B1B12]/25"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#2B1B12]">{item.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#2B1B12]/70">{item.message}</p>
                      {!item.complete && item.actionHref && (
                        <Link to={item.actionHref} className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-[#D2552B] hover:underline">
                          Review kitchen profile <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* =========================================================================
          HERO WELCOME BANNER
         ========================================================================= */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#D2552B] via-[#C4461C] to-[#2B1B12] text-white p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-bold text-[#F4A52A]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#F4A52A]" />
              <span>TasteBridge Certified Cook</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md bg-white/10 text-white">
              <span
                className={`w-2 h-2 rounded-full ${
                  isOpen ? "bg-emerald-400" : "bg-stone-300"
                }`}
              />
              <span>{isOpen ? "Kitchen Open" : "Kitchen Closed"}</span>
            </div>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {cookName}!
          </h2>

          <p className="text-sm text-white/85 leading-relaxed">
            Your home kitchen is ready to share authentic regional flavors. View today's incoming orders, track customer dining bookings, and curate your heritage dishes.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/cook/dishes"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#D2552B] hover:bg-orange-50 rounded-xl text-xs font-bold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Dish</span>
            </Link>
            <Link
              to="/cook/profile"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold backdrop-blur-xs transition-colors"
            >
              <span>View Kitchen Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <button
              onClick={refreshDashboardData}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-black/20 hover:bg-black/30 text-white/80 hover:text-white rounded-xl text-xs font-semibold backdrop-blur-xs transition-colors cursor-pointer"
              title="Refresh live metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </button>
          </div>
        </div>

        {/* Decorative background watermark */}
        <div className="absolute -right-6 -bottom-6 opacity-10 text-white pointer-events-none">
          <ChefHat className="w-64 h-64" />
        </div>
      </div>

      {/* =========================================================================
          METRIC CARDS (REAL DATABASE DATA)
         ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#2B1B12]/60">
            Today's Kitchen Overview
          </h3>
          <span className="text-[11px] text-[#2B1B12]/50 font-medium">
            Live database sync
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card, idx) => {
            const Icon = card.icon;
            return (
              <Link
                key={`summary-${idx}`}
                to={card.route}
                className="p-5 bg-white rounded-2xl border border-[#2B1B12]/10 hover:border-[#D2552B]/40 hover:shadow-md transition-all group block"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#2B1B12]/70 group-hover:text-[#D2552B] transition-colors">
                    {card.title}
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${card.bgColor} ${card.iconColor} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div
                  className={`font-extrabold text-[#2B1B12] mb-1 ${
                    card.isUnavailable ? "text-base sm:text-lg text-amber-700/80" : "text-2xl"
                  }`}
                >
                  {card.value}
                </div>
                <p className="text-[11px] text-[#2B1B12]/50 font-medium">
                  {card.description}
                </p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          RECENT ORDERS & EXPERIENCES (REAL DATA OR PROPER EMPTY STATE)
         ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders Card */}
        <div className="p-6 bg-white rounded-3xl border border-[#2B1B12]/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#2B1B12]/10">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#D2552B]" />
              <h4 className="text-sm font-bold text-[#2B1B12]">Recent Orders Feed</h4>
            </div>
            <Link
              to="/cook/orders"
              className="text-xs font-bold text-[#D2552B] hover:underline"
            >
              View All Orders
            </Link>
          </div>

          {recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3.5 bg-[#FFF8F0] rounded-2xl border border-[#2B1B12]/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-extrabold text-[#2B1B12] truncate">
                      Order #{ord.orderNumber}
                    </p>
                    <p className="text-[#2B1B12]/60 text-[11px]">
                      Customer: {ord.customer?.name || "Customer"} &bull;{" "}
                      {ord.items?.length || 0} item(s)
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(
                        ord.status
                      )}`}
                    >
                      {ord.status}
                    </span>
                    <p className="font-extrabold text-[#2B1B12] text-xs">
                      ₹{(ord.cookEarning || ord.totalAmount || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Clean Empty State when no orders exist */
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#D2552B]/10 text-[#D2552B] flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2B1B12]">No active orders right now</p>
                <p className="text-xs text-[#2B1B12]/60 mt-1 max-w-sm mx-auto">
                  Incoming orders will appear here with customer names, delivery slots, and preparation countdowns.
                </p>
              </div>
              <Link
                to="/cook/dishes"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#D2552B] hover:bg-[#C4461C] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Dishes to Menu</span>
              </Link>
            </div>
          )}
        </div>

        {/* Upcoming Experiences Card */}
        <div className="p-6 bg-white rounded-3xl border border-[#2B1B12]/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#2B1B12]/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#3E5B3A]" />
              <h4 className="text-sm font-bold text-[#2B1B12]">Dining Experiences</h4>
            </div>
            <Link
              to="/cook/events"
              className="text-xs font-bold text-[#D2552B] hover:underline"
            >
              View Experiences
            </Link>
          </div>

          {experiences.length > 0 ? (
            <div className="space-y-3">
              {experiences.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3.5 bg-[#FFF8F0] rounded-2xl border border-[#2B1B12]/5 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <p className="font-extrabold text-[#2B1B12] truncate">
                      {exp.title}
                    </p>
                    <p className="text-[#2B1B12]/60 text-[11px]">
                      {exp.cuisine} &bull; Max {exp.maxGuests} guests
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {exp.status}
                    </span>
                    <p className="font-extrabold text-[#2B1B12] text-xs">
                      ₹{exp.pricePerPerson} / guest
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Clean Empty State when no dining experiences exist */
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#3E5B3A]/10 text-[#3E5B3A] flex items-center justify-center mx-auto">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#2B1B12]">No scheduled dining experiences</p>
                <p className="text-xs text-[#2B1B12]/60 mt-1 max-w-sm mx-auto">
                  Host culinary workshops or invite guests to dine at your home table for ancestral food storytelling.
                </p>
              </div>
              <Link
                to="/cook/events"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#2B1B12]/20 hover:border-[#D2552B] text-[#2B1B12] rounded-xl text-xs font-bold transition-all"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#3E5B3A]" />
                <span>Create New Experience</span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CookDashboardPage;
