import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../../store/slices/authSlice.js";
import LocationDrawer from "./LocationDrawer.jsx";
import AuthModal from "../auth/AuthModal.jsx";
import PortalSwitchButton from "../auth/PortalSwitchButton.jsx";
import { cartApi, CART_UPDATED_EVENT } from "../../api/cartApi.js";
import notificationApi from "../../api/notificationApi.js";
import { isApprovedCook, getCookStatus } from "../../utils/cookAuth.js";
import { isApprovedDeliveryAgent } from "../../utils/deliveryAgentAuth.js";
import { getNavbarPortalSwitchOptions, isDeliveryAgentAccount } from "../../utils/portalSwitchOptions.js";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";
import {
  UtensilsCrossed,
  MapPin,
  ChevronDown,
  ShoppingBag,
  User as UserIcon,
  Menu,
  X,
  UserCheck,
  Package,
  Heart,
  LogOut,
  Shield,
  ChefHat,
  Bike,
  CalendarDays,
  Star,
  Bell,
  Loader2,
  RefreshCw,
} from "lucide-react";

export const Navbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const routerLocation = useLocation();

  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const { selectedLocation } = useSelector((state) => state.location || {});

  // Compute cook status dynamically from authenticated backend user state
  const approvedCook = isApprovedCook(user);
  const cookStatus = getCookStatus(user);
  const approvedDeliveryAgent = isApprovedDeliveryAgent(user);
  const { showCook: showCookPortalSwitch, showDeliveryAgent: showDeliveryAgentPortalSwitch } = getNavbarPortalSwitchOptions(user);
  const activePortal = user?.activePortal || user?.role;
  const hasDeliveryAgentAccount = isDeliveryAgentAccount(user);
  const canUseCart = activePortal === "CUSTOMER";
  const canUseCustomerNotifications = isAuthenticated && activePortal === "CUSTOMER";

  // Dropdown & Mobile Menu States
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'profile' | null
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationPanelPath, setNotificationPanelPath] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationsUserId, setNotificationsUserId] = useState(null);
  const [notificationsSessionKey, setNotificationsSessionKey] = useState(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState(null);
  const [notificationActionError, setNotificationActionError] = useState(null);
  const [notificationActionId, setNotificationActionId] = useState(null);
  const [markingAllNotifications, setMarkingAllNotifications] = useState(false);

  // Auth Modal State (for Logged-Out Landing Navbar)
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");

  const profileRef = useRef(null);
  const notificationsPanelRef = useRef(null);
  const notificationsLoadRef = useRef(null);
  const notificationsRevisionRef = useRef(0);
  const authenticatedUserId = user?.id;
  const notificationSessionKey = `${isAuthenticated ? user?.id || "" : ""}:${activePortal || ""}`;
  const hasCurrentNotificationData = notificationsUserId === user?.id
    && notificationsSessionKey === notificationSessionKey
    && canUseCustomerNotifications;
  const currentNotificationCount = hasCurrentNotificationData
    ? unreadNotificationCount
    : 0;

  const loadCustomerNotifications = useCallback(async () => {
    if (!isAuthenticated || activePortal !== "CUSTOMER" || !authenticatedUserId) return;
    if (notificationsLoadRef.current) return notificationsLoadRef.current;

    setNotificationsLoading(true);
    setNotificationsError(null);
    const revision = notificationsRevisionRef.current;
    const sessionKey = notificationSessionKey;
    const request = (async () => {
      try {
        const response = await notificationApi.list({ page: 1, limit: 30 });
        const payload = response?.data?.data ?? response?.data ?? response;
        if (!Array.isArray(payload?.items) || !Number.isFinite(payload?.unreadCount)) {
          throw new Error("The notifications response was incomplete. Please retry.");
        }
        if (revision === notificationsRevisionRef.current) {
          setNotifications(payload.items);
          setUnreadNotificationCount(payload.unreadCount);
          setNotificationsUserId(authenticatedUserId);
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
  }, [isAuthenticated, activePortal, authenticatedUserId, notificationSessionKey]);

  useEffect(() => {
    notificationsRevisionRef.current += 1;
    notificationsLoadRef.current = null;
    if (!canUseCustomerNotifications) return;
    // Defer the initial fetch so the effect does not synchronously update state.
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadCustomerNotifications();
    });
    return () => { active = false; };
  }, [notificationSessionKey, canUseCustomerNotifications, loadCustomerNotifications]);

  const toggleCustomerNotifications = () => {
    const opening = !notificationsOpen || notificationPanelPath !== routerLocation.pathname;
    setNotificationsOpen(opening);
    setNotificationPanelPath(opening ? routerLocation.pathname : null);
    setActiveDropdown(null);
    if (opening) void loadCustomerNotifications();
  };

  const handleCustomerNotificationRead = async (notification) => {
    if (notification.isRead || notificationActionId || markingAllNotifications) return;
    setNotificationActionId(notification.id);
    setNotificationActionError(null);
    try {
      const response = await notificationApi.markRead(notification.id);
      const payload = response?.data?.data ?? response?.data ?? response;
      if (payload?.isRead !== true) throw new Error("The server did not confirm this notification as read.");
      notificationsRevisionRef.current += 1;
      notificationsLoadRef.current = null;
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
      setUnreadNotificationCount((count) => Math.max(0, count - 1));
      await loadCustomerNotifications();
      const href = notification.metadata?.href;
      if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) {
        setNotificationsOpen(false);
        navigate(href);
      }
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark this notification as read. Please retry.");
    } finally {
      setNotificationActionId(null);
    }
  };

  const handleMarkAllCustomerNotificationsRead = async () => {
    if (markingAllNotifications || unreadNotificationCount === 0) return;
    setMarkingAllNotifications(true);
    setNotificationActionError(null);
    try {
      const response = await notificationApi.markAllRead();
      const payload = response?.data?.data ?? response?.data ?? response;
      if (!Number.isFinite(payload?.unreadCount) || payload.unreadCount !== 0) {
        throw new Error("The server did not confirm that all notifications were read.");
      }
      notificationsRevisionRef.current += 1;
      notificationsLoadRef.current = null;
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
      setUnreadNotificationCount(0);
      await loadCustomerNotifications();
    } catch (error) {
      setNotificationActionError(error?.message || "Could not mark all notifications as read. Please retry.");
    } finally {
      setMarkingAllNotifications(false);
    }
  };

  useEffect(() => {
    const openLogin = () => {
      setAuthMode("login");
      setAuthModalOpen(true);
    };
    window.addEventListener(OPEN_AUTH_MODAL_EVENT, openLogin);
    return () => window.removeEventListener(OPEN_AUTH_MODAL_EVENT, openLogin);
  }, []);

  useEffect(() => {
    let active = true;
    const updateCount = (event) => {
      if (active) setCartItemCount(event?.detail?.itemCount ?? 0);
    };
    if (!isAuthenticated || !canUseCart) {
      return () => { active = false; };
    }
    const controller = new AbortController();
    window.addEventListener(CART_UPDATED_EVENT, updateCount);
    cartApi.getCart({ signal: controller.signal })
      .then((response) => {
        if (active) setCartItemCount(response?.data?.totals?.itemCount ?? 0);
      })
      .catch((error) => {
        if (active && error?.status === 401) setCartItemCount(0);
      });
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener(CART_UPDATED_EVENT, updateCount);
    };
  }, [isAuthenticated, canUseCart, user?.id]);

  // Close dropdowns on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!profileRef.current || !profileRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
      if (!notificationsPanelRef.current?.contains(event.target)
        && !event.target.closest?.("[data-customer-notifications-toggle]")
      ) {
        setNotificationsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setActiveDropdown(null);
        setNotificationsOpen(false);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [routerLocation]);

  const handleLogout = () => {
    dispatch(logout());
    setCartItemCount(0);
    setActiveDropdown(null);
    setNotificationsOpen(false);
    setNotifications([]);
    setNotificationsUserId(null);
    setNotificationsSessionKey(null);
    setUnreadNotificationCount(0);
    navigate("/");
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  };

  const toggleDropdown = (dropdownName) => {
    if (activeDropdown === dropdownName) {
      setActiveDropdown(null);
    } else {
      setActiveDropdown(dropdownName);
    }
  };

  // User display first name (e.g. "TANVI")
  const userFirstName = user?.name
    ? user.name.split(" ")[0].toUpperCase()
    : "TANVI";
  const visibleCustomerNotifications = hasCurrentNotificationData ? notifications : [];

  /* =========================================================================
     1. LOGGED-OUT NAVBAR (PRESERVED LANDING PAGE NAVBAR EXACTLY)
     ========================================================================= */
  if (!isAuthenticated) {
    return (
      <>
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-orange-100 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xl font-bold bg-gradient-to-r from-red-700 via-amber-600 to-amber-800 bg-clip-text text-transparent">
                  TasteBridge
                </span>
                <span className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold text-amber-700">
                  Where Food Meets Heritage
                </span>
              </div>
            </Link>



            {/* Public Navigation & Auth Actions */}
            <div className="flex items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAuth("login")}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-red-600 transition-colors cursor-pointer"
                >
                  Log In
                </button>
                <button
                  onClick={() => openAuth("register")}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-xs transition-all hover:shadow-md cursor-pointer"
                >
                  Sign Up
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Reusable Auth Modal */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          initialMode={authMode}
        />
      </>
    );
  }

  /* =========================================================================
     2. LOGGED-IN NAVBAR (HOMEPAGE LOGGED-IN NAVBAR)
     Items left-to-right:
     1. TasteBridge Logo (exact same logo)
     2. Location selector (📍 Select location ▼)
     3. Become a Cook
     4. Become a Delivery Agent
     5. Cart (badge 0)
     6. Profile button & ProfileDropdown (thin terracotta top border, exactly 4 items)
     ========================================================================= */
  return (
    <>
      <header className="sticky top-0 z-40 bg-[#FFF8F0] border-b border-[#2B1B12]/10 shadow-xs h-[72px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-3 sm:gap-6">

          {/* LEFT SIDE: 1. Logo & 2. Location Selector */}
          <div className="flex items-center gap-3 sm:gap-6 min-w-0">
            {/* 1. Exact Same TasteBridge Logo */}
            <Link
              to="/"
              className="flex items-center gap-2.5 group shrink-0"
              aria-label="TasteBridge Home"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-red-500/20 group-hover:scale-105 transition-transform">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xl font-bold bg-gradient-to-r from-red-700 via-amber-600 to-amber-800 bg-clip-text text-transparent">
                  TasteBridge
                </span>
                <span className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold text-amber-700">
                  Where Food Meets Heritage
                </span>
              </div>
            </Link>

            {/* 2. Location Selector (📍 Select location ▼) */}
            <button
              onClick={() => {
                setLocationDrawerOpen(true);
                setActiveDropdown(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#2B1B12]/15 text-xs font-medium text-[#2B1B12] hover:border-red-600 transition-all max-w-[140px] sm:max-w-[200px] cursor-pointer"
              aria-label="Select delivery location"
            >
              <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0" />
              <span className="truncate font-sans font-medium">
                {selectedLocation?.shortName || "Select location"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            </button>
          </div>

          {/* DESKTOP NAV ITEMS (3, 4, 5, 6, 7) */}
          <div className="hidden md:flex items-center gap-6">
            {/* 3. Cook Navigation Button:
                - Approved Cook: "Switch to Cook Mode" linking to /cook/dashboard
                - Pending / Revision / Rejected: Application status label linking to /become-a-cook
                - Public / Unapplied: "Become a Cook" linking to /become-a-cook
            */}
            {!hasDeliveryAgentAccount && (showCookPortalSwitch ? (
              <PortalSwitchButton
                portal="COOK"
                to="/cook"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs font-bold transition-all"
              >
                <ChefHat className="w-3.5 h-3.5 text-red-600" />
                <span>Switch to Cook Mode</span>
              </PortalSwitchButton>
            ) : !approvedCook && cookStatus === "PENDING" ? (
              <Link
                to="/become-a-cook"
                className="text-xs font-semibold text-amber-700 hover:text-amber-800 transition-colors flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Application Pending</span>
              </Link>
            ) : !approvedCook && cookStatus === "NEEDS_REVISION" ? (
              <Link
                to="/become-a-cook"
                className="text-xs font-semibold text-orange-700 hover:text-orange-800 transition-colors flex items-center gap-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Action Required</span>
              </Link>
            ) : !approvedCook && cookStatus === "REJECTED" ? (
              <Link
                to="/become-a-cook"
                className="text-xs font-semibold text-gray-700 hover:text-red-600 transition-colors"
              >
                Application Status
              </Link>
            ) : !approvedCook && !hasDeliveryAgentAccount ? (
              <Link
                to="/become-a-cook"
                className="text-xs font-semibold text-gray-700 hover:text-red-600 transition-colors"
              >
                Become a Cook
              </Link>
            ) : null)}

            {/* Approved delivery agents can switch panels; applicants retain the application link. */}
            {showDeliveryAgentPortalSwitch ? (
              <PortalSwitchButton
                portal="DELIVERY_AGENT"
                to="/delivery-agent"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 text-xs font-bold transition-all"
              >
                <Bike className="w-3.5 h-3.5 text-blue-700" />
                <span>Switch to Delivery Agent</span>
              </PortalSwitchButton>
            ) : !approvedDeliveryAgent && !approvedCook && !hasDeliveryAgentAccount && (
              <Link
                to="/become-a-delivery-agent"
                className="text-xs font-semibold text-gray-700 hover:text-red-600 transition-colors"
              >
                Become a Delivery Agent
              </Link>
            )}

            {/* 5. Cart */}
            {canUseCart && <Link
              to="/cart"
              className="relative p-2 text-gray-700 hover:text-red-600 hover:bg-white rounded-full transition-colors cursor-pointer flex items-center"
              aria-label="View shopping cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{cartItemCount > 99 ? "99+" : cartItemCount}</span>}
            </Link>}

            {canUseCustomerNotifications && (
              <button
                type="button"
                data-customer-notifications-toggle
                onClick={toggleCustomerNotifications}
                className="relative p-2 text-gray-700 hover:text-red-600 hover:bg-white rounded-full transition-colors cursor-pointer"
                aria-label={`View notifications${currentNotificationCount ? `, ${currentNotificationCount} unread` : ""}`}
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {currentNotificationCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{currentNotificationCount > 99 ? "99+" : currentNotificationCount}</span>}
              </button>
            )}

            {/* 6. Profile Button & ProfileDropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => toggleDropdown("profile")}
                className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 border border-gray-200 rounded-full transition-colors cursor-pointer"
                aria-label="User profile menu"
              >
                <UserIcon className="w-4 h-4 text-red-600" />
                <span className="text-xs font-bold text-gray-900 uppercase">
                  {userFirstName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </button>

              {/* LOGGED-IN PROFILE DROPDOWN: Small white card, rounded corners, soft shadow, thin terracotta line along top edge */}
              {activeDropdown === "profile" && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border-t-4 border-t-[#D2552B] border-x border-b border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left font-medium">
                  {user?.role === "ADMIN" && (
                    <Link
                      to="/admin/dashboard"
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-red-600 bg-red-50/70 hover:bg-red-100 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-red-600" /> Admin Portal
                    </Link>
                  )}

                  {/* Item 1: Profile */}
                  <Link
                    to="/profile"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FFF8F0] hover:text-[#D2552B] transition-colors"
                  >
                    <UserCheck className="w-4 h-4 text-gray-500" /> Profile
                  </Link>

                  {/* Item 2: Orders */}
                  <Link
                    to="/orders"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FFF8F0] hover:text-[#D2552B] transition-colors"
                  >
                    <Package className="w-4 h-4 text-gray-500" /> Orders
                  </Link>

                  <Link
                    to="/my-events"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FFF8F0] hover:text-[#D2552B] transition-colors"
                  >
                    <CalendarDays className="w-4 h-4 text-gray-500" /> My Events
                  </Link>

                  <Link to="/reviews" onClick={() => setActiveDropdown(null)} className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FFF8F0] hover:text-[#D2552B] transition-colors">
                    <Star className="w-4 h-4 text-gray-500" /> My Reviews
                  </Link>

                  {/* Item 3: Favourites */}
                  <Link
                    to="/favourites"
                    onClick={() => setActiveDropdown(null)}
                    className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-800 hover:bg-[#FFF8F0] hover:text-[#D2552B] transition-colors"
                  >
                    <Heart className="w-4 h-4 text-gray-500" /> Favourites
                  </Link>

                  {/* Item 4: Logout */}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-4 h-4 text-red-500" /> Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* MOBILE NAVBAR (< 768px): Logo, Location, Cart, Profile, Hamburger */}
          <div className="flex md:hidden items-center gap-2">
            {/* Mobile Cart */}
            {canUseCart && <Link
              to="/cart"
              className="relative p-2 text-gray-700 hover:text-red-600 rounded-full cursor-pointer"
              aria-label="View shopping cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartItemCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{cartItemCount > 99 ? "99+" : cartItemCount}</span>}
            </Link>}

            {canUseCustomerNotifications && (
              <button
                type="button"
                data-customer-notifications-toggle
                onClick={toggleCustomerNotifications}
                className="relative p-2 text-gray-700 hover:text-red-600 rounded-full cursor-pointer"
                aria-label={`View notifications${currentNotificationCount ? `, ${currentNotificationCount} unread` : ""}`}
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {currentNotificationCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{currentNotificationCount > 99 ? "99+" : currentNotificationCount}</span>}
              </button>
            )}

            {/* Mobile Profile Trigger */}
            <button
              onClick={() => toggleDropdown("profile")}
              className="p-2 text-red-600 hover:bg-white rounded-full transition-colors cursor-pointer"
              aria-label="User profile menu"
            >
              <UserIcon className="w-5 h-5" />
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-700 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
              aria-label="Toggle mobile navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {notificationsOpen && notificationPanelPath === routerLocation.pathname && canUseCustomerNotifications && (
          <section
            ref={notificationsPanelRef}
            aria-label="Customer notifications"
            className="absolute right-3 sm:right-6 top-full mt-2 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-xl z-50"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Notifications</h2>
                <p className="text-xs text-gray-500">{currentNotificationCount} unread</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadCustomerNotifications()}
                  disabled={notificationsLoading}
                  className="rounded-lg p-2 text-gray-500 hover:bg-orange-50 hover:text-red-600 disabled:opacity-50"
                  aria-label="Refresh notifications"
                  title="Refresh notifications"
                >
                  {notificationsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </button>
                {currentNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllCustomerNotificationsRead}
                    disabled={markingAllNotifications || Boolean(notificationActionId)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {markingAllNotifications ? "Marking…" : "Mark all as read"}
                  </button>
                )}
              </div>
            </div>

            {(notificationsError || notificationActionError) && (
              <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-800" role="alert">
                <p>{notificationActionError || notificationsError}</p>
                {notificationsError && (
                  <button
                    type="button"
                    onClick={() => void loadCustomerNotifications()}
                    disabled={notificationsLoading}
                    className="mt-1 font-bold underline disabled:opacity-50"
                  >Retry</button>
                )}
              </div>
            )}

            {notificationsLoading && visibleCustomerNotifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-gray-500" role="status">
                <Loader2 className="h-4 w-4 animate-spin text-red-600" /> Loading notifications…
              </div>
            ) : visibleCustomerNotifications.length === 0 && !notificationsError ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
            ) : (
              <ul className="max-h-[min(60vh,28rem)] divide-y divide-gray-100 overflow-y-auto">
                {visibleCustomerNotifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void handleCustomerNotificationRead(notification)}
                      disabled={notification.isRead || notificationActionId === notification.id || markingAllNotifications}
                      className={`w-full px-4 py-3 text-left transition-colors disabled:cursor-default ${notification.isRead ? "bg-white" : "bg-orange-50/60 hover:bg-orange-50"}`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900">{notification.title}</span>
                          <span className="mt-1 block whitespace-normal text-xs leading-5 text-gray-600">{notification.message}</span>
                          <time className="mt-2 block text-[11px] text-gray-400" dateTime={notification.createdAt}>
                            {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ""}
                          </time>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${notification.isRead ? "bg-gray-100 text-gray-500" : "bg-red-100 text-red-700"}`}>
                          {notification.isRead ? "Read" : notificationActionId === notification.id ? "Saving…" : "Unread"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* MOBILE SLIDE-OUT MENU PANEL */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#FFF8F0] border-b border-[#2B1B12]/10 px-4 py-5 space-y-3 animate-in slide-in-from-top duration-200 shadow-lg text-left">
            {user?.role === "ADMIN" && (
              <Link
                to="/admin/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 p-2.5 text-sm font-bold text-red-600 bg-red-50 rounded-xl transition-colors"
              >
                <Shield className="w-4 h-4 text-red-600" /> Admin Portal
              </Link>
            )}
            {!hasDeliveryAgentAccount && (showCookPortalSwitch ? (
              <PortalSwitchButton
                portal="COOK"
                to="/cook"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 p-2.5 text-sm font-bold text-red-600 bg-red-50 rounded-xl transition-colors"
              >
                <ChefHat className="w-4 h-4 text-red-600" /> Switch to Cook Mode
              </PortalSwitchButton>
            ) : !approvedCook && cookStatus === "PENDING" ? (
              <Link
                to="/become-a-cook"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 p-2.5 text-sm font-semibold text-amber-800 bg-amber-50 rounded-xl transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Application Pending</span>
              </Link>
            ) : !approvedCook && cookStatus === "NEEDS_REVISION" ? (
              <Link
                to="/become-a-cook"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 p-2.5 text-sm font-semibold text-orange-800 bg-orange-50 rounded-xl transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                <span>Action Required</span>
              </Link>
            ) : !approvedCook && !hasDeliveryAgentAccount ? (
              <Link
                to="/become-a-cook"
                onClick={() => setMobileMenuOpen(false)}
                className="block p-2.5 text-sm font-semibold text-gray-900 hover:bg-white rounded-xl transition-colors"
              >
                {cookStatus === "REJECTED" ? "Application Status" : "Become a Cook"}
              </Link>
            ) : null)}
            {showDeliveryAgentPortalSwitch ? (
              <PortalSwitchButton
                portal="DELIVERY_AGENT"
                to="/delivery-agent"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 p-2.5 text-sm font-bold text-blue-800 bg-blue-50 rounded-xl transition-colors"
              >
                <Bike className="w-4 h-4 text-blue-700" /> Switch to Delivery Agent
              </PortalSwitchButton>
            ) : !approvedDeliveryAgent && !approvedCook && !hasDeliveryAgentAccount && (
              <Link
                to="/become-a-delivery-agent"
                onClick={() => setMobileMenuOpen(false)}
                className="block p-2.5 text-sm font-semibold text-gray-900 hover:bg-white rounded-xl transition-colors"
              >
                Become a Delivery Agent
              </Link>
            )}
          </div>
        )}
      </header>

      {/* Location Drawer */}
      <LocationDrawer
        isOpen={locationDrawerOpen}
        onClose={() => setLocationDrawerOpen(false)}
      />
    </>
  );
};

export default Navbar;
