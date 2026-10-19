import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bike, CheckCircle2, Clock3, Loader2, MapPin, PackageCheck, RefreshCw, Wallet } from "lucide-react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
const statusLabel = (status) => String(status || "").replaceAll("_", " ");

const OrderCard = ({ order, children, showAddress = false }) => (
  <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Order {order.orderNumber}</p><h2 className="mt-1 text-lg font-extrabold text-[#2B1B12]">{order.cookName}</h2></div>
      <div className="text-right"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{statusLabel(order.status)}</span><p className="mt-2 text-xs text-gray-500">{order.paymentMethod || "Payment"} · {statusLabel(order.paymentStatus)} payment</p></div>
    </div>
    <ul className="mt-4 space-y-1 text-sm text-gray-700">{order.items?.map((item) => <li key={item.id}>{item.quantity} × {item.name}</li>)}</ul>
    {order.deliveryArea && <p className="mt-3 flex items-center gap-1.5 text-sm text-gray-600"><MapPin className="h-4 w-4" />{[order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ")}</p>}
    {showAddress && order.deliveryAddress && <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700"><p className="font-bold text-[#2B1B12]">Delivery address</p><p className="mt-1">{order.deliveryAddress.recipientName}</p><p>{[order.deliveryAddress.addressLine1, order.deliveryAddress.addressLine2, order.deliveryAddress.locality, order.deliveryAddress.city, order.deliveryAddress.state, order.deliveryAddress.pincode].filter(Boolean).join(", ")}</p>{order.deliveryAddress.phone && <a className="mt-2 inline-block font-semibold text-red-700" href={`tel:${order.deliveryAddress.phone}`}>{order.deliveryAddress.phone}</a>}</div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3"><p className="text-sm text-gray-600">Delivery fee <strong className="text-[#2B1B12]">{money(order.deliveryEarning ?? order.deliveryFee)}</strong></p>{children}</div>
  </article>
);

export const DeliveryAgentSectionPage = () => {
  const location = useLocation();
  const { refreshDashboard } = useOutletContext();
  const section = location.pathname.split("/").filter(Boolean).at(-1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const requestGeneration = useRef(0);

  const load = useCallback(async ({ preserveNotice = false, preserveError = false } = {}) => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    if (!preserveError) setError("");
    if (!preserveNotice) setNotice("");
    try {
      const request = section === "available" ? deliveryAgentApi.listAvailableDeliveries()
        : section === "current" ? deliveryAgentApi.listCurrentDeliveries()
          : section === "history" ? deliveryAgentApi.listDeliveryHistory()
            : deliveryAgentApi.getDeliveryEarnings();
      const result = unwrap(await request);
      if (requestGeneration.current === generation) setData(result);
    } catch (requestError) {
      if (requestGeneration.current === generation) setError(requestError?.message || "This delivery section could not be loaded.");
    } finally { if (requestGeneration.current === generation) setLoading(false); }
  }, [section]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; requestGeneration.current += 1; };
  }, [load]);

  const act = async (orderId, action) => {
    setBusyId(orderId); setError(""); setNotice("");
    try {
      const result = action === "claim" ? await deliveryAgentApi.claimDelivery(orderId)
        : action === "pickup" ? await deliveryAgentApi.markDeliveryPickedUp(orderId)
          : action === "collect" ? await deliveryAgentApi.confirmCodCollection(orderId)
            : await deliveryAgentApi.markDeliveryCompleted(orderId);
      const order = unwrap(result);
      setNotice(action === "claim" ? `Order ${order.orderNumber} is now assigned to you.` : action === "pickup" ? "Pickup recorded. The delivery is in progress." : action === "collect" ? `COD collection recorded for order ${order.orderNumber}.` : "Delivery completed. Confirm COD collection from Delivery history if you received cash.");
      await Promise.all([load({ preserveNotice: true }), refreshDashboard().catch(() => {})]);
    } catch (requestError) {
      setError(requestError?.message || "The delivery action could not be completed.");
      await load({ preserveError: true });
    } finally { setBusyId(""); }
  };

  const isMoney = section === "earnings";
  const title = section === "available" ? "Available deliveries" : section === "current" ? "Current deliveries" : section === "history" ? "Delivery history" : "Earnings";
  const Icon = section === "available" ? PackageCheck : section === "current" ? Bike : section === "earnings" ? Wallet : Clock3;
  const orders = Array.isArray(data) ? data : [];

  return <section className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#D2552B]">Delivery Agent Panel</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-[#2B1B12]"><Icon className="h-7 w-7" />{title}</h1></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></header>
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}<button type="button" onClick={load} className="ml-2 font-bold underline">Try again</button></div></div>}
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-red-600" />Loading…</div> : error ? null : isMoney ? <>
      <article className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"><p className="text-sm text-gray-600">Accrued delivery fees from completed orders</p><p className="mt-2 text-3xl font-extrabold text-[#2B1B12]">{money(data?.totalEarned)}</p><p className="mt-2 text-xs leading-5 text-gray-500">These are earned fees recorded for completed deliveries. This page does not show or initiate payout settlement.</p></article>
      {data?.deliveries?.length ? <div className="space-y-3">{data.deliveries.map((delivery) => <article key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-white p-4"><div><p className="font-bold text-[#2B1B12]">Order {delivery.orderNumber}</p><p className="text-xs text-gray-500">Order placed {new Date(delivery.orderDate || delivery.completedAt).toLocaleString()}</p></div><strong className="text-emerald-800">{money(delivery.amount)}</strong></article>)}</div> : <p className="rounded-xl bg-white p-5 text-sm text-gray-600">No completed delivery fees yet.</p>}
    </> : orders.length ? <div className="space-y-3">{orders.map((order) => <OrderCard key={order.id} order={order} showAddress={section !== "available"}>{section === "available" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, "claim")} className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">{busyId === order.id ? "Claiming…" : "Accept delivery"}</button> : section === "current" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, order.status === "READY_FOR_PICKUP" ? "pickup" : "complete")} className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">{busyId === order.id ? "Updating…" : order.status === "READY_FOR_PICKUP" ? "Picked up" : "Mark delivered"}</button> : section === "history" && order.status === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus === "PENDING" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, "collect")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{busyId === order.id ? "Recording…" : "Confirm cash collected"}</button> : null}</OrderCard>)}</div> : <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm"><Icon className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 font-bold text-[#2B1B12]">{section === "available" ? "No deliveries are ready right now." : section === "current" ? "No active deliveries assigned." : "No completed deliveries yet."}</p><p className="mt-1 text-sm text-gray-600">Refresh this page to check for updates.</p></div>}
    <Link to="/delivery-agent" className="inline-flex items-center gap-2 text-sm font-bold text-red-700 hover:underline"><ArrowLeft className="h-4 w-4" />Home</Link>
  </section>;
};

export default DeliveryAgentSectionPage;
