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
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

export const AdminLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      header: "OPERATIONS",
      items: [
        { label: "Orders", path: "/admin/orders", icon: ShoppingBag },
        { label: "Payments & Earnings", path: "/admin/payments", icon: DollarSign },
        { label: "Dine", path: "/admin/dine", icon: CalendarDays },
        { label: "Workshops", path: "/admin/workshops", icon: BookOpenCheck },
        { label: "Dine Bookings", path: "/admin/dine-bookings", icon: CalendarCheck2 },
        { label: "Workshop Bookings", path: "/admin/workshop-bookings", icon: BookOpenCheck },
      ],
    },
    {
      header: "COMMUNITY",
      items: [
        { label: "Reviews", path: "/admin/reviews", icon: MessageSquareWarning },
        { label: "Social reports", path: "/admin/social-reports", icon: ShieldAlert },
      ],
    },
    {
      header: "ADMINISTRATION",
      items: [
        { label: "Verifications", path: "/admin/verifications", icon: FileCheck },
        { label: "Settings", path: "/admin/settings", icon: Sliders },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#FAF8F5]">
      {/* Desktop Sidebar */}
      <aside aria-label="Admin sidebar" className={`hidden lg:flex flex-col ${sidebarCollapsed ? "w-[76px]" : "w-64"} transition-[width] duration-200 bg-[#2B1B12] text-[#FFF8F0] border-r border-[#2B1B12]/20 shrink-0 sticky top-0 h-screen overflow-hidden`}>
        {/* Sidebar Brand Header */}
        <div className={`shrink-0 border-b border-[#FFF8F0]/10 flex items-center ${sidebarCollapsed ? "flex-col gap-2 px-2 py-3" : "justify-between p-5"}`}>
          <Link to="/admin/dashboard" className={`flex items-center gap-2.5 group ${sidebarCollapsed ? "justify-center" : ""}`} title={sidebarCollapsed ? "TasteBridge Admin home" : undefined}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className={sidebarCollapsed ? "lg:hidden" : ""}>
              <span className="text-xl font-bold bg-gradient-to-r from-red-500 via-amber-400 to-amber-300 bg-clip-text text-transparent block leading-tight">
                TasteBridge
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-400 block -mt-0.5">
                Where Food Meets Heritage
              </span>
            </div>
          </Link>
          <button type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#FFF8F0]/70 transition-colors hover:bg-[#FFF8F0]/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A]">
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav aria-label="Admin navigation" className={`min-h-0 flex-1 overflow-y-auto ${sidebarCollapsed ? "space-y-4 px-2 py-4" : "space-y-6 px-3 py-4"} [scrollbar-color:#6b5143_#2B1B12] [scrollbar-width:thin]`}>
          {navGroups.map((group, gIdx) => (
            <div key={`nav-group-${gIdx}`} className={`space-y-1.5 ${sidebarCollapsed ? "text-center" : ""}`}>
              {group.header && (
                <span className={`px-3 text-xs font-extrabold uppercase tracking-wider text-[#FFF8F0]/40 block mb-2 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                  {group.header}
                </span>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3"} rounded-xl py-2 text-[15px] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] ${
                        isActive
                          ? "bg-[#D2552B] text-white shadow-md shadow-[#D2552B]/20"
                          : "text-[#FFF8F0]/75 hover:bg-[#FFF8F0]/10 hover:text-white"
                      }`
                    }
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Admin Sidebar Footer */}
        <div className={`shrink-0 border-t border-[#FFF8F0]/10 ${sidebarCollapsed ? "p-2" : "p-3"} space-y-1.5`}>
          <button
            onClick={handleLogout}
            aria-label={sidebarCollapsed ? "Sign Out" : undefined}
            title={sidebarCollapsed ? "Sign Out" : undefined}
            className={`flex min-h-11 w-full items-center ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} rounded-xl py-2 text-[15px] font-semibold text-red-400 transition-colors duration-150 hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] cursor-pointer`}
          >
            <LogOut className="h-5 w-5" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Sticky Header */}
        <header className="sticky top-0 z-30 min-h-16 bg-white/95 backdrop-blur-md border-b border-[#2B1B12]/10 px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0"><h1 className="truncate text-base font-bold text-[#2B1B12]">TasteBridge Administration</h1><p className="hidden text-xs text-gray-500 sm:block">TasteBridge Admin Panel</p></div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/admin/notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"
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
            <div className="relative flex-1 max-w-xs w-full bg-[#2B1B12] text-[#FFF8F0] flex flex-col p-4 z-50">
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
              <nav aria-label="Admin navigation" className="min-h-0 flex-1 py-4 space-y-6 overflow-y-auto [scrollbar-color:#6b5143_#2B1B12] [scrollbar-width:thin]">
                {navGroups.map((group, gIdx) => (
                  <div key={`mob-group-${gIdx}`} className="space-y-1">
                    {group.header && (
                      <span className="px-3 text-xs font-extrabold uppercase tracking-wider text-[#FFF8F0]/40 block mb-2">
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
                            `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] ${
                              isActive ? "bg-[#D2552B] text-white shadow-md shadow-[#D2552B]/20" : "text-[#FFF8F0]/75 hover:bg-[#FFF8F0]/10 hover:text-white"
                            }`
                          }
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="shrink-0 border-t border-[#FFF8F0]/10 pt-3">
                <button onClick={handleLogout} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-semibold text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A]">
                  <LogOut className="h-5 w-5" /><span>Sign Out</span>
                </button>
              </div>
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
