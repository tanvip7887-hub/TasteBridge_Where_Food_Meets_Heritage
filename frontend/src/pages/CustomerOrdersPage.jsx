import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, LoaderCircle, Package, ShoppingBag, Star } from "lucide-react";
import { orderApi } from "../api/orderApi.js";
import { usePendingReviews } from "../components/reviews/usePendingReviews.js";
import CustomerReviewModal from "../components/reviews/CustomerReviewModal.jsx";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const formatStatus = (status) => (status || "PENDING").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export const CustomerOrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hidingOrderId, setHidingOrderId] = useState(null);
  const [hideError, setHideError] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);

  const { getPendingOrderItems, refresh: refreshPending } = usePendingReviews();

  useEffect(() => {
    let active = true;
    orderApi.list().then((response) => { if (active) setOrders(response?.data?.items || []); })
      .catch((requestError) => { if (active) setError(requestError.message || "Your orders could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const hideOrder = async (order) => {
    if (order.status !== "DELIVERED" || hidingOrderId) return;
    if (!window.confirm("Hide this delivered order from your order history? This will not delete the order or its records.")) return;
    setHidingOrderId(order.id);
    setHideError("");
    try {
      const response = await orderApi.hideFromHistory(order.id);
      if (response?.data?.id !== order.id || !response.data.hiddenFromCustomerAt) {
        throw new Error("The server did not confirm this order was hidden. Refresh and try again.");
      }
      setOrders((current) => current.flatMap((checkout) => {
        const remaining = (checkout.orders || []).filter((item) => item.id !== order.id);
        return remaining.length ? [{ ...checkout, orders: remaining }] : [];
      }));
    } catch (requestError) {
      setHideError(requestError.message || "This order could not be hidden. Please retry.");
    } finally { setHidingOrderId(null); }
  };

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
    <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Your orders</h1>
    <p className="mt-1 text-sm text-gray-600">Track checkouts and their separate kitchen orders.</p>
    {error && <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</div>}
    {hideError && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{hideError}</div>}
    {loading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading your orders…</div>
      : orders.length === 0 ? <section className="mt-7 rounded-3xl border border-orange-100 bg-white px-5 py-16 text-center"><ShoppingBag className="mx-auto h-12 w-12 text-orange-300" aria-hidden="true" /><h2 className="mt-4 font-bold text-gray-900">No orders yet</h2><p className="mt-2 text-sm text-gray-600">Your placed orders will appear here.</p><Link to="/explore" className="mt-5 inline-flex rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white">Browse dishes</Link></section>
        : <section className="mt-7 space-y-4" aria-label="Order history">{orders.map((checkout) => <article key={checkout.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-gray-500">Placed {new Date(checkout.createdAt).toLocaleString()}</p><h2 className="mt-1 font-bold text-gray-900">Checkout {checkout.id.slice(-8).toUpperCase()}</h2><p className="mt-1 text-sm text-gray-600">{checkout.orders?.length || 0} visible kitchen order{checkout.orders?.length === 1 ? "" : "s"} · {formatPrice((checkout.orders || []).reduce((sum, order) => sum + Number(order.totalAmount || 0), 0))}</p></div><Link to={`/orders/${encodeURIComponent(checkout.id)}`} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><Package className="h-4 w-4" aria-hidden="true" /> View details</Link></div><div className="mt-4 space-y-2">{checkout.orders?.map((order) => {
          const eligibleReviews = getPendingOrderItems(order.id, checkout.id);
          return <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-sm"><span><strong>{order.cookName || order.cook?.businessName}</strong> · {formatStatus(order.status)} · {formatStatus(order.paymentStatus)} payment{order.customerReceivedAt ? <span className="ml-2 font-semibold text-emerald-700">· Order Received</span> : null}</span><span className="flex items-center gap-3"><strong>{formatPrice(order.totalAmount)}</strong>{order.status === "DELIVERED" && eligibleReviews.length > 0 && <button type="button" onClick={() => setReviewTarget(eligibleReviews[0])} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-orange-50"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />Review</button>}{order.status === "DELIVERED" && <button type="button" onClick={() => void hideOrder(order)} disabled={Boolean(hidingOrderId)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60">{hidingOrderId === order.id ? "Hiding…" : "Hide from Order History"}</button>}</span></div>;
        })}</div></article>)}</section>}
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

export default CustomerOrdersPage;
