import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Package,
  Phone,
  Receipt,
  ShoppingBag,
  User,
  UtensilsCrossed,
  X,
} from "lucide-react";
import cookApi from "../../../api/cookApi.js";
import {
  COOK_ORDER_STATUS_OPTIONS,
  getStatusGroup,
  calculateOrderCounts,
} from "./cookOrderConstants.js";

const formatStatus = (status = "UNKNOWN") =>
  status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value) || 0);

const formatPaymentMethod = (method) => method === "ONLINE" ? "Online" : method || "COD";

const getErrorMessage = (error) =>
  error?.message || "Could not complete the order action. Please try again.";

const requestOrders = async () => {
  const response = await cookApi.getOrders();
  const payload = response?.data?.data ?? response?.data ?? response;
  const items = Array.isArray(payload) ? payload : payload?.items;
  if (!Array.isArray(items)) throw new Error("The orders response was not in the expected format.");
  return items;
};

const addressText = (address) => [
  address?.addressLine1,
  address?.addressLine2,
  address?.landmark,
  address?.locality,
  address?.city,
  address?.state,
  address?.pincode,
].filter(Boolean).join(", ");

const getStatusBadge = (status) => {
  switch (status) {
    case "PENDING":
      return { label: "Pending", bg: "bg-amber-100 text-amber-900 border-amber-300" };
    case "CONFIRMED":
      return { label: "Confirmed", bg: "bg-blue-100 text-blue-900 border-blue-300" };
    case "PREPARING":
      return { label: "Preparing", bg: "bg-indigo-100 text-indigo-900 border-indigo-300" };
    case "READY_FOR_PICKUP":
      return { label: "Ready for pickup", bg: "bg-emerald-100 text-emerald-900 border-emerald-300" };
    case "OUT_FOR_DELIVERY":
      return { label: "Out for delivery", bg: "bg-purple-100 text-purple-900 border-purple-300" };
    case "DELIVERED":
      return { label: "Completed / Delivered", bg: "bg-emerald-100 text-emerald-900 border-emerald-300" };
    case "CANCELLED":
      return { label: "Cancelled", bg: "bg-red-100 text-red-900 border-red-300" };
    default:
      return { label: formatStatus(status), bg: "bg-gray-100 text-gray-800 border-gray-200" };
  }
};

function StatusBadge({ label, className }) {
  return <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${className}`}>{label}</span>;
}

function OrderTabs({ activeGroup, statusCounts, onSelect, fallbackRef }) {
  return (
    <nav ref={fallbackRef} tabIndex={-1} aria-label="Order status filter tabs" className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
      {COOK_ORDER_STATUS_OPTIONS.map((group) => {
        const isActive = activeGroup.id === group.id;
        const count = statusCounts[group.id] || 0;
        return <button
          key={group.id}
          type="button"
          onClick={() => onSelect(group.id)}
          aria-pressed={isActive}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 sm:text-sm ${isActive ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-[#2B1B12]/15 bg-white text-[#2B1B12]/75 hover:bg-orange-50 hover:text-[#2B1B12]"}`}
        >
          <span>{group.label}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-xs font-extrabold ${isActive ? "bg-white/25 text-white" : count > 0 && group.id === "pending" ? "bg-amber-100 text-amber-900" : count > 0 ? "bg-gray-100 text-gray-700" : "text-gray-400"}`}>{count}</span>
        </button>;
      })}
    </nav>
  );
}

function OrderItemRow({ item }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:gap-4">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white text-gray-400 sm:h-16 sm:w-16">
        <UtensilsCrossed className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />
        {item.dishImage && <img src={item.dishImage} alt={item.name || "Ordered dish"} className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900" title={item.name}>{item.name}</p>
        <p className="mt-0.5 text-xs text-gray-600">× {item.quantity} <span className="ml-1">{formatMoney(item.unitPrice)} each</span></p>
      </div>
      <strong className="shrink-0 text-sm font-extrabold text-gray-900">{formatMoney(item.totalPrice)}</strong>
    </li>
  );
}

function OrderActionBar({ order, canAccept, action, actionOrderId, onAccept, onAdvance, compact = false }) {
  const message = {
    PENDING: "New order received. Accept to confirm kitchen preparation.",
    CONFIRMED: "Order confirmed. Start cooking when ready.",
    PREPARING: "Dish is cooking. Mark ready once food is packed.",
    READY_FOR_PICKUP: "Food is packed and ready for delivery partner pickup.",
    OUT_FOR_DELIVERY: "Order has been picked up by delivery partner.",
    DELIVERED: "Order successfully delivered to customer.",
    CANCELLED: "This order has been cancelled.",
  }[order.status];

  return (
    <div className={`flex flex-col gap-3 rounded-xl border border-orange-100 bg-orange-50/50 p-4 sm:flex-row sm:items-center sm:justify-between ${compact ? "mt-3" : ""}`}>
      <div className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">Order action</span>
        <p className="mt-0.5 text-xs font-semibold text-[#2B1B12]">{message}</p>
        {order.status === "READY_FOR_PICKUP" && <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Ready for pickup</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        {canAccept && <button type="button" onClick={() => onAccept(order.id)} disabled={Boolean(actionOrderId)} className="inline-flex min-h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-xs transition duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {actionOrderId === order.id ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Accepting…</> : "Accept order"}
        </button>}
        {action && <button type="button" onClick={() => onAdvance(order.id, action)} disabled={Boolean(actionOrderId)} className="inline-flex min-h-11 min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-xs transition duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
          {actionOrderId === order.id ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{action.pendingLabel}</> : action.label}
        </button>}
      </div>
    </div>
  );
}

function OrderCard({ order, onOpen, canAccept, action, actionOrderId, onAccept, onAdvance }) {
  const address = order.checkout?.addressSnapshot || order.address;
  const items = order.items || [];
  const status = getStatusBadge(order.status);
  const time = order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Time unavailable";
  const orderReference = order.orderNumber || order.id;
  const actionMessage = {
    PENDING: "New order received. Accept to confirm kitchen preparation.",
    CONFIRMED: "Order confirmed. Start cooking when ready.",
    PREPARING: "Dish is cooking. Mark ready once food is packed.",
    READY_FOR_PICKUP: "Food is packed and ready for delivery partner pickup.",
    OUT_FOR_DELIVERY: "Order has been picked up by delivery partner.",
    DELIVERED: "Order successfully delivered to customer.",
    CANCELLED: "This order has been cancelled.",
  }[order.status];

  return (
    <article className="rounded-2xl border border-[#2B1B12]/10 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Placed {order.createdAt ? new Date(order.createdAt).toLocaleString() : "date unavailable"}</p>
          <h2 className="mt-1 truncate text-base font-extrabold text-[#2B1B12]" title={`Order #${orderReference}`}>Order #{orderReference}</h2>
          <p className="mt-1 text-sm text-gray-600">{items.length} {items.length === 1 ? "item" : "items"} · {formatMoney(order.totalAmount)}</p>
        </div>
        <button type="button" onClick={onOpen} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-4 text-sm font-semibold text-[#2B1B12] transition duration-150 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 sm:w-auto">
          <Package className="h-4 w-4" aria-hidden="true" /> View details
        </button>
      </header>

      <div className="my-4 border-t border-gray-100" />

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <p className="max-w-full truncate text-sm font-extrabold text-[#2B1B12]" title={address?.recipientName || "Valued Diner"}>{address?.recipientName || "Valued Diner"}</p>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <StatusBadge label={status.label} className={status.bg} />
          <StatusBadge label={formatPaymentMethod(order.checkout?.paymentMethod)} className="border-gray-200 bg-white text-gray-700" />
          <StatusBadge label={formatStatus(order.paymentStatus)} className={getStatusBadge(order.paymentStatus).bg} />
        </div>
        <p className="ml-auto shrink-0 text-xs text-gray-500">{time}</p>
      </div>

      <ul className="mt-3 overflow-hidden rounded-xl bg-gray-50 px-2 sm:px-3" aria-label="Ordered dishes">
        {items.length > 0 ? items.map((item, index) => (
          <li key={item.id} className={`flex min-h-[72px] items-center gap-3 py-2 ${index < items.length - 1 ? "border-b border-gray-200" : ""}`}>
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white text-gray-400">
              <UtensilsCrossed className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />
              {item.dishImage && <img src={item.dishImage} alt={item.name || "Ordered dish"} className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-900" title={item.name}>{item.name}</p>
              <p className="mt-0.5 text-xs text-gray-600">x {item.quantity} · {formatMoney(item.unitPrice)} each</p>
            </div>
            <strong className="shrink-0 text-sm font-extrabold text-gray-900">{formatMoney(item.totalPrice)}</strong>
          </li>
        )) : <li className="flex min-h-[72px] items-center text-sm text-gray-600">No dishes listed</li>}
      </ul>

      <footer className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500">Order action</span>
          <p className="mt-0.5 text-xs text-gray-600">{actionMessage}</p>
          {order.status === "READY_FOR_PICKUP" && <p className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Ready for pickup</p>}
        </div>
        {(canAccept || action) && <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {canAccept && <button type="button" onClick={() => onAccept(order.id)} disabled={Boolean(actionOrderId)} className="inline-flex min-h-11 w-full min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-xs transition duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
            {actionOrderId === order.id ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Accepting…</> : "Accept order"}
          </button>}
          {action && <button type="button" onClick={() => onAdvance(order.id, action)} disabled={Boolean(actionOrderId)} className="inline-flex min-h-11 w-full min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-xs transition duration-150 hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
            {actionOrderId === order.id ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{action.pendingLabel}</> : action.label}
          </button>}
        </div>}
      </footer>
    </article>
  );
}

function EmptyState({ title, detail, icon: Icon = Package }) {
  return <section className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white px-5 py-14 text-center" aria-label={title}>
    <Icon className="mx-auto h-10 w-10 text-[#D2552B]/50" aria-hidden="true" />
    <h2 className="mt-3 text-base font-bold text-[#2B1B12]">{title}</h2>
    {detail && <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-gray-500">{detail}</p>}
  </section>;
}

function OrderDetailsDrawer({ order, action, canAccept, actionOrderId, onAccept, onAdvance, onClose, triggerRef, fallbackRef }) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const orderAddress = order.checkout?.addressSnapshot || order.address;
  const status = getStatusBadge(order.status);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const opener = triggerRef.current;
    const fallbackElement = fallbackRef.current;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
      else if (fallbackElement?.isConnected) fallbackElement.focus();
      else previousActiveElement?.focus?.();
    };
  }, [fallbackRef, onClose, triggerRef]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="order-detail-title" className="flex h-full w-full flex-col bg-white shadow-xl sm:max-w-[580px]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 p-5 sm:p-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="order-detail-title" className="min-w-0 truncate text-lg font-extrabold text-[#2B1B12] sm:text-xl">Order #{order.orderNumber || order.id}</h2>
              <StatusBadge label={status.label} className={status.bg} />
            </div>
            <p className="mt-1 text-xs text-gray-500">Placed {order.createdAt ? new Date(order.createdAt).toLocaleString() : "date unavailable"}</p>
          </div>
          <div className="flex shrink-0 items-start gap-3">
            <div className="text-right">
              <p className="text-xl font-extrabold text-[#2B1B12]">{formatMoney(order.totalAmount)}</p>
              <p className="mt-0.5 text-xs text-gray-600">{formatPaymentMethod(order.checkout?.paymentMethod)} · {formatStatus(order.paymentStatus)} payment</p>
            </div>
            <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          <OrderActionBar order={order} canAccept={canAccept} action={action} actionOrderId={actionOrderId} onAccept={onAccept} onAdvance={onAdvance} />

          <section className="space-y-2" aria-labelledby="customer-delivery-heading">
            <h3 id="customer-delivery-heading" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><User className="h-4 w-4" aria-hidden="true" />Customer & Delivery</h3>
            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-gray-900">{orderAddress?.recipientName || "Valued Diner"}</p>
                {orderAddress?.phone && <a href={`tel:${orderAddress.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#D2552B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]"><Phone className="h-4 w-4" aria-hidden="true" />{orderAddress.phone}</a>}
              </div>
              {addressText(orderAddress) ? <div className="flex items-start gap-2 pt-1 text-sm text-gray-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#D2552B]" aria-hidden="true" /><span>{addressText(orderAddress)}</span></div> : <p className="text-sm italic text-gray-500">Delivery address details unavailable</p>}
            </div>
          </section>

          <section className="space-y-2" aria-labelledby="order-dishes-heading">
            <h3 id="order-dishes-heading" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><UtensilsCrossed className="h-4 w-4" aria-hidden="true" />Dishes & Quantities</h3>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">{(order.items || []).map((item) => <OrderItemRow key={item.id} item={item} />)}</ul>
          </section>

          <section className="space-y-2" aria-labelledby="billing-heading">
            <h3 id="billing-heading" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500"><Receipt className="h-4 w-4" aria-hidden="true" />Billing Breakdown</h3>
            <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4 text-sm">
              <div className="flex justify-between text-gray-600"><span>Items subtotal</span><span className="font-semibold text-gray-800">{formatMoney(order.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Delivery fee</span><span className="font-semibold text-gray-800">{formatMoney(order.deliveryFee)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Platform fee</span><span className="font-semibold text-gray-800">{formatMoney(order.platformFee)}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-extrabold text-gray-900"><span>Total amount</span><span className="text-[#D2552B]">{formatMoney(order.totalAmount)}</span></div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

export const CookOrdersPage = () => {
  const [localOrders, setLocalOrders] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOrderId, setActionOrderId] = useState(null);
  const [notice, setNotice] = useState("");
  const [drawerOrderId, setDrawerOrderId] = useState(null);
  const drawerTriggerRef = useRef(null);
  const tabsRef = useRef(null);

  const outlet = useOutletContext() || {};
  const {
    orders: contextOrders,
    setOrders: setContextOrders,
    orderCounts: contextCounts,
    loadingOrders: contextLoading,
    ordersError: contextError,
    refreshOrders: contextRefresh,
  } = outlet;

  const orders = contextOrders ?? localOrders;
  const loading = contextOrders !== undefined ? Boolean(contextLoading) : localLoading;
  const error = (contextOrders !== undefined ? contextError : localError) || "";

  const [searchParams, setSearchParams] = useSearchParams();
  const activeStatusId = searchParams.get("status") || "pending";
  const activeGroup = getStatusGroup(activeStatusId);
  const statusCounts = contextCounts ?? calculateOrderCounts(orders);

  const loadOrders = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLocalLoading(true);
    setLocalError("");
    try {
      const items = await requestOrders();
      setLocalOrders(items);
      if (setContextOrders) setContextOrders(items);
      if (contextRefresh) void contextRefresh({ silent: true });
    } catch (loadError) {
      setLocalError(getErrorMessage(loadError));
    } finally {
      setLocalLoading(false);
    }
  }, [setContextOrders, contextRefresh]);

  useEffect(() => {
    let active = true;
    requestOrders().then((items) => {
      if (active) {
        setLocalOrders(items);
        if (setContextOrders) setContextOrders(items);
      }
    }).catch((loadError) => {
      if (active) setLocalError(getErrorMessage(loadError));
    }).finally(() => {
      if (active) setLocalLoading(false);
    });
    return () => { active = false; };
  }, [setContextOrders]);

  const filteredOrders = useMemo(() => [...orders]
    .filter((order) => activeGroup.statuses.includes(order.status))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [orders, activeGroup]);

  const drawerOrder = orders.find((item) => item.id === drawerOrderId) || null;

  const getNextAction = (selected) => {
    if (!selected) return null;
    if (selected.status === "CONFIRMED") return { label: "Start preparing", pendingLabel: "Starting…", nextStatus: "Preparing", request: cookApi.prepareOrder };
    if (selected.status === "PREPARING") return { label: "Mark ready for pickup", pendingLabel: "Updating…", nextStatus: "Ready for pickup", request: cookApi.markOrderReady };
    return null;
  };
  const getAction = (selected) => getNextAction(selected);

  const closeDrawer = useCallback(() => setDrawerOrderId(null), []);
  const openDrawer = (orderId, trigger) => {
    drawerTriggerRef.current = trigger;
    setDrawerOrderId(orderId);
  };

  const selectStatus = (groupId) => {
    searchParams.set("status", groupId);
    setSearchParams(searchParams);
    setDrawerOrderId(null);
  };

  const acceptOrder = async (orderId) => {
    if (actionOrderId) return;
    setActionOrderId(orderId);
    setActionError("");
    setNotice("");
    try {
      await cookApi.acceptOrder(orderId);
      setNotice("Order accepted. Its status is now Confirmed.");
      await loadOrders({ showLoading: false });
    } catch (actionFailure) {
      setActionError(getErrorMessage(actionFailure));
    } finally {
      setActionOrderId(null);
    }
  };

  const advanceOrder = async (orderId, action) => {
    if (actionOrderId) return;
    setActionOrderId(orderId);
    setActionError("");
    setNotice("");
    try {
      await action.request(orderId);
      setNotice(`Order status updated to ${action.nextStatus}.`);
      await loadOrders({ showLoading: false });
    } catch (actionFailure) {
      setActionError(getErrorMessage(actionFailure));
    } finally {
      setActionOrderId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1180px] space-y-6 pb-12 text-left animate-in fade-in duration-200">
      <h1 className="sr-only">Food orders</h1>

      <OrderTabs activeGroup={activeGroup} statusCounts={statusCounts} onSelect={selectStatus} fallbackRef={tabsRef} />

      {actionError && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{actionError}</span></div>}
      {notice && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{notice}</span></div>}

      {loading && orders.length === 0 ? (
        <section className="space-y-5" aria-label="Loading orders" role="status">
          <span className="sr-only">Loading your orders…</span>
          {[1, 2, 3].map((item) => <div key={item} className="animate-pulse rounded-2xl border border-[#2B1B12]/10 bg-white p-5 sm:p-6"><div className="h-4 w-28 rounded bg-orange-100" /><div className="mt-3 h-5 w-48 rounded bg-orange-100/80" /><div className="mt-5 h-20 rounded-xl bg-gray-100" /></div>)}
        </section>
      ) : error && orders.length === 0 ? (
        <section className="rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h2 className="mt-3 font-bold text-gray-900">Orders could not be loaded</h2>
          <p className="mt-2 text-sm text-gray-600" role="alert">{error}</p>
          <button type="button" onClick={() => void loadOrders()} className="mt-5 min-h-11 rounded-xl bg-[#D2552B] px-4 text-sm font-bold text-white transition duration-150 hover:bg-[#b94723] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Try again</button>
        </section>
      ) : orders.length === 0 ? (
        <EmptyState title="No orders received yet" detail="Customer orders for your kitchen will appear here." icon={ShoppingBag} />
      ) : (
        <>
          {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">The list could not be refreshed: {error}{" "}<button type="button" onClick={() => void loadOrders({ showLoading: false })} className="ml-1 font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B]">Retry</button></div>}
          {filteredOrders.length === 0 ? <EmptyState title="No orders here yet" detail={`There are currently no food orders with ${activeGroup.label.toLowerCase()} status.`} /> : (
            <section aria-label="Cook orders">
              <p className="mb-3 text-sm text-gray-500">{filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"}</p>
              <ul className="space-y-5">
                {filteredOrders.map((item) => {
                  const canAcceptOrder = item.status === "PENDING" && ["PENDING", "PAID"].includes(item.paymentStatus);
                  return <li key={item.id}><OrderCard
                    order={item}
                    onOpen={(event) => openDrawer(item.id, event.currentTarget)}
                    canAccept={canAcceptOrder}
                    action={getAction(item)}
                    actionOrderId={actionOrderId}
                    onAccept={acceptOrder}
                    onAdvance={advanceOrder}
                  /></li>;
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {drawerOrder && <OrderDetailsDrawer
        order={drawerOrder}
        action={getAction(drawerOrder)}
        canAccept={drawerOrder.status === "PENDING" && ["PENDING", "PAID"].includes(drawerOrder.paymentStatus)}
        actionOrderId={actionOrderId}
        onAccept={acceptOrder}
        onAdvance={advanceOrder}
        onClose={closeDrawer}
        triggerRef={drawerTriggerRef}
        fallbackRef={tabsRef}
      />}
    </main>
  );
};

export default CookOrdersPage;
