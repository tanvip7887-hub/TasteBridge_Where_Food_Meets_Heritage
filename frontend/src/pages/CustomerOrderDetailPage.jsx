import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, MapPin, RefreshCw, Star, XCircle } from "lucide-react";
import { orderApi } from "../api/orderApi.js";
import { usePendingReviews } from "../components/reviews/usePendingReviews.js";
import CustomerReviewModal from "../components/reviews/CustomerReviewModal.jsx";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const formatStatus = (status) => (status || "PENDING").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const trackingSteps = [
  ["PENDING", "Order placed"], ["CONFIRMED", "Accepted by cook"], ["PREPARING", "Being prepared"],
  ["READY_FOR_PICKUP", "Ready for pickup"], ["OUT_FOR_DELIVERY", "Out for delivery"], ["DELIVERED", "Delivered"],
];
const statusIndex = (status) => trackingSteps.findIndex(([value]) => value === status);

export const CustomerOrderDetailPage = ({ confirmation = false }) => {
  const { id } = useParams();
  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [confirmingReceiptId, setConfirmingReceiptId] = useState(null);
  const [receiptError, setReceiptError] = useState("");
  const [now, setNow] = useState(0);
  const [reviewTarget, setReviewTarget] = useState(null);

  const { getPendingFoodItem, getPendingOrderItems, refresh: refreshPending } = usePendingReviews();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await orderApi.get(id);
      setCheckout(response?.data || null);
      if (!quiet) setError("");
    } catch (requestError) {
      if (!quiet) setError(requestError.message || "Order details could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    orderApi.get(id).then((response) => {
      if (active) { setCheckout(response?.data || null); setError(""); }
    }).catch((requestError) => {
      if (active) setError(requestError.message || "Order details could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    const poll = window.setInterval(() => refresh(true), 15000);
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(ticker); };
  }, [refresh]);

  const cancel = async () => {
    if (!checkout?.canCancel || cancelling) return;
    if (!window.confirm("Cancel all kitchen orders in this checkout? Reserved stock will be returned.")) return;
    setCancelling(true);
    setCancelError("");
    try {
      const response = await orderApi.cancel(id);
      setCheckout(response?.data || null);
    } catch (requestError) {
      setCancelError(requestError.message || "The checkout could not be cancelled. Refresh and try again.");
      await refresh(true);
    } finally { setCancelling(false); }
  };

  const confirmReceipt = async (order) => {
    if (order.status !== "DELIVERED" || order.customerReceivedAt || confirmingReceiptId) return;
    if (!window.confirm("Confirm that you received this order?")) return;
    setConfirmingReceiptId(order.id);
    setReceiptError("");
    try {
      const response = await orderApi.confirmReceipt(order.id);
      const confirmedOrder = response?.data;
      if (confirmedOrder?.id !== order.id || !confirmedOrder.customerReceivedAt) {
        throw new Error("The server did not confirm receipt. Refresh and try again.");
      }
      setCheckout((current) => current ? {
        ...current,
        orders: current.orders.map((item) => item.id === order.id ? { ...item, ...confirmedOrder } : item),
      } : current);
    } catch (requestError) {
      setReceiptError(requestError.message || "Receipt confirmation failed. Please retry.");
    } finally { setConfirmingReceiptId(null); }
  };

  if (loading && !checkout) return <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading order…</div>;
  if (error || !checkout) return <main className="mx-auto max-w-3xl px-4 py-12"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert"><AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />{error || "Order not found."}</div><Link to="/orders" className="mt-4 inline-flex items-center gap-2 font-semibold text-red-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your orders</Link></main>;

  const address = checkout.addressSnapshot || {};
  const remainingSeconds = Math.max(0, Math.ceil((new Date(checkout.cancelUntil).getTime() - now) / 1000));
  const cancellationVisible = checkout.canCancel && now > 0 && remainingSeconds > 0;
  const orders = checkout.orders || [];
  const onlineFulfillmentConfirmed = checkout.paymentMethod === "ONLINE"
    && orders.length > 0
    && orders.every((order) => order.paymentStatus === "PAID");
  return <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    {confirmation ? <section className={`mb-6 rounded-2xl border p-5 ${onlineFulfillmentConfirmed || checkout.paymentMethod !== "ONLINE" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><CheckCircle2 className={`h-7 w-7 ${onlineFulfillmentConfirmed || checkout.paymentMethod !== "ONLINE" ? "text-emerald-700" : "text-amber-700"}`} aria-hidden="true" /><div><h1 className="text-xl font-extrabold text-emerald-950">{checkout.paymentMethod === "ONLINE" && !onlineFulfillmentConfirmed ? "Payment not completed" : "Order placed"}</h1><p className="text-sm text-gray-800">{checkout.paymentMethod === "ONLINE" ? (onlineFulfillmentConfirmed ? "Your online payment was confirmed and kitchen orders were created." : "The server has not confirmed completed online payment and fulfillment for this checkout.") : "Your Cash on Delivery order is recorded. Payment remains pending until cash is collected."}</p></div></div>{(onlineFulfillmentConfirmed || checkout.paymentMethod !== "ONLINE") && <Link to={`/orders/${encodeURIComponent(id)}`} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">Track your order</Link>}</div></section> : <Link to="/orders" className="inline-flex items-center gap-2 text-sm font-semibold text-red-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your orders</Link>}
    {!confirmation && <h1 className="mt-5 text-2xl font-extrabold text-gray-900">Track your order</h1>}
    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-gray-500">Placed {new Date(checkout.createdAt).toLocaleString()}</p><h2 className="mt-1 text-lg font-bold text-gray-900">Checkout {checkout.id.slice(-8).toUpperCase()}</h2><p className="mt-1 text-sm text-gray-600">Payment method: {checkout.paymentMethod === "COD" ? "Cash on Delivery" : checkout.paymentMethod === "ONLINE" ? (orders[0]?.paymentStatus === "PAID" ? "Online Payment (Done)" : "Online Payment") : "Not recorded for this older order"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold border ${orders[0]?.paymentStatus === "PAID" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-amber-50 text-amber-900 border-amber-200"}`}>Payment {formatStatus(orders[0]?.paymentStatus || "PENDING")}</span></div>
      <section className="mt-6 rounded-xl border border-gray-100 p-4" aria-label="Order tracking"><div className="flex items-center justify-between gap-2"><h3 className="font-bold text-gray-900">Live order status</h3><button type="button" onClick={() => refresh(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh</button></div><p className="mt-1 text-sm text-gray-600">Updates automatically every 15 seconds. Progress times are shown when available; older orders may not have recorded history.</p><div className="mt-4 space-y-5">{orders.map((order) => { const currentIndex = statusIndex(order.status); const historyByStatus = new Map((order.statusHistory || []).map((event) => [event.toStatus, event.changedAt])); return <article key={order.id} className="rounded-lg bg-gray-50 p-4"><h4 className="text-sm font-bold text-gray-900">{order.cookName || order.cook?.businessName || "Home kitchen"}</h4><p className="mt-1 text-xs text-gray-600">Order {order.orderNumber} · Current: {formatStatus(order.status)}</p>{order.status === "CANCELLED" ? <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-red-700"><XCircle className="h-4 w-4" aria-hidden="true" /> Cancelled</div> : <ol className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{trackingSteps.map(([status, label], index) => { const reached = currentIndex >= index; const changedAt = historyByStatus.get(status); return <li key={status} className={`border-l-2 pl-3 text-xs sm:border-l-0 sm:border-t-2 sm:pl-0 sm:pt-3 ${reached ? "border-emerald-500 font-semibold text-emerald-800" : "border-gray-200 text-gray-500"}`} aria-current={order.status === status ? "step" : undefined}>{label}{order.status === status && <span className="ml-1">· Current</span>}{changedAt && <time className="mt-1 block font-normal text-gray-500" dateTime={changedAt}>{new Date(changedAt).toLocaleString()}</time>}</li>; })}</ol>}{order.deliveryAgent?.user ? <p className="mt-3 text-xs text-gray-700">Delivery agent: {order.deliveryAgent.user.name}{order.deliveryAgent.user.phone ? ` · ${order.deliveryAgent.user.phone}` : ""}</p> : <p className="mt-3 text-xs text-gray-500">Delivery assignment and live location are not available yet.</p>}</article>; })}</div></section>
      <div className="mt-5 space-y-5">{orders.map((order) => {
        const eligibleOrderItems = getPendingOrderItems(order.id, checkout.id);
        return <article key={order.id} className="rounded-xl border border-gray-100 p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-bold text-gray-900">{order.cookName || order.cook?.businessName || "Home kitchen"}</h3><p className="mt-1 text-xs text-gray-600">Order {order.orderNumber} · {formatStatus(order.status)}</p></div><strong>{formatPrice(order.totalAmount)}</strong></div><div className="mt-3 divide-y divide-gray-100">{order.items?.map((item) => {
          const pendingFoodItem = getPendingFoodItem(item.id);
          return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div className="flex flex-wrap items-center gap-2"><span>{item.name} × {item.quantity}<span className="ml-2 text-xs text-gray-500">{formatPrice(item.unitPrice)} each</span></span>{pendingFoodItem && <button type="button" onClick={() => setReviewTarget(pendingFoodItem)} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-orange-50"><Star className="h-3 w-3 fill-amber-400 text-amber-500" aria-hidden="true" />Rate dish</button>}</div><strong>{formatPrice(item.totalPrice)}</strong></div>;
        })}</div><div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm text-gray-600"><div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(order.subtotal)}</span></div><div className="flex justify-between"><span>Delivery</span><span>{formatPrice(order.deliveryFee)}</span></div><div className="flex justify-between"><span>Platform fee</span><span>{formatPrice(order.platformFee)}</span></div></div>{order.status === "DELIVERED" && <div className="mt-4 border-t border-gray-100 pt-4 flex flex-wrap items-center gap-3">{order.customerReceivedAt ? <p className="text-sm font-semibold text-emerald-700">Order Received · {new Date(order.customerReceivedAt).toLocaleString()}</p> : <button type="button" onClick={() => void confirmReceipt(order)} disabled={Boolean(confirmingReceiptId)} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{confirmingReceiptId === order.id ? "Confirming…" : "Confirm Order Received"}</button>}{eligibleOrderItems.length > 0 && <button type="button" onClick={() => setReviewTarget(eligibleOrderItems[0])} className="rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-orange-50 inline-flex items-center gap-1.5"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />Review purchased dishes</button>}</div>}</article>;
      })}</div>
      {receiptError && <p className="mt-3 text-sm text-red-700" role="alert">{receiptError}</p>}
      <div className="mt-5 flex justify-between border-t border-gray-100 pt-4 text-base font-extrabold text-gray-900"><span>Checkout total</span><span>{formatPrice(checkout.totalAmount)}</span></div>
      <div className="mt-5 rounded-xl bg-orange-50/70 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-gray-900"><MapPin className="h-4 w-4 text-red-600" aria-hidden="true" /> Delivery address</h3><p className="mt-2 text-sm font-semibold text-gray-900">{address.recipientName} · {address.phone}</p><p className="mt-1 text-sm text-gray-700">{[address.addressLine1, address.addressLine2, address.locality, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(", ")}</p></div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">{cancellationVisible ? <div><p className="text-sm font-semibold text-gray-800">You can cancel this checkout for {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")} more.</p><button type="button" onClick={cancel} disabled={cancelling} className="mt-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{cancelling ? "Cancelling…" : "Cancel checkout"}</button></div> : <p className="text-sm text-gray-600">{checkout.cancellationReason || "Cancellation is no longer available."}</p>}{cancelError && <p className="w-full text-sm text-red-700" role="alert">{cancelError}</p>}<Link to="/orders" className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">View all orders</Link></div>
    </section>
    <CustomerReviewModal
      isOpen={Boolean(reviewTarget)}
      target={reviewTarget}
      onClose={() => setReviewTarget(null)}
      onSuccess={() => {
        refreshPending();
      }}
    />
  </main>;
};

export default CustomerOrderDetailPage;
