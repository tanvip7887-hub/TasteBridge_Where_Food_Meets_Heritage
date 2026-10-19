import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../store/slices/authSlice.js";
import {
  LayoutDashboard,
  ChefHat,
  Truck,
  Users,
  UtensilsCrossed,
  Tag,
  ShoppingBag,
  DollarSign,
  CalendarDays,
  CalendarCheck2,
  BookOpenCheck,
  MessageSquareWarning,
  ShieldAlert,
  FileCheck,
  Bell,
  Sliders,
  LogOut,
  Menu,
  X,
} from "lucide-react";

export const AdminLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate("/");
  };

  const navGroups = [
    {
      items: [
        { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
      ],
    },
    {
      header: "USERS",
      items: [
        { label: "Customers", path: "/admin/customers", icon: Users },
        { label: "Cooks", path: "/admin/cooks", icon: ChefHat },
        { label: "Delivery Agents", path: "/admin/delivery-agents", icon: Truck },
      ],
    },
    {
      header: "FOOD",
      items: [
        { label: "Categories", path: "/admin/categories", icon: Tag },
        { label: "Dishes", path: "/admin/dishes", icon: UtensilsCrossed },
      ],
    },
    {
      items: [
        { label: "Orders", path: "/admin/orders", icon: ShoppingBag },
        { label: "Payments & Earnings", path: "/admin/payments", icon: DollarSign },
        { label: "Dine", path: "/admin/dine", icon: CalendarDays },
        { label: "Workshops", path: "/admin/workshops", icon: BookOpenCheck },
        { label: "Dine Bookings", path: "/admin/dine-bookings", icon: CalendarCheck2 },
        { label: "Workshop Bookings", path: "/admin/workshop-bookings", icon: BookOpenCheck },
        { label: "Reviews", path: "/admin/reviews", icon: MessageSquareWarning },
        { label: "Social reports", path: "/admin/social-reports", icon: ShieldAlert },
        { label: "Verifications", path: "/admin/verifications", icon: FileCheck },
        { label: "Settings", path: "/admin/settings", icon: Sliders },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#FAF8F5]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-slate-100 border-r border-slate-800 shrink-0 sticky top-0 h-screen overflow-y-auto">
        {/* Sidebar Brand Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <Link to="/admin/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-red-500 via-amber-400 to-amber-300 bg-clip-text text-transparent block leading-tight">
                TasteBridge
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-400 block -mt-0.5">
                Where Food Meets Heritage
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 px-3 py-4 space-y-4">
          {navGroups.map((group, gIdx) => (
            <div key={`nav-group-${gIdx}`} className="space-y-1">
              {group.header && (
                <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                  {group.header}
                </span>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                        isActive
                          ? "bg-red-600 text-white shadow-sm"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Admin Sidebar Footer */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base font-bold text-gray-900 hidden sm:block">TasteBridge Administration</h1>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/admin/notifications"
              className="relative p-2 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
              title="Platform Alerts"
              aria-label="Platform alerts"
            >
              <Bell className="w-5 h-5" />
            </Link>

            <div className="h-5 w-px bg-gray-200" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 font-bold text-xs flex items-center justify-center border border-red-200">
                {user?.name?.charAt(0) || "A"}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-bold text-gray-900 leading-none">{user?.name || "Administrator"}</p>
                <p className="text-[10px] text-gray-500 font-medium leading-none mt-1">{user?.email || "admin@tastebridge.com"}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative flex-1 max-w-xs w-full bg-slate-900 text-slate-100 flex flex-col p-4 z-50">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <Link
                  to="/admin/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 shrink-0">
                    <UtensilsCrossed className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-base font-bold bg-gradient-to-r from-red-500 via-amber-400 to-amber-300 bg-clip-text text-transparent block leading-tight">
                      TasteBridge
                    </span>
                    <span className="text-[8px] uppercase tracking-wider font-semibold text-amber-400 block">
                      Where Food Meets Heritage
                    </span>
                  </div>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 py-4 space-y-4 overflow-y-auto">
                {navGroups.map((group, gIdx) => (
                  <div key={`mob-group-${gIdx}`} className="space-y-1">
                    {group.header && (
                      <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block mb-1">
                        {group.header}
                      </span>
                    )}
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                              isActive ? "bg-red-600 text-white" : "text-slate-300 hover:bg-slate-800"
                            }`
                          }
                        >
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main Outlet Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
