import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  Bell, Bike, Compass, History, Home, Loader2,
  LogOut, Menu, PackageCheck, PanelLeftClose, PanelLeftOpen, RefreshCw, UserRound, Wallet, X,
} from "lucide-react";
import { logout } from "../store/slices/authSlice.js";
import { deliveryAgentApi } from "../api/deliveryAgentApi.js";
import notificationApi from "../api/notificationApi.js";
import PortalSwitchButton from "../components/auth/PortalSwitchButton.jsx";
import { isApprovedDeliveryAgent } from "../utils/deliveryAgentAuth.js";

const navigationGroups = [
  { title: "Home", items: [{ label: "Home", path: "/delivery-agent", icon: Home, end: true }] },
  { title: "Deliveries", items: [
    { label: "Available", path: "/delivery-agent/available", icon: PackageCheck },
    { label: "Current delivery", path: "/delivery-agent/current", icon: Bike },
    { label: "History", path: "/delivery-agent/history", icon: History },
  ] },
  { title: "Money", items: [{ label: "Earnings", path: "/delivery-agent/earnings", icon: Wallet }] },
  { title: "Account", items: [
    { label: "My profile", path: "/delivery-agent/profile", icon: UserRound },
  ] },
];

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const DeliveryAgentLayout = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [availabilityUpdating, setAvailabilityUpdating] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPanelPath, setNotificationPanelPath] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsUserId, setNotificationsUserId] = useState(null);
  const [notificationsSessionKey, setNotificationsSessionKey] = useState(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationActionError, setNotificationActionError] = useState("");
  const [notificationActionId, setNotificationActionId] = useState(null);
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadRef = useRef(null);
  const notificationsRevisionRef = useRef(0);

  const canLoadDeliveryAgentNotifications = Boolean(
    user?.activePortal === "DELIVERY_AGENT" && isApprovedDeliveryAgent(user)
  );
  const notificationSessionKey = `${user?.id || ""}:${user?.activePortal || ""}`;
  const hasCurrentNotificationData = canLoadDeliveryAgentNotifications
    && notificationsUserId === user?.id
    && notificationsSessionKey === notificationSessionKey;
  const currentUnreadNotificationCount = hasCurrentNotificationData ? unreadNotificationCount : 0;
  const visibleNotifications = hasCurrentNotificationData ? notifications : [];

  const loadDeliveryAgentNotifications = useCallback(async () => {
    if (user?.activePortal !== "DELIVERY_AGENT" || !isApprovedDeliveryAgent(user) || !user?.id) return;
    if (notificationsLoadRef.current) return notificationsLoadRef.current;

    setNotificationsLoading(true);
    setNotificationsError("");
    const revision = notificationsRevisionRef.current;
    const sessionKey = `${user.id}:${user.activePortal}`;
    const request = (async () => {
      try {
        const payload = unwrap(await notificationApi.list({ page: 1, limit: 30 }));
        if (!Array.isArray(payload?.items) || !Number.isFinite(payload?.unreadCount)) {
          throw new Error("The notifications response was incomplete. Please retry.");
        }
        if (revision === notificationsRevisionRef.current) {
          setNotifications(payload.items);
          setUnreadNotificationCount(payload.unreadCount);
          setNotificationsUserId(user.id);
          setNotificationsSessionKey(sessionKey);
        }
      } catch (error) {
        if (revision === notificationsRevisionRef.current) {
          setNotificationsError(error?.message || "Could not load notifications. Please retry.");
        }
      } finally {
        if (notificationsLoadRef.current === request) {
          notificationsLoadRef.current = null;
          setNotificationsLoading(false);
        }
      }
    })();
    notificationsLoadRef.current = request;
    return request;
  }, [user]);

  useEffect(() => {
    notificationsRevisionRef.current += 1;
    notificationsLoadRef.current = null;
    if (!canLoadDeliveryAgentNotifications) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadDeliveryAgentNotifications();
    });
    return () => { active = false; };
  }, [canLoadDeliveryAgentNotifications, notificationSessionKey, loadDeliveryAgentNotifications]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!notificationsPanelRef.current?.contains(event.target)
        && !event.target.closest?.("[data-delivery-notifications-toggle]")) {
        setNotificationsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const toggleNotifications = () => {
    const opening = !notificationsOpen || notificationPanelPath !== location.pathname;
    setNotificationsOpen(opening);
    setNotificationPanelPath(opening ? location.pathname : null);
    if (opening) void loadDeliveryAgentNotifications();
  };

  const markNotificationRead = async (notification) => {
    if (notification.isRead || notificationActionId || markingAllNotifications) return;
    setNotificationActionId(notification.id);
    setNotificationActionError("");
    try {
      const payload = unwrap(await notificationApi.markRead(notification.id));
      if (payload?.isRead !== true) throw new Error("The server did not confirm this notification as read.");
      notificationsRevisionRef.current += 1;
      notificationsLoadRef.current = null;
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
      setUnreadNotificationCount((count) => Math.max(0, count - 1));
      await loadDeliveryAgentNotifications();
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark this notification as read. Please retry.");
    } finally {
      setNotificationActionId(null);
    }
  };

  const markAllNotificationsRead = async () => {
    if (markingAllNotifications || currentUnreadNotificationCount === 0) return;
    setMarkingAllNotifications(true);
    setNotificationActionError("");
    try {
      const payload = unwrap(await notificationApi.markAllRead());
      if (!Number.isFinite(payload?.unreadCount) || payload.unreadCount !== 0) {
        throw new Error("The server did not confirm that all notifications were read.");
      }
      notificationsRevisionRef.current += 1;
      notificationsLoadRef.current = null;
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setUnreadNotificationCount(0);
      await loadDeliveryAgentNotifications();
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark all notifications as read. Please retry.");
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  const refreshDashboard = useCallback(async () => {
    setLoadError("");
    setLoading(true);
    try {
      const result = unwrap(await deliveryAgentApi.getPanelAccess());
      setDashboard(result);
      return result;
    } catch (error) {
      setLoadError(error?.message || "We could not load your delivery dashboard.");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    deliveryAgentApi.getPanelAccess()
      .then((response) => { if (active) setDashboard(unwrap(response)); })
      .catch((error) => {
        if (active) setLoadError(error?.message || "We could not load your delivery dashboard.");
        if (active && (error?.status === 401 || error?.status === 403)) navigate("/", { replace: true });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigate]);

  const readiness = dashboard?.readiness;
  const capabilities = dashboard?.capabilities || {};
  const isOnline = dashboard?.agent?.isOnline === true;
  const pageTitle = ({
    "/delivery-agent": "Home",
    "/delivery-agent/available": "Available deliveries",
    "/delivery-agent/current": "Current delivery",
    "/delivery-agent/history": "History",
    "/delivery-agent/earnings": "Earnings",
    "/delivery-agent/profile": "My profile",
  })[location.pathname];
  const headerTitle = pageTitle || dashboard?.agent?.name || user?.name || "Delivery Agent";
  const availabilityLocked = !readiness?.readyToWork || availabilityUpdating;

  const toggleAvailability = async () => {
    if (availabilityLocked) return;
    setAvailabilityUpdating(true);
    setAvailabilityError("");
    try {
      await deliveryAgentApi.updateAvailability(!isOnline);
      await refreshDashboard();
    } catch (error) {
      setAvailabilityError(error?.message || "Your availability could not be updated.");
      if (error?.status === 409) await refreshDashboard().catch(() => {});
    } finally {
      setAvailabilityUpdating(false);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate("/");
  };

  const renderNavigation = (mobile = false, collapsed = false) => (
    <nav aria-label="Delivery agent navigation" className={collapsed ? "space-y-4" : "space-y-5"}>
      {navigationGroups.map((group) => (
        <section key={group.title} className={collapsed ? "text-center" : ""}>
          {group.title !== "Home" && <h2 className={`mb-2 px-3 text-[10px] font-extrabold uppercase tracking-wider text-[#FFF8F0]/40 ${collapsed ? "lg:hidden" : ""}`}>{group.title}</h2>}
          <div className="space-y-1">
            {group.items.map(({ label, path, icon: Icon, end }) => {
              const isOperationalSection = group.title === "Deliveries" || group.title === "Money";
              const deliveryToolsUnavailable = group.title === "Deliveries" && !capabilities.deliveryAssignmentAvailable;
              const earningsUnavailable = group.title === "Money" && !capabilities.earningsAvailable;
              const locked = isOperationalSection && (!readiness?.readyToWork || deliveryToolsUnavailable || earningsUnavailable);
              const explanation = deliveryToolsUnavailable
                ? "Delivery assignments are not available yet."
                : earningsUnavailable
                  ? "Delivery earnings are not available yet."
                  : "Complete your profile and verification to unlock this section.";

              if (locked) {
                return (
                  <div key={path} aria-disabled="true" title={collapsed ? `${label}: ${explanation}` : explanation} className={`flex cursor-not-allowed items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} rounded-xl py-2 text-xs font-bold text-[#FFF8F0]/35`}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
                    <span className="sr-only">Unavailable. {explanation}</span>
                  </div>
                );
              }

              return (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  onClick={() => { if (mobile) setMobileMenuOpen(false); }}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) => `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} rounded-xl py-2 text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${isActive ? "bg-[#D2552B] text-white shadow-md shadow-[#D2552B]/20" : "text-[#FFF8F0]/75 hover:bg-[#FFF8F0]/10 hover:text-white"}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
                </NavLink>
              );
            })}
          </div>
        </section>
      ))}
      {!collapsed && (!readiness?.readyToWork || !capabilities.deliveryAssignmentAvailable || !capabilities.earningsAvailable) && (
        <p className="mx-3 border-t border-white/10 pt-3 text-[11px] leading-5 text-white/50">
          Delivery tools unlock after verification and when assignments are available.
        </p>
      )}
    </nav>
  );

  const signOutButton = (collapsed = false) => (
    <button type="button" onClick={handleLogout} aria-label={collapsed ? "Sign Out" : undefined} title={collapsed ? "Sign Out" : undefined} className={`flex min-h-11 w-full items-center ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"} rounded-xl py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300`}>
      <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />{!collapsed && " Sign Out"}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#FFF8F0] text-[#2B1B12] lg:flex">
      <aside className={`sticky top-0 hidden h-screen ${sidebarCollapsed ? "w-[76px]" : "w-64"} shrink-0 flex-col overflow-y-auto border-r border-[#2B1B12]/20 bg-[#2B1B12] text-[#FFF8F0] transition-[width] duration-200 lg:flex`}>
        <div className={`flex min-h-[88px] items-center border-b border-[#FFF8F0]/10 ${sidebarCollapsed ? "flex-col justify-center gap-2 px-2 py-3" : "justify-between gap-3 px-5"}`}>
        <Link to="/delivery-agent" className={`flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : ""}`} aria-label="TasteBridge Delivery Agent Panel home" title={sidebarCollapsed ? "TasteBridge Delivery Agent Panel home" : undefined}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 text-white shadow-md shadow-red-500/20"><Bike className="h-5 w-5" aria-hidden="true" /></span>
          <span className={sidebarCollapsed ? "lg:hidden" : ""}><span className="block bg-gradient-to-r from-red-500 via-amber-400 to-amber-300 bg-clip-text text-xl font-bold leading-tight text-transparent">TasteBridge</span><span className="-mt-0.5 block text-[9px] font-semibold uppercase tracking-wider text-amber-400">Delivery Panel</span></span>
        </Link>
        <button type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#FFF8F0]/70 transition-colors hover:bg-[#FFF8F0]/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
        </button>
        </div>
        <div className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "space-y-4 px-2 py-4" : "space-y-4 px-3 py-4"}`}>{renderNavigation(false, sidebarCollapsed)}</div>
        <div className={`border-t border-[#FFF8F0]/10 ${sidebarCollapsed ? "p-2" : "p-3"}`}>{signOutButton(sidebarCollapsed)}</div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 relative flex min-h-[72px] items-center justify-between gap-3 border-b border-[#2B1B12]/10 bg-[#FFF8F0]/95 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="shrink-0 rounded-xl border border-[#2B1B12]/10 p-2 text-[#2B1B12] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:hidden" aria-label="Open delivery navigation"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0"><p className="truncate text-base font-extrabold tracking-tight text-[#2B1B12] sm:text-lg">{headerTitle}</p><p className="hidden text-[10px] text-[#2B1B12]/50 md:block">TasteBridge Delivery Agent Panel</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {canLoadDeliveryAgentNotifications && (
              <button
                type="button"
                data-delivery-notifications-toggle
                onClick={toggleNotifications}
                aria-label={`View notifications${currentUnreadNotificationCount ? `, ${currentUnreadNotificationCount} unread` : ""}`}
                aria-expanded={notificationsOpen}
                className="relative rounded-full p-2 text-[#2B1B12] transition-colors hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {currentUnreadNotificationCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{currentUnreadNotificationCount > 99 ? "99+" : currentUnreadNotificationCount}</span>}
              </button>
            )}
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 sm:inline-flex"><Bike className="h-3.5 w-3.5" aria-hidden="true" />Verified agent</span>
            <button
              type="button"
              role="switch"
              aria-checked={isOnline}
              aria-label="Online availability"
              title={readiness?.readyToWork ? "Change your availability" : "Complete the readiness requirements before going online"}
              disabled={availabilityLocked}
              onClick={toggleAvailability}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60 ${isOnline ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-stone-300 bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
            >
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
              <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
              {availabilityUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className={`flex h-4 w-7 items-center rounded-full p-0.5 ${isOnline ? "justify-end bg-emerald-600" : "justify-start bg-gray-400"}`}><span className="h-3 w-3 rounded-full bg-white" /></span>}
            </button>
            <PortalSwitchButton portal="CUSTOMER" to="/" onClick={() => setMobileMenuOpen(false)} className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"><Compass className="h-4 w-4" /><span className="hidden sm:inline">Switch to Customer</span><span className="sm:hidden">Customer</span></PortalSwitchButton>
          </div>

          {notificationsOpen && notificationPanelPath === location.pathname && canLoadDeliveryAgentNotifications && (
            <section
              ref={notificationsPanelRef}
              aria-label="Delivery agent notifications"
              className="absolute right-3 top-full mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-orange-100 bg-white text-[#2B1B12] shadow-xl sm:right-6"
            >
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold">Notifications</h2>
                  <p className="text-xs text-gray-500">{currentUnreadNotificationCount} unread</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void loadDeliveryAgentNotifications()} disabled={notificationsLoading} aria-label="Refresh notifications" title="Refresh notifications" className="rounded-lg p-2 text-gray-500 hover:bg-orange-50 hover:text-red-600 disabled:opacity-50">
                    {notificationsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </button>
                  {currentUnreadNotificationCount > 0 && <button type="button" onClick={markAllNotificationsRead} disabled={markingAllNotifications || Boolean(notificationActionId)} className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50">{markingAllNotifications ? "Marking…" : "Mark all as read"}</button>}
                </div>
              </div>

              {(notificationsError || notificationActionError) && <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800" role="alert">
                <p>{notificationActionError || notificationsError}</p>
                {notificationsError && <button type="button" onClick={() => void loadDeliveryAgentNotifications()} disabled={notificationsLoading} className="mt-1 font-bold underline disabled:opacity-50">Retry</button>}
              </div>}

              {notificationsLoading && visibleNotifications.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500" role="status"><Loader2 className="h-4 w-4 animate-spin text-red-600" />Loading notifications…</div>
              ) : visibleNotifications.length === 0 && !notificationsError ? (
                <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
              ) : (
                <ul className="max-h-[min(60vh,28rem)] divide-y divide-gray-100 overflow-y-auto">
                  {visibleNotifications.map((notification) => <li key={notification.id}>
                    <button type="button" onClick={() => void markNotificationRead(notification)} disabled={notification.isRead || notificationActionId === notification.id || markingAllNotifications} className={`w-full px-4 py-3 text-left transition-colors disabled:cursor-default ${notification.isRead ? "bg-white" : "bg-orange-50/60 hover:bg-orange-50"}`}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{notification.title}</span>
                          <span className="mt-1 block whitespace-normal text-xs leading-5 text-gray-600">{notification.message}</span>
                          <time className="mt-2 block text-[11px] text-gray-400" dateTime={notification.createdAt}>{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ""}</time>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${notification.isRead ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700"}`}>{notification.isRead ? "Read" : notificationActionId === notification.id ? "Saving…" : "Unread"}</span>
                      </span>
                    </button>
                  </li>)}
                </ul>
              )}
            </section>
          )}
        </header>

        {availabilityError && <p className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 sm:mx-6" role="alert">{availabilityError}</p>}
        <main className="p-4 sm:p-6 lg:p-8"><Outlet context={{ dashboard, loading, loadError, refreshDashboard, isOnline, availabilityUpdating, toggleAvailability }} /></main>
      </div>

      {mobileMenuOpen && <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
        <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
        <aside className="relative flex h-full w-[min(16rem,85vw)] flex-col bg-[#2B1B12] text-[#FFF8F0] shadow-2xl" aria-label="Mobile delivery navigation">
          <div className="flex min-h-[76px] items-center justify-between border-b border-[#FFF8F0]/10 px-4"><Link to="/delivery-agent" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 font-bold"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-red-600 to-amber-500"><Bike className="h-5 w-5" /></span><span><span className="block">TasteBridge</span><span className="block text-[9px] font-semibold uppercase tracking-wider text-amber-400">Delivery Panel</span></span></Link><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><X className="h-5 w-5" /></button></div>
          <div className="flex-1 overflow-y-auto space-y-4 px-3 py-4">{renderNavigation(true)}</div><div className="border-t border-[#FFF8F0]/10 p-3">{signOutButton(false)}</div>
        </aside>
      </div>}
    </div>
  );
};

export default DeliveryAgentLayout;
