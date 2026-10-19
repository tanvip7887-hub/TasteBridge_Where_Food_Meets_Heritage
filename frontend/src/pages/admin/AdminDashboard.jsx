import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../api/adminApi.js";
import {
  Users,
  ChefHat,
  Truck,
  ShoppingBag,
  DollarSign,
  FileCheck,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

export const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await adminApi.getDashboardStats();
      setData(res.data);
    } catch (err) {
      setError(err.message || "Failed to load dashboard statistics.");
    } finally {
      setLoading(false);
    }
  }, []);

  const retryDashboard = () => {
    setLoading(true);
    setError(null);
    void fetchDashboard();
  };

  useEffect(() => {
    let active = true;
    adminApi.getDashboardStats()
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load dashboard statistics.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Loading admin metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
        <p className="text-sm font-semibold text-red-900">{error}</p>
        <button
          onClick={retryDashboard}
          className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const { stats, recentActivity } = data || {};

  const cards = [
    { title: "Total Customers", value: stats?.customersCount ?? 0, icon: Users, color: "bg-blue-500", link: "/admin/customers" },
    { title: "Total Cooks", value: stats?.cooksCount ?? 0, icon: ChefHat, color: "bg-amber-500", link: "/admin/cooks" },
    { title: "Pending Verifications", value: stats?.pendingCookVerificationsCount ?? 0, icon: FileCheck, color: "bg-red-500", link: "/admin/verifications" },
    { title: "Delivery Agents", value: stats?.deliveryAgentsCount ?? 0, icon: Truck, color: "bg-emerald-500", link: "/admin/delivery-agents" },
    { title: "Active Orders", value: stats?.activeOrdersCount ?? 0, icon: ShoppingBag, color: "bg-indigo-500", link: "/admin/orders" },
    { title: "Completed Orders", value: stats?.completedOrdersCount ?? 0, icon: Sparkles, color: "bg-purple-500", link: "/admin/orders" },
    { title: "Platform Revenue", value: `₹${stats?.totalRevenue ?? 0}`, icon: DollarSign, color: "bg-emerald-600", link: "/admin/payments" },
    { title: "Pending Issues", value: stats?.pendingIssuesCount ?? 0, icon: AlertTriangle, color: "bg-rose-500", link: "/admin/reviews" },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-orange-100 shadow-xs">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">System Overview</h2>
          <p className="text-xs text-gray-500 mt-1">Real-time marketplace health & operational metrics</p>
        </div>
        <button
          onClick={retryDashboard}
          className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              to={card.link}
              className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-xs hover:shadow-md transition-all duration-200 group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">{card.title}</span>
                <div className={`w-9 h-9 rounded-xl ${card.color} text-white flex items-center justify-center shadow-xs`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gray-900">{card.value}</span>
                <span className="text-xs font-semibold text-red-600 group-hover:translate-x-0.5 transition-transform flex items-center">
                  View <ArrowUpRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">Recent Orders</h3>
            <Link to="/admin/orders" className="text-xs font-semibold text-red-600 hover:underline">
              View all
            </Link>
          </div>
          {recentActivity?.recentOrders?.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No recent orders recorded.</p>
          ) : (
            <div className="space-y-3">
              {recentActivity?.recentOrders?.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                  <div>
                    <span className="font-bold text-gray-900">{order.orderNumber}</span>
                    <span className="text-gray-500 block text-[11px]">
                      Customer: {order.customer?.name} • Cook: {order.cook?.businessName}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-gray-900 block">₹{order.totalAmount}</span>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 inline-block mt-0.5">
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Registered Users */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-base font-bold text-gray-900">Recent User Registrations</h3>
            <Link to="/admin/customers" className="text-xs font-semibold text-red-600 hover:underline">
              View users
            </Link>
          </div>
          {recentActivity?.recentUsers?.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">No recent user registrations.</p>
          ) : (
            <div className="space-y-3">
              {recentActivity?.recentUsers?.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-xs">
                  <div>
                    <span className="font-bold text-gray-900">{u.name}</span>
                    <span className="text-gray-500 block text-[11px]">{u.email}</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
