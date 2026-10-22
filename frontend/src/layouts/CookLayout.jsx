import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout, updateUserProfile } from "../store/slices/authSlice.js";
import cookApi from "../api/cookApi.js";
import notificationApi from "../api/notificationApi.js";
import { canLoadCookNotifications, isApprovedCook } from "../utils/cookAuth.js";
import { countCookUnreadNotifications, mergeCookNotificationFeeds } from "../utils/cookNotifications.js";
import PortalSwitchButton from "../components/auth/PortalSwitchButton.jsx";
import {
  Home,
  UtensilsCrossed,
  BookOpen,
  ShoppingBag,
  Calendar,
  CalendarCheck,
  Wallet,
  MessageSquare,
  ChefHat,
  Menu,
  X,
  Compass,
  LogOut,
  Bell,
  ShieldCheck,
  Clock,
  Loader2,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import ErrorBoundary from "../components/common/ErrorBoundary.jsx";
import { calculateOrderCounts } from "../pages/cook/panel/cookOrderConstants.js";

function Sidebar({ children, className, ...props }) {
  return <aside className={className} {...props}>{children}</aside>;
}

function TopBar({ children }) {
  return <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-[#2B1B12]/10 bg-[#FFF8F0]/95 px-4 py-3 backdrop-blur-md sm:px-6">{children}</header>;
}

export const CookLayout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState(null);
  const [sharedNotifications, setSharedNotifications] = useState([]);
  const [legacyCookNotifications, setLegacyCookNotifications] = useState([]);
  const [sharedUnreadCount, setSharedUnreadCount] = useState(0);
  const [legacyUnreadCount, setLegacyUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(null);
  const [notificationActionError, setNotificationActionError] = useState(null);
  const [notificationActionId, setNotificationActionId] = useState(null);
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);
  const [cookOrders, setCookOrders] = useState([]);
  const [manualOrdersLoading, setManualOrdersLoading] = useState(false);
  const [ordersLoadedForUserId, setOrdersLoadedForUserId] = useState(null);
  const [ordersErrorState, setOrdersErrorState] = useState({ userId: null, message: null });

  const notificationsRef = useRef(null);
  const notificationLoadRef = useRef(null);
  const notificationRevisionRef = useRef(0);
  const ordersLoadRef = useRef(null);
  const ordersRevisionRef = useRef(0);

  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const cookProfile = user?.cookProfile;
  const kitchenName = cookProfile?.businessName || user?.name || "Home Cook";
  const isKitchenOpen = cookProfile?.isOpen !== false;
  const verificationStatus = cookProfile?.verificationStatus;
  const isApproved = verificationStatus === "APPROVED";
  const canFetchCookOrders = user?.activePortal === "COOK" && isApprovedCook(user);
  const loadingOrders = manualOrdersLoading || (
    canFetchCookOrders && Boolean(user?.id) && ordersLoadedForUserId !== user.id
  );
  const ordersError = ordersErrorState.userId === user?.id ? ordersErrorState.message : null;
  const canFetchCookNotifications = canLoadCookNotifications(user);
  const cookNotifications = useMemo(
    () => mergeCookNotificationFeeds(sharedNotifications, legacyCookNotifications),
    [sharedNotifications, legacyCookNotifications],
  );
  const notificationUnreadCount = countCookUnreadNotifications(
    sharedUnreadCount,
    legacyUnreadCount,
    cookNotifications,
  );

  // Close notifications on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadCookNotifications = useCallback(async () => {
    if (!canFetchCookNotifications) return;
    if (notificationLoadRef.current) return notificationLoadRef.current;

    setNotificationsLoading(true);
    setNotificationsError(null);
    const requestRevision = notificationRevisionRef.current;
    const request = (async () => {
      const [sharedResult, legacyResult] = await Promise.allSettled([
        notificationApi.list({ page: 1, limit: 30 }),
        cookApi.getNotifications(),
      ]);
      if (requestRevision !== notificationRevisionRef.current) return;
      const errors = [];
      if (sharedResult.status === "fulfilled") {
        const payload = sharedResult.value?.data?.data ?? sharedResult.value?.data ?? sharedResult.value;
        const items = Array.isArray(payload?.items) ? payload.items : [];
        setSharedNotifications(items.map((item) => ({ ...item, source: "shared" })));
        setSharedUnreadCount(Number.isFinite(payload?.unreadCount) ? payload.unreadCount : items.filter((item) => !item.isRead).length);
      } else {
        errors.push(`Shared notifications: ${sharedResult.reason?.message || "could not be loaded."}`);
      }
      if (legacyResult.status === "fulfilled") {
        const payload = legacyResult.value?.data?.data ?? legacyResult.value?.data ?? legacyResult.value;
        const items = Array.isArray(payload?.notifications) ? payload.notifications : [];
        setLegacyCookNotifications(items.map((item) => ({ ...item, source: "legacy" })));
        setLegacyUnreadCount(Number.isFinite(payload?.unreadCount) ? payload.unreadCount : items.filter((item) => !item.isRead).length);
      } else {
        errors.push(`Existing Cook alerts: ${legacyResult.reason?.message || "could not be loaded."}`);
      }
      if (errors.length) setNotificationsError(errors.join(" "));
    })();
    notificationLoadRef.current = request;
    try {
      await request;
    } finally {
      notificationLoadRef.current = null;
      setNotificationsLoading(false);
    }
  }, [canFetchCookNotifications]);

  useEffect(() => {
    if (!canFetchCookNotifications) return;
    loadCookNotifications();
    return () => {
      notificationRevisionRef.current += 1;
    };
  }, [canFetchCookNotifications, loadCookNotifications]);

  const requestCookOrders = useCallback(async () => {
    if (!canFetchCookOrders) return;
    if (ordersLoadRef.current?.userId === user?.id) return ordersLoadRef.current.promise;

    const requestRevision = ordersRevisionRef.current;
    const requestUserId = user?.id;

    const request = (async () => {
      try {
        const res = await cookApi.getOrders();
        if (requestRevision !== ordersRevisionRef.current) return;
        const payload = res?.data?.data ?? res?.data ?? res;
        const items = Array.isArray(payload) ? payload : payload?.items;
        setCookOrders(Array.isArray(items) ? items : []);
      } catch (err) {
        if (requestRevision !== ordersRevisionRef.current) return;
        console.error("Failed to load cook orders", err);
        setOrdersErrorState({ userId: requestUserId, message: err?.message || "Failed to load orders" });
      } finally {
        if (requestRevision === ordersRevisionRef.current) {
          setOrdersLoadedForUserId(requestUserId);
        }
      }
    })();

    const requestEntry = { userId: requestUserId, promise: request };
    ordersLoadRef.current = requestEntry;
    try {
      await request;
    } finally {
      if (ordersLoadRef.current === requestEntry) ordersLoadRef.current = null;
    }
  }, [canFetchCookOrders, user?.id]);

  const loadCookOrders = useCallback(async () => {
    if (!canFetchCookOrders) return;
    setManualOrdersLoading(true);
    setOrdersErrorState({ userId: user?.id, message: null });
    try {
      await requestCookOrders();
    } finally {
      setManualOrdersLoading(false);
    }
  }, [canFetchCookOrders, requestCookOrders, user?.id]);

  useEffect(() => {
    if (!canFetchCookOrders) return;
    requestCookOrders();
    return () => {
      ordersRevisionRef.current += 1;
    };
  }, [canFetchCookOrders, requestCookOrders]);

  const orderCounts = calculateOrderCounts(cookOrders);

  const handleNotificationClick = async (notification) => {
    const targetNotification = notification.sources?.find((item) => !item.isRead) || notification;
    if (targetNotification.isRead) return;
    if (notificationActionId || markingAllNotifications) return;
    setNotificationActionId(targetNotification.id);
    setNotificationActionError(null);
    try {
      const response = targetNotification.source === "legacy"
        ? await cookApi.markNotificationRead(targetNotification.id)
        : await notificationApi.markRead(targetNotification.id);
      const payload = response?.data?.data ?? response?.data ?? response;
      if (payload?.isRead !== true) throw new Error("The server did not confirm this notification as read.");
      notificationRevisionRef.current += 1;
      if (targetNotification.source === "legacy") {
        setLegacyCookNotifications((items) => items.map((item) => item.id === targetNotification.id ? { ...item, isRead: true } : item));
        if (!targetNotification.isRead) setLegacyUnreadCount((count) => Math.max(0, count - 1));
      } else {
        setSharedNotifications((items) => items.map((item) => item.id === targetNotification.id ? { ...item, isRead: true } : item));
        if (!targetNotification.isRead) setSharedUnreadCount((count) => Math.max(0, count - 1));
      }
      await loadCookNotifications();
      const href = targetNotification.metadata?.href;
      if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) {
        setNotificationsOpen(false);
        navigate(href);
      }
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark this notification as read. Try again.");
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (markingAllNotifications || notificationUnreadCount === 0) return;
    setMarkingAllNotifications(true);
    setNotificationActionError(null);
    try {
      const sharedResponse = await notificationApi.markAllRead();
      const sharedPayload = sharedResponse?.data?.data ?? sharedResponse?.data ?? sharedResponse;
      if (!Number.isFinite(sharedPayload?.unreadCount) || sharedPayload.unreadCount !== 0) {
        throw new Error("The server did not confirm that all shared notifications were read.");
      }

      const cookResponse = await cookApi.markAllNotificationsRead();
      const cookPayload = cookResponse?.data?.data ?? cookResponse?.data ?? cookResponse;
      if (!Number.isFinite(cookPayload?.unreadCount) || cookPayload.unreadCount !== 0) {
        throw new Error("The server did not confirm that all Cook alerts were read.");
      }

      // Both stores confirmed completion; invalidate any older in-flight read
      // so its stale unread counts cannot restore the bell badge.
      notificationRevisionRef.current += 1;
      setSharedNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setSharedUnreadCount(0);
      setLegacyCookNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setLegacyUnreadCount(0);
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark all notifications as read. Try again.");
      notificationRevisionRef.current += 1;
      void loadCookNotifications();
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/");
  };

  // Kitchen profile values from authenticated user
  // Persistent Kitchen Open/Closed toggle handler using existing backend API
  const handleToggleKitchenStatus = async () => {
    if (statusUpdating) return;
    const newStatus = !isKitchenOpen;
    try {
      setStatusUpdating(true);
      setStatusFeedback(null);
      const res = await cookApi.updateKitchenProfile({ isOpen: newStatus });
      const updated = res.data?.data || res.data;

      // Persist directly into Redux user state
      if (user?.cookProfile) {
        dispatch(
          updateUserProfile({
            cookProfile: {
              ...user.cookProfile,
              isOpen: updated?.isOpen ?? newStatus,
            },
          })
        );
      }
      setStatusFeedback({
        type: "success",
        message: newStatus ? "Kitchen is now Open for orders." : "Kitchen is now Closed.",
      });
      setTimeout(() => setStatusFeedback(null), 3000);
    } catch (err) {
      console.error("Failed to update kitchen open/closed status", err);
      setStatusFeedback({
        type: "error",
        message: err.response?.data?.message || "Failed to update kitchen status.",
      });
      setTimeout(() => setStatusFeedback(null), 4000);
    } finally {
      setStatusUpdating(false);
    }
  };

  // Navigation Groups per the simplified specifications
  const navigationGroups = [
    {
      groupTitle: "Home",
      items: [
        {
          label: "Home",
          path: "/cook",
          icon: Home,
          aliases: ["/cook/dashboard"],
        },
      ],
    },
    {
      groupTitle: "My food",
      items: [
        { label: "My dishes", path: "/cook/dishes", icon: UtensilsCrossed },
        { label: "My stories", path: "/cook/stories", icon: BookOpen },
        { label: "Food orders", path: "/cook/orders", icon: ShoppingBag },
      ],
    },
    {
      groupTitle: "Dine and learn",
      items: [
        {
          label: "My events",
          path: "/cook/events",
          icon: Calendar,
          aliases: ["/cook/experiences"],
        },
        { label: "Dine Bookings", path: "/cook/dine-bookings", icon: CalendarCheck },
        { label: "Workshop Bookings", path: "/cook/workshop-bookings", icon: BookOpen },
      ],
    },
    {
      groupTitle: "Money and feedback",
      items: [
        { label: "Earnings", path: "/cook/earnings", icon: Wallet },
        { label: "Reviews", path: "/cook/reviews", icon: MessageSquare },
      ],
    },
    {
      groupTitle: "Account",
      items: [
        {
          label: "Kitchen profile",
          path: "/cook/profile",
          icon: ChefHat,
          aliases: ["/cook/kitchen"],
        },
      ],
    },
  ];

  // Helper to determine if a nav link is currently active
  const isItemActive = (item) => {
    const current = location.pathname;
    if (item.path === "/cook") {
      return current === "/cook" || current === "/cook/" || current === "/cook/dashboard";
    }
    if (item.aliases && item.aliases.some((alias) => current === alias || current.startsWith(`${alias}/`))) {
      return true;
    }
    return current === item.path || current.startsWith(`${item.path}/`);
  };

  const isOrdersRoute = location.pathname === "/cook/orders" || location.pathname.startsWith("/cook/orders/");

  // Derive active page header label
  let activeTitle = "Cook Panel";
  if (isOrdersRoute) {
    activeTitle = "Food orders";
  } else {
    for (const group of navigationGroups) {
      for (const item of group.items) {
        if (isItemActive(item)) {
          activeTitle = item.label;
          break;
        }
      }
    }
  }

  const renderNavItem = (item, isMobile = false, isCollapsed = false) => {
    const Icon = item.icon;
    const active = isItemActive(item);
    const isFoodOrders = item.path === "/cook/orders";

    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => {
          if (isMobile) setMobileMenuOpen(false);
        }}
        title={isCollapsed ? item.label : undefined}
        aria-label={isCollapsed ? item.label : undefined}
        className={`relative flex min-h-11 w-full items-center ${isCollapsed ? "justify-center px-2" : "gap-3 px-3"} rounded-xl py-2 text-[15px] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] ${
          active
            ? "bg-[#D2552B] text-white shadow-md shadow-[#D2552B]/20"
            : "text-[#FFF8F0]/75 hover:bg-[#FFF8F0]/10 hover:text-white"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!isCollapsed && <span>{item.label}</span>}
        {isFoodOrders && orderCounts.pending > 0 && (
          <span className={`${isCollapsed ? "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center px-1" : "ml-auto px-1.5 py-0.5"} rounded-full text-[10px] font-extrabold bg-amber-400 text-stone-900 shadow-xs`}>
            {orderCounts.pending}
          </span>
        )}
      </NavLink>
    );
  };

  const renderTabletNavItem = (item) => {
    const Icon = item.icon;
    const active = isItemActive(item);
    const isFoodOrders = item.path === "/cook/orders";

    return (
      <NavLink
        key={item.path}
        to={item.path}
        title={item.label}
        aria-label={item.label}
        className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] ${
          active
            ? "bg-[#D2552B] text-white shadow-md shadow-[#D2552B]/20"
            : "text-[#FFF8F0]/75 hover:bg-[#FFF8F0]/10 hover:text-white"
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {isFoodOrders && orderCounts.pending > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-stone-900 shadow-xs">
            {orderCounts.pending}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#FFF8F0] text-[#2B1B12]">
      {/* =========================================================================
          DESKTOP PERSISTENT SIDEBAR
         ========================================================================= */}
      <Sidebar aria-label="Cook sidebar" className={`sticky top-0 hidden h-screen ${sidebarCollapsed ? "w-[76px]" : "w-[260px]"} shrink-0 flex-col overflow-y-auto border-r border-[#2B1B12]/20 bg-[#2B1B12] text-[#FFF8F0] transition-[width] duration-200 lg:flex`}>
        {/* Brand Header */}
        <div className={`border-b border-[#FFF8F0]/10 flex items-center ${sidebarCollapsed ? "flex-col gap-2 p-3" : "justify-between p-5"}`}>
          <Link to="/cook" aria-label="TasteBridge Cook Home" className={`flex items-center gap-2.5 group ${sidebarCollapsed ? "justify-center" : ""}`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && <div>
              <span className="text-xl font-bold bg-gradient-to-r from-red-500 via-amber-400 to-amber-300 bg-clip-text text-transparent block leading-tight">
                TasteBridge
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold text-amber-400 block -mt-0.5">
                Where Food Meets Heritage
              </span>
            </div>}
          </Link>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#FFF8F0]/70 transition-colors duration-150 hover:bg-[#FFF8F0]/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A]"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>

        {/* Grouped Navigation Links */}
        <nav aria-label="Cook navigation" className="flex-1 space-y-6 px-3 py-4">
          {navigationGroups.map((group, groupIndex) => (
            <div key={`group-${groupIndex}`} className={`space-y-1.5 ${sidebarCollapsed ? "flex flex-col items-center" : ""}`}>
              {!sidebarCollapsed && <span className="mb-2 block px-3 text-xs font-extrabold uppercase tracking-wider text-[#FFF8F0]/40">
                {group.groupTitle}
              </span>}
              {group.items.map((item) => renderNavItem(item, false, sidebarCollapsed))}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer Actions */}
        <div className="space-y-1.5 border-t border-[#FFF8F0]/10 p-3">
          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? "Sign Out" : undefined}
            aria-label={sidebarCollapsed ? "Sign Out" : undefined}
            className={`flex min-h-11 w-full items-center ${sidebarCollapsed ? "justify-center px-2" : "gap-3 px-3"} rounded-xl py-2 text-[15px] font-semibold text-red-400 transition-colors duration-150 hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A] cursor-pointer text-left`}
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </Sidebar>

      {/* Tablet icon rail; the hamburger opens the full navigation drawer. */}
      <Sidebar aria-label="Cook sidebar" className="sticky top-0 hidden h-screen w-[72px] shrink-0 flex-col items-center overflow-y-auto border-r border-[#2B1B12]/20 bg-[#2B1B12] text-[#FFF8F0] md:flex lg:hidden">
        <Link to="/cook" aria-label="TasteBridge Cook Home" className="flex h-[73px] w-full items-center justify-center border-b border-[#FFF8F0]/10">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 text-white shadow-md shadow-red-500/20">
            <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
          </span>
        </Link>
        <nav aria-label="Cook navigation" className="flex flex-1 flex-col items-center gap-3 px-2 py-4">
          {navigationGroups.map((group, groupIndex) => (
            <div key={`tablet-group-${groupIndex}`} className="flex flex-col items-center gap-2 border-b border-[#FFF8F0]/10 pb-3 last:border-0">
              {group.items.map(renderTabletNavItem)}
            </div>
          ))}
        </nav>
        <div className="w-full border-t border-[#FFF8F0]/10 p-3">
          <button type="button" onClick={handleLogout} title="Sign Out" aria-label="Sign Out" className="flex h-11 w-11 items-center justify-center rounded-xl text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4A52A]">
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </Sidebar>

      {/* =========================================================================
          MAIN CONTENT AREA & TOP HEADER
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Sticky Header */}
        <TopBar>
          {/* Left: Hamburger & Active Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#2B1B12]/10 p-2 text-[#2B1B12] transition duration-150 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] md:hidden cursor-pointer shrink-0"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-[#2B1B12] tracking-tight truncate">
                  {activeTitle}
                </h1>
                {/* Kitchen Name Display */}
                <span className="hidden sm:inline-block text-xs text-[#2B1B12]/60 font-medium">
                  &bull; {kitchenName}
                </span>
              </div>
              <p className="text-xs text-[#2B1B12]/50 hidden md:block">
                TasteBridge Cook Panel
              </p>
            </div>
          </div>

          {/* Right Header Quick Actions & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Read-Only Verification Badge */}
            {isApproved ? (
              <div
                className="hidden min-h-9 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 select-none cursor-default shrink-0 md:inline-flex"
                title="Your kitchen is verified and approved on TasteBridge"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified Cook</span>
              </div>
            ) : verificationStatus === "PENDING" ? (
              <div
                className="hidden min-h-9 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 select-none cursor-default shrink-0 md:inline-flex"
                title="Cook verification is in review"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Pending Verification</span>
              </div>
            ) : null}

            {/* Kitchen Open/Closed Switch */}
            <button
              type="button"
              onClick={handleToggleKitchenStatus}
              disabled={statusUpdating}
              role="switch"
              aria-checked={isKitchenOpen}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] cursor-pointer ${
                isKitchenOpen
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                  : "bg-stone-100 border-stone-300 text-stone-700 hover:bg-stone-200"
              } ${statusUpdating ? "opacity-60 cursor-wait" : ""}`}
              title={
                isKitchenOpen
                  ? "Kitchen is Open (accepting orders). Click to close."
                  : "Kitchen is Closed. Click to reopen."
              }
            >
              {statusUpdating ? (
                <Loader2 className="w-3 h-3 animate-spin text-stone-600" />
              ) : (
                <span
                  className={`w-2 h-2 rounded-full ${
                    isKitchenOpen ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                  }`}
                />
              )}
              <span className="hidden lg:inline">
                {isKitchenOpen ? "Kitchen Open" : "Kitchen Closed"}
              </span>
              <span className="lg:hidden">
                {isKitchenOpen ? "Open" : "Closed"}
              </span>
              {/* Toggle switch track indicator */}
              <div
                className={`w-7 h-3.5 rounded-full p-0.5 transition-colors hidden sm:flex items-center ${
                  isKitchenOpen ? "bg-emerald-600 justify-end" : "bg-stone-300 justify-start"
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-xs" />
              </div>
            </button>

            {/* Notification Bell */}
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => {
                  const opening = !notificationsOpen;
                  setNotificationsOpen(opening);
                  if (opening && canFetchCookNotifications) loadCookNotifications();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#2B1B12]/10 text-[#2B1B12]/80 transition-colors duration-150 hover:bg-white hover:text-[#2B1B12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] cursor-pointer"
                aria-label="View notifications"
                title="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                {notificationUnreadCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">{notificationUnreadCount}</span>}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-[#2B1B12]/10 p-4 z-50 text-left animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[#2B1B12]/10">
                    <span className="text-xs font-extrabold text-[#2B1B12]">Notifications</span>
                    <span className="text-xs text-[#2B1B12]/50 font-medium">{notificationUnreadCount ? `${notificationUnreadCount} unread` : "Up to date"}</span>
                  </div>
                  {notificationUnreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotificationsRead}
                      disabled={markingAllNotifications}
                      className="mt-2 min-h-11 text-xs font-bold text-[#D2552B] hover:underline disabled:opacity-60"
                    >
                      {markingAllNotifications ? "Marking all as read…" : "Mark all as read"}
                    </button>
                  )}
                  {notificationsError && (
                    <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      <p>{notificationsError}</p>
                      <button type="button" onClick={loadCookNotifications} className="mt-1 font-bold underline">Retry</button>
                    </div>
                  )}
                  {notificationActionError && (
                    <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {notificationActionError}
                    </div>
                  )}
                  {notificationsLoading ? (
                    <div role="status" className="flex items-center justify-center gap-2 py-6 text-xs text-[#2B1B12]/60">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading notifications…
                    </div>
                  ) : cookNotifications.length ? (
                    <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-[#2B1B12]/10">
                      {cookNotifications.map((notification) => (
                        <button
                          key={notification.displayKey || `${notification.source}-${notification.id}`}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          disabled={notification.sources?.some((item) => item.id === notificationActionId) || markingAllNotifications || notificationsLoading}
                          className={`w-full py-3 text-left disabled:cursor-wait ${notification.isRead ? "opacity-65" : "hover:bg-orange-50/60"}`}
                          aria-label={`${notification.isRead ? "Read" : "Unread"}: ${notification.title}`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="block text-xs font-bold text-[#2B1B12]">{notification.title}</span>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${notification.isRead ? "bg-stone-100 text-stone-500" : "bg-orange-100 text-orange-800"}`}>
                              {notification.isRead ? "Read" : "Unread"}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-[#2B1B12]/70">{notification.message}</span>
                          <span className="mt-1 block text-xs text-[#2B1B12]/45">
                            {Number.isNaN(new Date(notification.createdAt).getTime()) ? "" : new Date(notification.createdAt).toLocaleString()}
                          </span>
                          {notification.sources?.some((item) => item.id === notificationActionId) && <span className="mt-1 block text-xs text-[#2B1B12]/50">Updating…</span>}
                        </button>
                      ))}
                    </div>
                  ) : notificationsError ? (
                    <div className="py-5 text-center text-xs text-[#2B1B12]/60">Notifications could not be loaded.</div>
                  ) : (
                    <div className="py-6 text-center text-xs text-[#2B1B12]/60">
                      {notificationsLoading ? "Loading notifications…" : "No notifications yet."}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Switch to Marketplace Link (Preserved & Visible) */}
            <PortalSwitchButton
              portal="CUSTOMER"
              to="/"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-[#2B1B12]/15 bg-white px-3 py-1.5 text-xs font-bold text-[#D2552B] shadow-2xs transition-all duration-150 hover:border-[#D2552B] hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"
              title="Navigate to customer marketplace"
            >
              <Compass className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Switch to Marketplace</span>
              <span className="xl:hidden">Marketplace</span>
            </PortalSwitchButton>

          </div>
        </TopBar>

        {/* =========================================================================
            PERSISTENT CLOSED KITCHEN WARNING BANNER
           ========================================================================= */}
        {!isKitchenOpen && (
          <div className="bg-amber-100/90 border-b border-amber-300/80 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-amber-950 text-xs sm:text-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="truncate sm:whitespace-normal font-medium">
                <strong className="font-bold">Your kitchen is currently closed.</strong> Dishes cannot be ordered by customers right now.
              </span>
            </div>
            <button
              type="button"
              onClick={handleToggleKitchenStatus}
              disabled={statusUpdating}
              className="shrink-0 px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              Reopen Kitchen
            </button>
          </div>
        )}

        {/* Temporary Feedback Toast */}
        {statusFeedback && (
          <div
            className={`px-4 sm:px-6 py-2 text-xs font-bold flex items-center justify-between border-b ${
              statusFeedback.type === "success"
                ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                : "bg-red-100 text-red-900 border-red-200"
            }`}
          >
            <span>{statusFeedback.message}</span>
            <button
              onClick={() => setStatusFeedback(null)}
              className="text-stone-500 hover:text-stone-800 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* =========================================================================
            MOBILE COLLAPSIBLE SIDEBAR DRAWER
           ========================================================================= */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Drawer */}
            <div className="relative flex-1 max-w-xs w-full bg-[#2B1B12] text-[#FFF8F0] flex flex-col p-4 z-50 animate-in slide-in-from-left duration-200 shadow-2xl">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-[#FFF8F0]/10">
                <Link
                  to="/cook"
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
                  className="p-1.5 rounded-lg text-[#FFF8F0]/70 hover:text-white hover:bg-[#FFF8F0]/10 cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Nav Groups */}
              <nav className="flex-1 py-4 space-y-4 overflow-y-auto">
                {navigationGroups.map((group, groupIndex) => (
                  <div key={`m-group-${groupIndex}`} className="space-y-1">
                    <span className="mb-2 block px-3 text-xs font-extrabold uppercase tracking-wider text-[#FFF8F0]/40">
                      {group.groupTitle}
                    </span>
                    {group.items.map((item) => renderNavItem(item, true))}
                  </div>
                ))}
              </nav>

              {/* Mobile Drawer Footer Actions */}
              <div className="pt-3 border-t border-[#FFF8F0]/10 space-y-2">
                <PortalSwitchButton
                  portal="CUSTOMER"
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#FFF8F0]/80 hover:bg-[#FFF8F0]/10 text-left"
                >
                  <Compass className="w-4 h-4 text-[#D2552B]" />
                  <span>Switch to Marketplace</span>
                </PortalSwitchButton>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/40 text-left cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Page Content Outlet */}
        <main className={`flex-1 w-full p-4 sm:p-6 lg:p-8 ${location.pathname === "/cook" || location.pathname === "/cook/" || location.pathname === "/cook/dashboard" ? "max-w-none" : "mx-auto max-w-7xl"}`}>
          <ErrorBoundary>
            <Outlet
              context={{
                orders: cookOrders,
                setOrders: setCookOrders,
                orderCounts,
                loadingOrders,
                ordersError,
                refreshOrders: loadCookOrders,
              }}
            />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default CookLayout;
