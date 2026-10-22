import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../api/adminApi.js";
import {
  Users, ChefHat, Truck, ShoppingBag, DollarSign, FileCheck, AlertTriangle,
  ArrowUpRight, RefreshCw, Sparkles, UtensilsCrossed,
} from "lucide-react";

const money = (value) => {
  const amount = Number(value);
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const metricCards = (stats = {}) => [
  { title: "Total Customers", value: stats.customersCount ?? 0, caption: "Registered users", icon: Users, tint: "bg-orange-50 text-[#D2552B]", link: "/admin/customers" },
  { title: "Total Cooks", value: stats.cooksCount ?? 0, caption: "Registered kitchens", icon: ChefHat, tint: "bg-orange-50 text-[#D2552B]", link: "/admin/cooks" },
  { title: "Pending Verifications", value: stats.pendingCookVerificationsCount ?? 0, caption: "Waiting for review", icon: FileCheck, tint: (stats.pendingCookVerificationsCount ?? 0) > 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700", link: "/admin/verifications", attention: true },
  { title: "Delivery Agents", value: stats.deliveryAgentsCount ?? 0, caption: "Registered agents", icon: Truck, tint: "bg-orange-50 text-[#D2552B]", link: "/admin/delivery-agents" },
  { title: "Active Orders", value: stats.activeOrdersCount ?? 0, caption: "In progress now", icon: ShoppingBag, tint: "bg-orange-50 text-[#D2552B]", link: "/admin/orders" },
  { title: "Completed Orders", value: stats.completedOrdersCount ?? 0, caption: "Delivered so far", icon: Sparkles, tint: "bg-emerald-50 text-emerald-700", link: "/admin/orders" },
  { title: "Platform Revenue", value: money(stats.totalRevenue), caption: "Total platform earnings", icon: DollarSign, tint: "bg-emerald-50 text-emerald-700", link: "/admin/payments", featured: true },
  { title: "Pending Issues", value: stats.pendingIssuesCount ?? 0, caption: "Need attention", icon: AlertTriangle, tint: (stats.pendingIssuesCount ?? 0) > 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700", link: "/admin/reviews", attention: true },
];

const orderStatusStyle = (status = "") => {
  const value = status.toUpperCase();
  if (value === "DELIVERED" || value === "COMPLETED") return "bg-emerald-50 text-emerald-800";
  if (value === "PENDING") return "bg-amber-50 text-amber-800";
  if (value === "CANCELLED" || value === "REJECTED") return "bg-red-50 text-red-800";
  return "bg-orange-50 text-orange-800";
};

const userRole = (role = "") => ({ CUSTOMER: "Customer", COOK: "Cook", DELIVERY_AGENT: "Delivery agent", ADMIN: "Admin" }[role] || role.replaceAll("_", " "));
const userRoleStyle = (role = "") => ({
  CUSTOMER: "bg-orange-50 text-orange-800",
  COOK: "bg-amber-50 text-amber-800",
  DELIVERY_AGENT: "bg-emerald-50 text-emerald-800",
  ADMIN: "bg-gray-100 text-gray-700",
}[role] || "bg-gray-100 text-gray-700");

const MetricSkeleton = () => <div className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-white p-5"><div className="h-4 w-32 rounded bg-gray-100" /><div className="mt-5 h-8 w-24 rounded bg-gray-100" /><div className="mt-3 h-3 w-36 rounded bg-gray-100" /></div>;

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminApi.getDashboardStats();
      setData(response.data);
    } catch (requestError) {
      setError(requestError.message || "Failed to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refreshSilently = () => {
      adminApi.getDashboardStats()
        .then((response) => { if (active) setData(response.data); })
        .catch(() => {});
    };
    adminApi.getDashboardStats()
      .then((response) => { if (active) setData(response.data); })
      .catch((requestError) => { if (active) setError(requestError.message || "Failed to load dashboard statistics."); })
      .finally(() => { if (active) setLoading(false); });
    window.addEventListener("focus", refreshSilently);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshSilently);
    };
  }, []);

  if (error) return <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm" role="alert"><AlertTriangle className="mx-auto h-8 w-8 text-red-600" /><p className="mt-3 text-sm font-semibold text-red-900">{error}</p><button type="button" onClick={fetchDashboard} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><RefreshCw className="h-4 w-4" />Try again</button></section>;

  const stats = data?.stats || {};
  const recentOrders = data?.recentActivity?.recentOrders || [];
  const recentUsers = data?.recentActivity?.recentUsers || [];
  const cards = metricCards(stats);

  return <div className="mx-auto max-w-7xl space-y-8 pb-12 pt-2 sm:pt-0 lg:-mt-2">

    <section aria-label="Marketplace metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading ? Array.from({ length: 8 }, (_, index) => <MetricSkeleton key={index} />) : cards.map((card) => {
        const Icon = card.icon;
        const hasAttention = card.attention && Number(card.value) > 0;
        return <Link key={card.title} to={card.link} className={`group relative flex min-h-36 flex-col justify-between rounded-2xl border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] ${card.featured ? "border-orange-200 bg-gradient-to-br from-orange-50 to-emerald-50" : "border-gray-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-3"><span className="text-sm font-medium text-gray-600">{card.title}</span><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tint}`}><Icon className="h-5 w-5" /></span></div>
          <div className="mt-4 flex items-center gap-2"><span className={`font-bold leading-none text-[#2B1B12] ${card.featured ? "text-2xl" : "text-[32px]"}`}>{card.value}</span>{hasAttention && <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-label="Needs attention" />}</div>
          <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[13px] text-gray-500">{card.caption}</span><ArrowUpRight className="h-4 w-4 text-[#D2552B] opacity-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden="true" /></div>
        </Link>;
      })}
    </section>

    <section className="grid items-stretch gap-6 lg:grid-cols-5" aria-label="Recent activity">
      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-3">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4"><h3 className="text-xl font-semibold text-[#2B1B12]">Recent orders</h3><Link to="/admin/orders" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#D2552B] transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">View all <ArrowUpRight className="h-4 w-4" /></Link></div>
        {loading ? <div className="mt-4 space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="flex h-[72px] animate-pulse items-center gap-3 rounded-xl bg-gray-50 p-3"><div className="h-12 w-12 shrink-0 rounded-lg bg-gray-200" /><div className="min-w-0 flex-1"><div className="h-4 w-40 rounded bg-gray-200" /><div className="mt-2 h-3 w-56 max-w-full rounded bg-gray-200" /></div><div className="h-8 w-16 shrink-0 rounded bg-gray-200" /></div>)}</div> : recentOrders.length ? <ul className="mt-4 space-y-3">{recentOrders.slice(0, 5).map((order) => {
          const firstItem = order.items?.[0];
          const itemCount = order.items?.length || 0;
          return <li key={order.id} className="flex min-h-[72px] items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-orange-50/60">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-orange-50">
              {(firstItem?.dishImage || firstItem?.dish?.image) ? <img src={firstItem.dishImage || firstItem.dish.image} alt={firstItem.name || "Ordered dish"} loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[#D2552B]" aria-label="No dish image"><UtensilsCrossed className="h-5 w-5" /></span>}
              {itemCount > 1 && <span className="absolute right-0 top-0 rounded-bl-md bg-[#2B1B12]/80 px-1 py-0.5 text-xs font-semibold text-white">+{itemCount - 1}</span>}
            </div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]" title={order.orderNumber}>{order.orderNumber}</p><p className="mt-1 truncate text-sm text-gray-600" title={`Customer: ${order.customer?.name || "Customer"} · Cook: ${order.cook?.businessName || "Kitchen"}`}>Customer: {order.customer?.name || "Customer"} · Cook: {order.cook?.businessName || "Kitchen"}</p></div>
            <div className="shrink-0 text-right"><p className="text-sm font-bold text-[#2B1B12]">{money(order.totalAmount)}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${orderStatusStyle(order.status)}`}>{order.status?.replaceAll("_", " ") || "Unknown"}</span></div>
          </li>;
        })}</ul> : <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No recent orders</p>}
      </article>

      <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4"><h3 className="text-xl font-semibold text-[#2B1B12]">Recent registrations</h3><Link to="/admin/customers" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#D2552B] transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">View users <ArrowUpRight className="h-4 w-4" /></Link></div>
        {loading ? <div className="mt-4 space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-[68px] animate-pulse rounded-xl bg-gray-50" />)}</div> : recentUsers.length ? <ul className="mt-4 space-y-3">{recentUsers.slice(0, 5).map((registeredUser) => <li key={registeredUser.id} className="flex min-h-[68px] items-center gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-orange-50/60"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-[#9C3E20]" aria-hidden="true">{(registeredUser.name || "U").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#2B1B12]">{registeredUser.name || "Unnamed user"}</p><p className="truncate text-sm text-gray-600" title={registeredUser.email || "No email"}>{registeredUser.email || "No email"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${userRoleStyle(registeredUser.role)}`}>{userRole(registeredUser.role)}</span></li>)}</ul> : <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">No recent registrations</p>}
      </article>
    </section>
  </div>;
};

export default AdminDashboard;
