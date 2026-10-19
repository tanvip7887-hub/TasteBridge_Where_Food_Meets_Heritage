import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  LoaderCircle,
  MapPin,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  ShoppingBag,
  User,
  UtensilsCrossed,
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

export const CookOrdersPage = () => {
  const [localOrders, setLocalOrders] = useState([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionOrderId, setActionOrderId] = useState(null);
  const [notice, setNotice] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

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

  const filteredOrders = useMemo(() => {
    return [...orders]
      .filter((order) => activeGroup.statuses.includes(order.status))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [orders, activeGroup]);

  // Ensure activeSelectedId is valid for the current filtered list
  const activeSelectedId =
    selectedOrderId && filteredOrders.some((o) => o.id === selectedOrderId)
      ? selectedOrderId
      : filteredOrders[0]?.id || null;

  const selectedOrder = orders.find((o) => o.id === activeSelectedId) || null;

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

  // Helper variables for selected order
  const order = selectedOrder || {};
  const selectedAddress = order.checkout?.addressSnapshot || order.address;
  const canAccept = order.status === "PENDING" && ["PENDING", "PAID"].includes(order.paymentStatus);

  const getNextAction = (order) => {
    if (!order) return null;
    if (order.status === "CONFIRMED") {
      return {
        label: "Start preparing",
        pendingLabel: "Starting…",
        nextStatus: "Preparing",
        request: cookApi.prepareOrder,
      };
    }
    if (order.status === "PREPARING") {
      return {
        label: "Mark ready for pickup",
        pendingLabel: "Updating…",
        nextStatus: "Ready for pickup",
        request: cookApi.markOrderReady,
      };
    }
    return null;
  };

  const action = getNextAction(selectedOrder);

  return (
    <div className="space-y-6 pb-12 text-left animate-in fade-in duration-200">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#2B1B12] sm:text-2xl">
            Food orders
          </h1>
          <p className="mt-1 text-xs text-[#2B1B12]/70 sm:text-sm">
            Manage your kitchen orders by status, inspect customer details, and track food preparation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#2B1B12]/15 bg-white px-3.5 py-2 text-sm font-semibold text-[#2B1B12] hover:bg-orange-50 disabled:opacity-60 cursor-pointer shadow-xs"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </header>

      {/* Status Filter Tabs */}
      <nav aria-label="Order status filter tabs" className="flex flex-wrap gap-2 border-b border-[#2B1B12]/10 pb-4">
        {COOK_ORDER_STATUS_OPTIONS.map((group) => {
          const isActive = activeGroup.id === group.id;
          const count = statusCounts[group.id] || 0;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => {
                searchParams.set("status", group.id);
                setSearchParams(searchParams);
                setSelectedOrderId(null);
                setMobileDetailOpen(false);
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-[#D2552B] text-white shadow-sm ring-1 ring-[#D2552B]"
                  : "bg-white border border-[#2B1B12]/10 text-[#2B1B12]/75 hover:bg-orange-50 hover:text-[#2B1B12]"
              }`}
            >
              <span>{group.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${
                  isActive
                    ? "bg-white/25 text-white"
                    : count > 0 && group.id === "pending"
                    ? "bg-amber-100 text-amber-900 font-black"
                    : count > 0
                    ? "bg-gray-100 text-gray-700"
                    : "text-gray-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Global Alerts */}
      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      {/* Content Area */}
      {loading && orders.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border border-[#2B1B12]/10 bg-white text-sm text-gray-600" role="status">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#D2552B]" aria-hidden="true" />
          <span>Loading your orders…</span>
        </div>
      ) : error && orders.length === 0 ? (
        <section className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h2 className="mt-3 font-bold text-gray-900">Orders could not be loaded</h2>
          <p className="mt-2 text-sm text-gray-600" role="alert">{error}</p>
          <button type="button" onClick={() => void loadOrders()} className="mt-5 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#b94723] cursor-pointer">
            Try again
          </button>
        </section>
      ) : orders.length === 0 ? (
        <section className="rounded-3xl border border-[#2B1B12]/10 bg-white p-8 text-center shadow-sm sm:p-14">
          <ShoppingBag className="mx-auto h-12 w-12 text-[#D2552B]/60" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-[#2B1B12]">No orders received yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#2B1B12]/65">
            Customer orders for your kitchen will appear here.
          </p>
        </section>
      ) : (
        <>
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
              The list could not be refreshed: {error}{" "}
              <button type="button" onClick={() => void loadOrders({ showLoading: false })} className="ml-1 font-bold underline cursor-pointer">
                Retry
              </button>
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <section className="rounded-3xl border border-[#2B1B12]/10 bg-white p-8 text-center shadow-sm sm:p-12">
              <Package className="mx-auto h-10 w-10 text-[#D2552B]/40" aria-hidden="true" />
              <h2 className="mt-3 text-base font-bold text-[#2B1B12]">
                No {activeGroup.label.toLowerCase()}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">
                There are currently no food orders with {activeGroup.label.toLowerCase()} status.
              </p>
            </section>
          ) : (
            <section className="space-y-4" aria-label="Cook orders">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Column 1: Order List */}
                <div className={`lg:col-span-5 space-y-3 ${mobileDetailOpen ? "hidden lg:block" : "block"}`}>
                  <div className="flex items-center justify-between text-xs font-bold text-gray-500 px-1">
                    <span>
                      {filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"} in {activeGroup.label}
                    </span>
                    <span className="text-[11px] text-gray-400">Click to view details</span>
                  </div>

                  <div className="space-y-2.5">
                    {filteredOrders.map((order) => {
                      const isSelected = order.id === activeSelectedId;
                      const address = order.checkout?.addressSnapshot || order.address;
                      const badge = getStatusBadge(order.status);
                      const itemsSummary = (order.items || []).map((it) => `${it.quantity}× ${it.name}`).join(", ");

                      return (
                        <div
                          key={order.id}
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setMobileDetailOpen(true);
                          }}
                          className={`cursor-pointer rounded-2xl border p-4 transition-all text-left ${
                            isSelected
                              ? "border-[#D2552B] bg-orange-50/50 shadow-md ring-2 ring-[#D2552B]/30"
                              : "border-[#2B1B12]/10 bg-white hover:border-[#D2552B]/40 hover:bg-orange-50/20 shadow-xs"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-gray-500">
                                {order.orderNumber ? `Order #${order.orderNumber}` : `Order #${order.id.slice(0, 8)}`}
                              </p>
                              <h3 className="text-sm font-extrabold text-[#2B1B12] mt-0.5">
                                {address?.recipientName || "Valued Diner"}
                              </h3>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-extrabold text-[#2B1B12]">
                                {formatMoney(order.totalAmount)}
                              </p>
                              <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>

                          <p className="mt-2 text-xs text-gray-600 line-clamp-1 font-medium">
                            {itemsSummary || "No dishes listed"}
                          </p>

                          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "recently"}
                            </span>
                            <span className="font-semibold text-gray-700">
                              {order.checkout?.paymentMethod === "ONLINE" ? "Online" : order.checkout?.paymentMethod || "COD"} · {formatStatus(order.paymentStatus)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 2: Order Details Pane */}
                <div className={`lg:col-span-7 ${mobileDetailOpen ? "block" : "hidden lg:block"}`}>
                  {selectedOrder ? (
                    <article className="rounded-2xl border border-[#2B1B12]/10 bg-white p-5 sm:p-6 shadow-sm space-y-6 sticky top-20 text-left">
                      {/* Mobile Back to List Button */}
                      <div className="lg:hidden pb-3 border-b border-gray-100 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setMobileDetailOpen(false)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-[#D2552B] hover:text-[#b94723] cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" /> Back to orders list
                        </button>
                        <span className="text-xs text-gray-500 font-semibold">{activeGroup.label}</span>
                      </div>

                      {/* Order Details Header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-gray-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-extrabold text-[#2B1B12]">
                              {selectedOrder.orderNumber ? `Order #${selectedOrder.orderNumber}` : `Order #${selectedOrder.id}`}
                            </h2>
                            <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full border ${getStatusBadge(selectedOrder.status).bg}`}>
                              {getStatusBadge(selectedOrder.status).label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            Placed on {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : "date unavailable"}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-[#2B1B12]">
                            {formatMoney(selectedOrder.totalAmount)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-600 font-medium">
                            {selectedOrder.checkout?.paymentMethod === "ONLINE"
                              ? "Online Payment"
                              : selectedOrder.checkout?.paymentMethod || "Payment details unavailable"} · {formatStatus(selectedOrder.paymentStatus)} payment
                          </p>
                        </div>
                      </div>

                      {/* Action Controls for Selected Order */}
                      <div className="p-4 rounded-xl bg-orange-50/50 border border-orange-100 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                            Order action
                          </span>
                          <p className="text-xs font-semibold text-[#2B1B12] mt-0.5">
                            {selectedOrder.status === "PENDING" && "New order received. Accept to confirm kitchen preparation."}
                            {selectedOrder.status === "CONFIRMED" && "Order confirmed. Start cooking when ready."}
                            {selectedOrder.status === "PREPARING" && "Dish is cooking. Mark ready once food is packed."}
                            {selectedOrder.status === "READY_FOR_PICKUP" && "Food is packed and ready for delivery partner pickup."}
                            {selectedOrder.status === "OUT_FOR_DELIVERY" && "Order has been picked up by delivery partner."}
                            {selectedOrder.status === "DELIVERED" && "Order successfully delivered to customer."}
                            {selectedOrder.status === "CANCELLED" && "This order has been cancelled."}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {canAccept && (
                            <button
                              type="button"
                              onClick={() => void acceptOrder(selectedOrder.id)}
                              disabled={Boolean(actionOrderId)}
                              className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60 cursor-pointer shadow-xs"
                            >
                              {actionOrderId === selectedOrder.id ? (
                                <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Accepting…</>
                              ) : (
                                "Accept order"
                              )}
                            </button>
                          )}

                          {action && (
                            <button
                              type="button"
                              onClick={() => void advanceOrder(selectedOrder.id, action)}
                              disabled={Boolean(actionOrderId)}
                              className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60 cursor-pointer shadow-xs"
                            >
                              {actionOrderId === selectedOrder.id ? (
                                <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />{action.pendingLabel}</>
                              ) : (
                                action.label
                              )}
                            </button>
                          )}

                          {order.status === "READY_FOR_PICKUP" && (
                            <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Ready for pickup
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Customer & Delivery Information */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Customer & Delivery Details
                        </h3>
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-extrabold text-gray-900">
                              {selectedAddress?.recipientName || "Valued Diner"}
                            </p>
                            {selectedAddress?.phone && (
                              <a
                                href={`tel:${selectedAddress.phone}`}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D2552B] hover:underline"
                              >
                                <Phone className="w-3.5 h-3.5" /> {selectedAddress.phone}
                              </a>
                            )}
                          </div>
                          {addressText(selectedAddress) ? (
                            <div className="flex items-start gap-2 text-xs text-gray-700 pt-1">
                              <MapPin className="w-4 h-4 text-[#D2552B] shrink-0 mt-0.5" />
                              <span>{addressText(selectedAddress)}</span>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 italic">Delivery address details unavailable</p>
                          )}
                        </div>
                      </div>

                      {/* Ordered Dishes List */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <UtensilsCrossed className="w-3.5 h-3.5" /> Dishes & Quantities
                        </h3>
                        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                          {(selectedOrder.items || []).map((item) => (
                            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 text-sm">
                              <div>
                                <span className="font-bold text-gray-900">{item.name}</span>
                                <span className="ml-2 font-semibold text-gray-600">× {item.quantity}</span>
                                <span className="ml-2 text-xs font-normal text-gray-500">{formatMoney(item.unitPrice)} each</span>
                              </div>
                              <strong className="text-gray-900 font-extrabold">{formatMoney(item.totalPrice)}</strong>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Billing Breakdown */}
                      <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5" /> Billing Breakdown
                        </h3>
                        <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-2 text-xs">
                          <div className="flex justify-between text-gray-600">
                            <span>Items subtotal</span>
                            <span className="font-semibold text-gray-800">{formatMoney(selectedOrder.subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Delivery fee</span>
                            <span className="font-semibold text-gray-800">{formatMoney(selectedOrder.deliveryFee)}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Platform fee</span>
                            <span className="font-semibold text-gray-800">{formatMoney(selectedOrder.platformFee)}</span>
                          </div>
                          <div className="pt-2 border-t border-gray-200 flex justify-between text-sm font-extrabold text-gray-900">
                            <span>Total amount</span>
                            <span className="text-[#D2552B]">{formatMoney(selectedOrder.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#2B1B12]/20 bg-white/60 p-12 text-center text-gray-500">
                      <Package className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                      <p className="font-bold text-[#2B1B12]">No order selected</p>
                      <p className="text-xs text-gray-600 mt-1">Select an order from the list on the left to view its details.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default CookOrdersPage;
