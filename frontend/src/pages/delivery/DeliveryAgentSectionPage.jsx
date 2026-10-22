import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bike, CalendarDays, CheckCircle2, Clock3, Flag, Loader2, Mail, MapPin, PackageCheck, Phone, RefreshCw, TrendingUp, Utensils, Wallet, X } from "lucide-react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { deliveryAgentApi } from "../../api/deliveryAgentApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;
const retryAfterSeconds = (error) => Math.max(0, Number(error?.response?.headers?.["retry-after"] ?? error?.response?.headers?.["Retry-After"] ?? error?.response?.data?.retryAfterSeconds) || 0);
const secondsUntil = (dateValue) => {
  const timestamp = dateValue ? new Date(dateValue).getTime() : NaN;
  return Number.isFinite(timestamp) ? Math.max(0, Math.ceil((timestamp - Date.now()) / 1000)) : 0;
};
const formatCountdown = (seconds) => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
const statusLabel = (status) => String(status || "").replaceAll("_", " ");
const isCashOnDelivery = (order) => String(order?.paymentMethod || "").toUpperCase() === "COD" && String(order?.paymentStatus || "").toUpperCase() === "PENDING";
const isPaidOnline = (order) => String(order?.paymentMethod || "").toUpperCase() === "ONLINE" && String(order?.paymentStatus || "").toUpperCase() === "PAID";
const getDeliveryDate = (delivery) => {
  const value = delivery.deliveredAt || delivery.completedAt || delivery.orderDate;
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};
const getLocalDayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const getWeekStart = (date) => {
  const start = getLocalDayStart(date);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
};
const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const getDeliveryAmount = (delivery) => {
  const amount = Number(delivery.amount);
  return Number.isFinite(amount) ? amount : null;
};

const AvailableDeliverySkeletons = () => <div className="flex w-full flex-col gap-4" role="status" aria-label="Loading available deliveries">{[0, 1, 2].map((item) => <div key={item} className="w-full animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-3 w-32 rounded bg-gray-100" /><div className="mt-2 h-5 w-52 rounded bg-gray-100" /><div className="mt-3 h-4 w-72 max-w-full rounded bg-gray-100" /><div className="mt-4 flex w-full flex-col gap-4 rounded-xl bg-gray-50 p-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap"><div className="h-20 w-20 shrink-0 rounded-lg bg-gray-200" /><div className="min-w-0 flex-1 space-y-3"><div className="h-4 w-48 max-w-full rounded bg-gray-200" /><div className="h-4 w-36 max-w-full rounded bg-gray-200" /><div className="h-3 w-56 max-w-full rounded bg-gray-200" /></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:justify-end lg:w-auto lg:flex-none"><div className="h-11 w-28 rounded bg-gray-200" /></div><div className="h-11 w-full rounded-full bg-gray-200 sm:w-36" /></div></div>)}<span className="sr-only">Loading available deliveries…</span></div>;

const CurrentDeliverySkeletons = () => <div className="flex w-full flex-col gap-4" role="status" aria-label="Loading current deliveries">{[0, 1].map((item) => <div key={item} className="w-full animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="h-3 w-32 rounded bg-gray-100" /><div className="mt-2 h-5 w-52 rounded bg-gray-100" /><div className="mt-3 h-4 w-72 max-w-full rounded bg-gray-100" /><div className="mt-4 flex w-full flex-col gap-4 rounded-xl bg-gray-50 p-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap"><div className="h-20 w-20 shrink-0 rounded-lg bg-gray-200" /><div className="min-w-0 flex-1 space-y-3"><div className="h-4 w-48 max-w-full rounded bg-gray-200" /><div className="h-4 w-36 max-w-full rounded bg-gray-200" /></div><div className="h-12 w-full rounded-lg bg-gray-200 sm:basis-full" /></div><div className="mt-3 h-24 rounded-xl bg-gray-100" /><div className="mt-3 ml-auto h-11 w-36 rounded-full bg-gray-200" /></div>)}<span className="sr-only">Loading current deliveries…</span></div>;

const HistoryDeliverySkeletons = () => <div className="flex w-full flex-col gap-4" role="status" aria-label="Loading delivery history">{[0, 1, 2].map((item) => <div key={item} className="w-full animate-pulse rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="h-3 w-36 rounded bg-gray-100" /><div className="mt-2 h-5 w-52 rounded bg-gray-100" /></div><div className="h-7 w-24 rounded-full bg-gray-100" /></div><div className="mt-4 flex w-full flex-col gap-4 rounded-xl bg-gray-50 p-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap"><div className="h-16 w-16 shrink-0 rounded-lg bg-gray-200" /><div className="min-w-0 flex-1 space-y-3"><div className="h-4 w-48 max-w-full rounded bg-gray-200" /><div className="h-4 w-36 max-w-full rounded bg-gray-200" /></div><div className="h-12 w-full rounded-lg bg-gray-200 sm:basis-full" /></div></div>)}<span className="sr-only">Loading delivery history…</span></div>;

const AvailableDeliveryCard = ({ order, busy, isOnline, onAccept }) => {
  const fee = order.deliveryEarning ?? order.deliveryFee;
  const pickupArea = order.pickupArea || order.cookArea;
  const dropArea = [order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ");
  const items = order.items || [];
  const firstItem = items[0];
  const orderId = order.orderNumber || order.id || "—";
  const shortOrderId = orderId.length > 28 ? `${orderId.slice(0, 12)}…${orderId.slice(-8)}` : orderId;
  const pickupDescription = pickupArea || "Kitchen pickup";
  const dropDescription = dropArea || "Customer drop-off";
  const rawStatus = statusLabel(order.status);
  const status = rawStatus ? rawStatus.charAt(0) + rawStatus.slice(1).toLowerCase() : "Available";
  const imageUrl = firstItem?.dishImage || firstItem?.imageUrl || firstItem?.image;
  const collectCash = isCashOnDelivery(order);
  const paidOnline = isPaidOnline(order);
  const dropAddress = order.deliveryAddress
    ? [order.deliveryAddress.addressLine1, order.deliveryAddress.addressLine2, order.deliveryAddress.locality, order.deliveryAddress.city, order.deliveryAddress.state, order.deliveryAddress.pincode].filter(Boolean).join(", ")
    : dropDescription;
  return <article className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[#D2552B] focus-within:ring-offset-2">
    <header className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {order.createdAt && <p className="text-[13px] text-gray-500">Placed {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
        <h2 className="mt-1 truncate text-lg font-semibold text-gray-900" title={orderId}>Order {shortOrderId}</h2>
        <p className="mt-1 truncate text-sm text-gray-600" title={`${items.length} item${items.length === 1 ? "" : "s"} · ${pickupDescription} → ${dropDescription}`}>{items.length} item{items.length === 1 ? "" : "s"} · {pickupDescription} → {dropDescription}</p>
      </div>
    </header>
    <div className="mt-4 w-full min-w-0 rounded-xl bg-gray-50 p-3 sm:p-4">
      <div className="flex w-full min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
      <div className="relative h-20 w-20 shrink-0 self-start overflow-hidden rounded-lg bg-orange-100 text-orange-700 sm:self-auto">
        <Utensils className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />
        {imageUrl && <img src={imageUrl} alt={firstItem?.name || "Dish in this delivery"} loading="lazy" width="80" height="80" className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
        {items.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-[#2B1B12] px-1.5 py-0.5 text-xs font-bold text-white">+{items.length - 1}</span>}
      </div>
      <div className="min-w-0 flex-1 sm:basis-[calc(100%-6rem)] lg:basis-0">
        <p className="truncate text-sm leading-5" title={`${order.cookName || "TasteBridge kitchen"} · ${status}`}><strong className="font-bold text-gray-900">{order.cookName || "TasteBridge kitchen"}</strong><span className="text-gray-600"> · {status}</span></p>
        <p className="mt-2 truncate text-sm leading-5 text-gray-600" title={firstItem ? `${firstItem.quantity} × ${firstItem.name}${items.length > 1 ? ` · +${items.length - 1} more` : ""}` : "Order items"}>{firstItem ? `${firstItem.quantity} × ${firstItem.name}` : "Order items"}{items.length > 1 ? ` · +${items.length - 1} more` : ""}</p>
        <p className="mt-2 flex min-w-0 items-start gap-1.5 text-xs leading-4 text-gray-500"><Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">Drop-off: {dropAddress}</span></p>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3 border-t border-gray-200 pt-3 sm:basis-[calc(100%-10rem)] sm:flex-1 sm:flex-row sm:items-center sm:justify-end sm:gap-4 lg:w-auto lg:basis-auto lg:flex-none lg:border-l lg:border-t-0 lg:py-1 lg:pl-4 lg:pt-1">
        {(collectCash || paidOnline) && <div className="min-w-0 sm:flex-1">{collectCash ? <><div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Collect cash</span><strong className="whitespace-nowrap text-xl font-extrabold text-gray-900">{order.totalAmount == null ? "—" : money(order.totalAmount)}</strong></div><p className="mt-1 text-xs text-gray-500">Collect from customer</p></> : <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Paid online</span>}</div>}
        <div className={`min-w-0 ${collectCash || paidOnline ? "border-t pt-3 sm:shrink-0 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0" : "sm:shrink-0"} border-gray-200`}><p className="whitespace-nowrap text-base font-bold text-emerald-800">{fee == null ? "—" : money(fee)}</p><p className="mt-1 whitespace-nowrap text-xs text-gray-500">Your earning</p></div>
      </div>
      <button type="button" disabled={busy || !isOnline} title={!isOnline ? "Go online to accept" : undefined} onClick={() => onAccept(order.id)} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto sm:w-auto lg:ml-0">{busy ? "Accepting…" : "Accept delivery"}</button>
      </div>
    </div>
  </article>;
};

const CurrentDeliveryCard = ({ order, busy, onUpdate }) => {
  const items = order.items || [];
  const firstItem = items[0];
  const orderId = order.orderNumber || order.id || "—";
  const shortOrderId = orderId.length > 28 ? `${orderId.slice(0, 12)}…${orderId.slice(-8)}` : orderId;
  const pickupArea = order.pickupArea || order.cookArea || order.cookName || "Kitchen pickup";
  const address = order.deliveryAddress || {};
  const dropArea = [address.locality, address.city].filter(Boolean).join(", ") || [order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ") || "Customer drop-off";
  const fullAddress = [address.addressLine1, address.addressLine2, address.locality, address.city, address.state, address.pincode].filter(Boolean).join(", ") || dropArea;
  const customerName = address.recipientName || "Customer";
  const phone = address.phone;
  const imageUrl = firstItem?.dishImage || firstItem?.imageUrl || firstItem?.image;
  const rawStatus = statusLabel(order.status);
  const status = rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase() : "In progress";
  const collectCash = isCashOnDelivery(order);
  const paidOnline = isPaidOnline(order);
  const nextAction = order.status === "READY_FOR_PICKUP" ? "pickup" : "complete";
  const actionLabel = order.status === "READY_FOR_PICKUP" ? "Picked up" : "Mark delivered";

  return <article className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[#D2552B] focus-within:ring-offset-2">
    <header className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {order.createdAt && <p className="text-[13px] text-gray-500">Placed {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
        <h2 className="mt-1 truncate text-lg font-semibold text-gray-900" title={orderId}>Order {shortOrderId}</h2>
        <p className="mt-1 truncate text-sm text-gray-600" title={`${items.length} item${items.length === 1 ? "" : "s"} · ${pickupArea} → ${dropArea}`}>{items.length} item{items.length === 1 ? "" : "s"} · {pickupArea} → {dropArea}</p>
      </div>
      <span className="inline-flex max-w-full shrink-0 self-start whitespace-nowrap rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">{status}</span>
    </header>

    <div className="mt-4 w-full min-w-0 rounded-xl bg-gray-50 p-3 sm:p-4">
      <div className="flex w-full min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
        <div className="relative h-20 w-20 shrink-0 self-start overflow-hidden rounded-lg bg-orange-100 text-orange-700 sm:self-auto">
          <Utensils className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />
          {imageUrl && <img src={imageUrl} alt={firstItem?.name || "Dish in this delivery"} loading="lazy" width="80" height="80" className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
          {items.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-[#2B1B12] px-1.5 py-0.5 text-xs font-bold text-white">+{items.length - 1}</span>}
        </div>
        <div className="min-w-0 flex-1 sm:basis-[calc(100%-6rem)] lg:basis-0">
          <p className="truncate text-sm leading-5" title={`${order.cookName || "TasteBridge kitchen"} · ${status}`}><strong className="font-bold text-gray-900">{order.cookName || "TasteBridge kitchen"}</strong><span className="text-gray-600"> · {status}</span></p>
          <p className="mt-2 truncate text-sm leading-5 text-gray-600" title={firstItem ? `${firstItem.quantity} × ${firstItem.name}${items.length > 1 ? ` · +${items.length - 1} more` : ""}` : "Order items"}>{firstItem ? `${firstItem.quantity} × ${firstItem.name}` : "Order items"}{items.length > 1 ? ` · +${items.length - 1} more` : ""}</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 border-t border-gray-200 pt-3 sm:basis-full sm:flex-row sm:items-center sm:justify-end sm:gap-4 lg:w-auto lg:basis-auto lg:flex-none lg:border-l lg:border-t-0 lg:py-1 lg:pl-4 lg:pt-1">
          {(collectCash || paidOnline) && <div className="min-w-0 sm:flex-1">{collectCash ? <><div className="flex flex-wrap items-center gap-2"><span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Collect cash</span><strong className="whitespace-nowrap text-xl font-extrabold text-gray-900">{order.totalAmount == null ? "—" : money(order.totalAmount)}</strong></div><p className="mt-1 text-xs text-gray-500">Collect from customer</p></> : <span className="inline-flex whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">Paid online</span>}</div>}
          <div className={`min-w-0 ${collectCash || paidOnline ? "border-t pt-3 sm:shrink-0 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0" : "sm:shrink-0"} border-gray-200`}><p className="whitespace-nowrap text-base font-bold text-emerald-800">{order.deliveryEarning == null && order.deliveryFee == null ? "—" : money(order.deliveryEarning ?? order.deliveryFee)}</p><p className="mt-1 whitespace-nowrap text-xs text-gray-500">Your earning</p></div>
        </div>
      </div>
    </div>

    <section className="mt-3 rounded-xl bg-gray-50 p-4" aria-label="Delivery details">
      <h3 className="text-sm font-semibold text-gray-900">Deliver to</h3>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{customerName}</p>
          <p className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-gray-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /><span className="break-words">{fullAddress}</span></p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {phone && <a href={`tel:${phone}`} aria-label={`Call customer at ${phone}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2"><Phone className="h-4 w-4" aria-hidden="true" />Call customer · {phone}</a>}
          {fullAddress && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Open in Maps</a>}
        </div>
      </div>
    </section>

    <div className="mt-3 flex justify-end">
      <button type="button" disabled={busy} onClick={() => onUpdate(order.id, nextAction)} className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-full bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto" aria-label={`Update delivery status: ${actionLabel}`}>
        {busy ? "Updating…" : actionLabel}
      </button>
    </div>
  </article>;
};

const HistoryDeliveryCard = ({ order }) => {
  const items = order.items || [];
  const firstItem = items[0];
  const orderId = order.orderNumber || order.id || "—";
  const shortOrderId = orderId.length > 28 ? `${orderId.slice(0, 12)}…${orderId.slice(-8)}` : orderId;
  const address = order.deliveryAddress || {};
  const dropArea = [address.locality, address.city].filter(Boolean).join(", ") || [order.deliveryArea, order.deliveryCity].filter(Boolean).join(", ") || "Drop-off area unavailable";
  const imageUrl = firstItem?.dishImage || firstItem?.imageUrl || firstItem?.image;
  const fee = order.deliveryEarning ?? order.deliveryFee;
  const delivered = order.status === "DELIVERED";
  const status = delivered ? "Delivered" : order.status === "CANCELLED" ? "Cancelled" : statusLabel(order.status);
  const statusStyle = delivered ? "bg-emerald-50 text-emerald-800" : order.status === "CANCELLED" ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-900";
  const paidOnline = isPaidOnline(order);
  const cashCollected = String(order.paymentMethod || "").toUpperCase() === "COD" && String(order.paymentStatus || "").toUpperCase() === "PAID";
  const eventDate = delivered ? (order.deliveredAt || order.updatedAt || order.createdAt) : order.createdAt;

  return <article className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[#D2552B] focus-within:ring-offset-2 sm:p-5">
    <header className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eventDate && <p className="text-[13px] text-gray-500">{delivered ? "Delivered" : "Placed"} {new Date(eventDate).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
        <h2 className="mt-1 truncate text-lg font-semibold text-gray-900" title={orderId}>Order {shortOrderId}</h2>
      </div>
      <span className={`inline-flex max-w-full shrink-0 self-start whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${statusStyle}`}>{status}</span>
    </header>
    <div className="mt-4 w-full min-w-0 rounded-xl bg-gray-50 p-3 sm:p-4">
      <div className="flex w-full min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap">
        <div className="relative h-16 w-16 shrink-0 self-start overflow-hidden rounded-lg bg-orange-100 text-orange-700 sm:self-auto">
          <Utensils className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />
          {imageUrl && <img src={imageUrl} alt={firstItem?.name || "Dish in this delivery"} loading="lazy" width="64" height="64" className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}
          {items.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-[#2B1B12] px-1.5 py-0.5 text-xs font-bold text-white">+{items.length - 1}</span>}
        </div>
        <div className="min-w-0 flex-1 sm:basis-[calc(100%-5rem)] lg:basis-0">
          <p className="truncate text-sm leading-5" title={order.cookName || "TasteBridge kitchen"}><strong className="font-bold text-gray-900">{order.cookName || "TasteBridge kitchen"}</strong></p>
          <p className="mt-2 truncate text-sm leading-5 text-gray-600" title={firstItem ? `${firstItem.quantity} × ${firstItem.name}${items.length > 1 ? ` · +${items.length - 1} more` : ""}` : "Order items"}>{firstItem ? `${firstItem.quantity} × ${firstItem.name}` : "Order items"}{items.length > 1 ? ` · +${items.length - 1} more` : ""}</p>
          <p className="mt-2 flex min-w-0 items-start gap-1.5 text-xs leading-4 text-gray-500"><Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="break-words">Drop-off: {dropArea}</span></p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 border-t border-gray-200 pt-3 sm:basis-full sm:flex-row sm:items-center sm:justify-end sm:gap-4 lg:w-auto lg:basis-auto lg:flex-none lg:border-l lg:border-t-0 lg:py-1 lg:pl-4 lg:pt-1">
          {(paidOnline || cashCollected) && <span className={`inline-flex shrink-0 self-start whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${paidOnline ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-700"}`}>{paidOnline ? "Paid online" : "Cash collected"}</span>}
          <div className="min-w-0 border-t border-gray-200 pt-3 sm:ml-auto sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 lg:ml-0"><p className="whitespace-nowrap text-base font-bold text-emerald-800">{fee == null ? "—" : money(fee)}</p><p className="mt-1 whitespace-nowrap text-xs text-gray-500">Your earning</p></div>
        </div>
      </div>
    </div>
  </article>;
};

const EarningsStatCard = ({ label, value, caption, Icon, highlight = false }) => <article className={`min-h-36 rounded-2xl border p-5 shadow-sm ${highlight ? "border-orange-100 bg-gradient-to-br from-orange-50 to-emerald-50" : "border-gray-200 bg-white"}`}>
  <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-gray-600">{label}</p><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D2552B]/10 text-[#D2552B]"><Icon className="h-5 w-5" aria-hidden="true" /></span></div>
  <p className="mt-4 truncate text-2xl font-extrabold text-[#2B1B12]">{value}</p>
  <p className="mt-1 text-[13px] text-gray-500">{caption}</p>
</article>;

const EarningsDeliveryRow = ({ delivery }) => {
  const firstItem = delivery.items?.[0];
  const imageUrl = firstItem?.dishImage || firstItem?.imageUrl || firstItem?.image;
  const orderId = delivery.orderNumber || delivery.id || "—";
  const shortOrderId = orderId.length > 28 ? `${orderId.slice(0, 12)}…${orderId.slice(-8)}` : orderId;
  const date = getDeliveryDate(delivery);
  const hasDeliveredTime = Boolean(delivery.deliveredAt || delivery.completedAt);
  const amount = getDeliveryAmount(delivery);
  const itemsSummary = firstItem ? `${delivery.cookName || "Kitchen"} · ${firstItem.quantity} × ${firstItem.name}${delivery.items.length > 1 ? ` · +${delivery.items.length - 1} more` : ""}` : delivery.cookName || "Order details unavailable";

  return <article className="flex w-full min-w-0 flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 transition duration-150 hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-sm sm:p-4">
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-orange-100 text-orange-700 sm:h-16 sm:w-16"><Utensils className="absolute inset-0 m-auto h-5 w-5" aria-hidden="true" />{imageUrl && <img src={imageUrl} alt={firstItem?.name || "Dish in this delivery"} loading="lazy" width="64" height="64" className="relative h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}{delivery.items?.length > 1 && <span className="absolute right-1 top-1 rounded-full bg-[#2B1B12] px-1.5 py-0.5 text-xs font-bold text-white">+{delivery.items.length - 1}</span>}</div>
    <div className="min-w-0 flex-1 basis-[calc(100%-5rem)] sm:basis-0">
      <h3 className="truncate text-base font-semibold text-gray-900" title={orderId}>Order {shortOrderId}</h3>
      <p className="mt-1 truncate text-sm text-gray-600" title={itemsSummary}>{itemsSummary}</p>
      {date && <p className="mt-1 text-xs text-gray-500">{hasDeliveredTime ? "Delivered" : "Placed"} {date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>}
    </div>
    <div className="ml-auto shrink-0 basis-full text-right sm:basis-auto"><p className="whitespace-nowrap text-base font-bold text-emerald-800">{amount == null ? "—" : `+${money(amount)}`}</p><p className="mt-1 whitespace-nowrap text-xs text-gray-500">Delivery fee</p></div>
  </article>;
};

const EarningsSkeleton = () => <div className="space-y-6" role="status" aria-label="Loading earnings"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl border border-gray-200 bg-white p-5"><div className="h-4 w-28 rounded bg-gray-100" /><div className="mt-5 h-8 w-36 rounded bg-gray-100" /><div className="mt-3 h-3 w-32 rounded bg-gray-100" /></div>)}</div><div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 rounded-xl border border-gray-100 bg-white p-4"><div className="h-16 w-16 shrink-0 rounded-lg bg-gray-200" /><div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-44 rounded bg-gray-100" /><div className="h-3 w-60 max-w-full rounded bg-gray-100" /></div><div className="h-5 w-24 rounded bg-gray-100" /></div>)}</div><span className="sr-only">Loading earnings…</span></div>;

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
  const { dashboard, refreshDashboard, isOnline = false, toggleAvailability, availabilityUpdating = false } = useOutletContext();
  const section = location.pathname.split("/").filter(Boolean).at(-1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [completionOtpOrderId, setCompletionOtpOrderId] = useState("");
  const [completionOtp, setCompletionOtp] = useState("");
  const [completionOtpError, setCompletionOtpError] = useState("");
  const [completionOtpEmailStatus, setCompletionOtpEmailStatus] = useState("");
  const [completionOtpEmailHint, setCompletionOtpEmailHint] = useState("");
  const [completionOtpRequestBusy, setCompletionOtpRequestBusy] = useState(false);
  const [completionOtpVerifyBusy, setCompletionOtpVerifyBusy] = useState(false);
  const [completionOtpCooldown, setCompletionOtpCooldown] = useState(0);
  const [completionOtpExpiresIn, setCompletionOtpExpiresIn] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [earningsFilter, setEarningsFilter] = useState("All");
  const requestGeneration = useRef(0);

  const load = useCallback(async ({ preserveNotice = false, preserveError = false, silent = false } = {}) => {
    const generation = ++requestGeneration.current;
    if (section === "available" && !isOnline) {
      setLoading(false);
      setError("");
      return;
    }
    if (!silent) setLoading(true);
    if (!preserveError) setError("");
    if (!preserveNotice) setNotice("");
    try {
      const request = section === "available" ? deliveryAgentApi.listAvailableDeliveries()
        : section === "current" ? deliveryAgentApi.listCurrentDeliveries()
          : section === "history" ? deliveryAgentApi.listDeliveryHistory()
            : deliveryAgentApi.getDeliveryEarnings();
      const result = unwrap(await request);
      if (requestGeneration.current === generation) {
        setData(result);
        if (section === "available" || section === "current") setUpdatedAt(new Date());
      }
    } catch (requestError) {
      if (requestGeneration.current === generation) setError(requestError?.message || "This delivery section could not be loaded.");
    } finally { if (requestGeneration.current === generation) setLoading(false); }
  }, [section, isOnline]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) load(); });
    return () => { active = false; requestGeneration.current += 1; };
  }, [load]);

  useEffect(() => {
    if ((section !== "available" && section !== "current") || (section === "available" && !isOnline)) return undefined;
    let lastResumeRefresh = 0;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastResumeRefresh < 1000) return;
      lastResumeRefresh = Date.now();
      void load({ silent: true, preserveNotice: true });
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true, preserveNotice: true });
    }, 25000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [section, isOnline, load]);

  useEffect(() => {
    if (section !== "history" && section !== "earnings") return undefined;
    let lastResumeRefresh = 0;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastResumeRefresh < 1000) return;
      lastResumeRefresh = Date.now();
      void load({ silent: true, preserveNotice: true });
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [section, load]);

  useEffect(() => {
    if (completionOtpCooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCompletionOtpCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [completionOtpCooldown]);

  useEffect(() => {
    if (completionOtpExpiresIn <= 0) return undefined;
    const timer = window.setTimeout(() => setCompletionOtpExpiresIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [completionOtpExpiresIn]);

  useEffect(() => {
    if (!completionOtpOrderId || completionOtpEmailStatus !== "QUEUED") return undefined;
    let active = true;
    const pollEmailStatus = async () => {
      try {
        const result = unwrap(await deliveryAgentApi.getDeliveryCompletionOtpStatus(completionOtpOrderId));
        if (!active) return;
        setCompletionOtpEmailStatus(result.emailStatus || "QUEUED");
        setCompletionOtpEmailHint(result.emailHint || "");
        setCompletionOtpExpiresIn(secondsUntil(result.expiresAt));
        setCompletionOtpCooldown(Number(result.resendAfterSeconds) || 0);
        if (result.emailStatus === "FAILED") {
          setCompletionOtpError("The email could not be sent. Try requesting a new verification email after the cooldown.");
        }
      } catch {
        // Keep the queued message visible; the agent can retry status on the next interval.
      }
    };
    const timer = window.setInterval(pollEmailStatus, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [completionOtpOrderId, completionOtpEmailStatus]);

  useEffect(() => {
    if (!completionOtpOrderId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !completionOtpVerifyBusy && !completionOtpRequestBusy) setCompletionOtpOrderId("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [completionOtpOrderId, completionOtpVerifyBusy, completionOtpRequestBusy]);

  const requestCompletionCode = async (orderId) => unwrap(await deliveryAgentApi.requestDeliveryCompletionOtp(orderId));

  const applyCompletionOtpStatus = (status) => {
    setCompletionOtpEmailStatus(status.emailStatus || "PENDING");
    setCompletionOtpEmailHint(status.emailHint || "");
    setCompletionOtpExpiresIn(secondsUntil(status.expiresAt));
    setCompletionOtpCooldown(Number(status.resendAfterSeconds) || 0);
  };

  const openCompletionOtp = async (orderId) => {
    setCompletionOtpOrderId(orderId);
    setCompletionOtp("");
    setCompletionOtpError("");
    setCompletionOtpEmailStatus("PENDING");
    setCompletionOtpEmailHint("");
    setCompletionOtpRequestBusy(true);
    try {
      let existingStatus = null;
      try {
        existingStatus = unwrap(await deliveryAgentApi.getDeliveryCompletionOtpStatus(orderId));
      } catch (statusError) {
        if (statusError?.response?.status !== 404) throw statusError;
      }

      const existingSeconds = existingStatus ? secondsUntil(existingStatus.expiresAt) : 0;
      if (existingStatus && existingSeconds > 0 && existingStatus.emailStatus !== "FAILED") {
        applyCompletionOtpStatus(existingStatus);
      } else if (existingStatus && Number(existingStatus.resendAfterSeconds) > 0) {
        applyCompletionOtpStatus(existingStatus);
        setCompletionOtpEmailStatus("FAILED");
        setCompletionOtpError(`This code has expired. You can request a new one in ${existingStatus.resendAfterSeconds} seconds.`);
      } else {
        const result = await requestCompletionCode(orderId);
        setCompletionOtpEmailStatus(result.emailStatus || "QUEUED");
        setCompletionOtpEmailHint(result.emailHint || "");
        setCompletionOtpExpiresIn(Number(result.expiresInSeconds) || 600);
        setCompletionOtpCooldown(Number(result.resendAfterSeconds) || 60);
      }
    } catch (requestError) {
      const cooldown = retryAfterSeconds(requestError);
      setCompletionOtpCooldown(cooldown);
      if (cooldown > 0) {
        setCompletionOtpError(`Please wait ${cooldown} seconds before requesting another verification email.`);
        try {
          const status = unwrap(await deliveryAgentApi.getDeliveryCompletionOtpStatus(orderId));
          applyCompletionOtpStatus(status);
        } catch {
          // A resend cooldown means an earlier code may still be valid; don't disable verification.
          setCompletionOtpEmailStatus("PENDING");
        }
      } else {
        setCompletionOtpError(requestError?.response?.data?.message || requestError?.message || "The verification email could not be requested.");
        setCompletionOtpEmailStatus("FAILED");
      }
    } finally {
      setCompletionOtpRequestBusy(false);
      setBusyId("");
    }
  };

  const resendCompletionCode = async () => {
    if (!completionOtpOrderId || completionOtpRequestBusy || completionOtpCooldown > 0) return;
    setCompletionOtpRequestBusy(true);
    setCompletionOtpError("");
    setCompletionOtpEmailStatus("PENDING");
    setCompletionOtp("");
    try {
      const result = await requestCompletionCode(completionOtpOrderId);
      setCompletionOtpEmailStatus(result.emailStatus || "QUEUED");
      setCompletionOtpEmailHint(result.emailHint || "");
      setCompletionOtpExpiresIn(Number(result.expiresInSeconds) || 600);
      setCompletionOtpCooldown(Number(result.resendAfterSeconds) || 60);
    } catch (requestError) {
      const cooldown = retryAfterSeconds(requestError);
      setCompletionOtpCooldown(cooldown);
      if (cooldown > 0) {
        setCompletionOtpError(`Please wait ${cooldown} seconds before requesting another verification email.`);
        try {
          const status = unwrap(await deliveryAgentApi.getDeliveryCompletionOtpStatus(completionOtpOrderId));
          applyCompletionOtpStatus(status);
        } catch {
          setCompletionOtpEmailStatus("PENDING");
        }
      } else {
        setCompletionOtpError(requestError?.response?.data?.message || requestError?.message || "The verification email could not be requested.");
        setCompletionOtpEmailStatus("FAILED");
      }
    } finally { setCompletionOtpRequestBusy(false); }
  };

  const verifyCompletionCode = async (event) => {
    event.preventDefault();
    if (!completionOtpOrderId || completionOtp.length !== 6 || completionOtpVerifyBusy) return;
    setCompletionOtpVerifyBusy(true);
    setCompletionOtpError("");
    try {
      const result = unwrap(await deliveryAgentApi.markDeliveryCompleted(completionOtpOrderId, completionOtp));
      setCompletionOtpOrderId("");
      setCompletionOtp("");
      setCompletionOtpExpiresIn(0);
      setNotice(`Order ${result.orderNumber || ""} delivered successfully.`.trim());
      await Promise.all([load({ preserveNotice: true }), refreshDashboard().catch(() => {})]);
    } catch (requestError) {
      setCompletionOtpError(requestError?.response?.data?.message || requestError?.message || "The code could not be verified. Check it and try again.");
    } finally { setCompletionOtpVerifyBusy(false); }
  };

  const act = async (orderId, action) => {
    if (action === "complete") {
      setBusyId(orderId);
      setError("");
      setNotice("");
      await openCompletionOtp(orderId);
      return;
    }
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

  const title = section === "available" ? "Available deliveries" : section === "current" ? "Current deliveries" : section === "history" ? "Delivery history" : "Earnings";
  const Icon = section === "available" ? PackageCheck : section === "current" ? Bike : section === "earnings" ? Wallet : Clock3;
  const orders = Array.isArray(data) ? data : [];

  if (section === "available") return <section className="mx-auto w-full max-w-[1400px] space-y-6" aria-label="Available deliveries">
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{notice}</p>}
    {loading ? <AvailableDeliverySkeletons /> : error ? <div role="alert" className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800 shadow-sm"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="font-semibold">{error}</p><button type="button" onClick={() => load()} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 transition duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></div></div></div>
      : !isOnline ? <div className="mx-auto flex min-h-[300px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-[#2B1B12]/10 bg-white px-6 py-16 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D2552B]/10 text-[#D2552B]"><PackageCheck className="h-8 w-8" aria-hidden="true" /></span><h1 className="mt-5 text-lg font-semibold text-[#2B1B12]">You're offline</h1><p className="mt-2 text-sm text-[#2B1B12]/60">Go online to see available deliveries.</p><button type="button" onClick={() => toggleAvailability?.()} disabled={!dashboard?.readiness?.readyToWork || availabilityUpdating || !toggleAvailability} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{availabilityUpdating ? "Updating…" : "Go online"}</button></div>
        : orders.length ? <><div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#2B1B12]/60"><p>{orders.length} available</p><time dateTime={updatedAt?.toISOString()}>{updatedAt ? "Updated just now" : "Checking for deliveries…"}</time></div><div className="flex w-full min-w-0 flex-col gap-4" aria-live="polite" aria-relevant="additions removals">{orders.map((order) => <div key={order.id} className="w-full min-w-0 animate-in fade-in duration-300"><AvailableDeliveryCard order={order} busy={busyId === order.id} isOnline={isOnline} onAccept={(orderId) => act(orderId, "claim")} /></div>)}</div></>
          : <div className="mx-auto flex min-h-[300px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-[#2B1B12]/10 bg-white px-6 py-16 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D2552B]/10 text-[#D2552B]"><PackageCheck className="h-8 w-8" aria-hidden="true" /></span><h1 className="mt-5 text-lg font-semibold text-[#2B1B12]">No deliveries right now</h1><p className="mt-2 text-sm text-[#2B1B12]/60">New orders will appear here automatically.</p></div>}
  </section>;

  if (section === "current") return <>
    <section className="mx-auto w-full max-w-[1400px] space-y-6" aria-label="Current delivery" aria-live="polite">
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{notice}</p>}
    {loading ? <CurrentDeliverySkeletons /> : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{error}</p><button type="button" onClick={() => load()} className="inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 transition duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></div></div>
      : orders.length ? <><div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#2B1B12]/60"><p>{orders.length} active</p><time dateTime={updatedAt?.toISOString()}>{updatedAt ? "Updated just now" : "Checking for updates…"}</time></div><div className="flex w-full min-w-0 flex-col gap-4">{orders.map((order) => <CurrentDeliveryCard key={order.id} order={order} busy={busyId === order.id} onUpdate={(orderId, action) => act(orderId, action)} />)}</div></>
        : <div className="mx-auto flex min-h-[300px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-[#2B1B12]/10 bg-white px-6 py-16 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D2552B]/10 text-[#D2552B]"><Bike className="h-8 w-8" aria-hidden="true" /></span><h1 className="mt-5 text-lg font-semibold text-[#2B1B12]">No active delivery</h1><p className="mt-2 text-sm text-[#2B1B12]/60">Accept a delivery to get started.</p><Link to="/delivery-agent/available" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Browse available deliveries</Link></div>}
    </section>
    {completionOtpOrderId && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !completionOtpRequestBusy && !completionOtpVerifyBusy) setCompletionOtpOrderId(""); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="delivery-otp-title" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-[#D2552B]"><Mail className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0"><h2 id="delivery-otp-title" className="text-lg font-bold text-[#2B1B12]">Verify delivery</h2><p className="mt-1 text-sm text-gray-600">Ask the customer to read the code from their registered email. Never guess or enter a code for them.</p></div>
          </div>
          <button type="button" onClick={() => setCompletionOtpOrderId("")} disabled={completionOtpRequestBusy || completionOtpVerifyBusy} aria-label="Close verification dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:opacity-50"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <p className="mt-4 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">Order <span className="font-semibold text-gray-900">{orders.find((order) => order.id === completionOtpOrderId)?.orderNumber || completionOtpOrderId}</span> will remain undelivered until the code is verified.</p>
        <p role="status" aria-live="polite" className={`mt-4 text-sm ${completionOtpEmailStatus === "FAILED" ? "text-red-700" : "text-gray-600"}`}>
          {completionOtpRequestBusy || completionOtpEmailStatus === "PENDING" ? "Preparing the verification email…" : completionOtpEmailStatus === "QUEUED" ? "Verification email queued for the customer. It will be sent shortly." : completionOtpEmailStatus === "SMTP_ACCEPTED" ? "The mail server accepted the email. Ask the customer to check their inbox or spam folder." : completionOtpEmailStatus === "FAILED" ? "The verification email could not be sent." : "Requesting verification email…"}
        </p>
        {completionOtpEmailHint && <p className="mt-2 text-sm text-gray-600">Email destination: <span className="font-semibold text-gray-800">{completionOtpEmailHint}</span></p>}
        {completionOtpError && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{completionOtpError}</p>}
        <form className="mt-5 space-y-4" onSubmit={verifyCompletionCode}>
          <label htmlFor="delivery-completion-otp" className="block text-sm font-semibold text-gray-800">Customer's 6-digit code</label>
          <input id="delivery-completion-otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={completionOtp} onChange={(event) => { setCompletionOtp(event.target.value.replace(/\D/g, "").slice(0, 6)); setCompletionOtpError(""); }} disabled={completionOtpRequestBusy || completionOtpVerifyBusy || completionOtpExpiresIn <= 0 || completionOtpEmailStatus === "FAILED"} className="h-12 w-full rounded-xl border border-gray-300 px-4 text-center text-xl font-bold tracking-[0.35em] text-gray-900 outline-none transition focus:border-[#D2552B] focus:ring-2 focus:ring-orange-100 disabled:bg-gray-50" aria-describedby="delivery-otp-help" />
          <p id="delivery-otp-help" className="text-xs text-gray-500">{completionOtpExpiresIn > 0 ? `Code expires in ${formatCountdown(completionOtpExpiresIn)}. It can only be used once.` : "This code has expired. Request a new verification email."}</p>
          <button type="submit" disabled={completionOtp.length !== 6 || completionOtpVerifyBusy || completionOtpRequestBusy || completionOtpEmailStatus === "FAILED" || completionOtpExpiresIn <= 0} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            {completionOtpVerifyBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{completionOtpVerifyBusy ? "Verifying…" : "Verify & Deliver"}
          </button>
          <button type="button" onClick={resendCompletionCode} disabled={completionOtpRequestBusy || completionOtpVerifyBusy || completionOtpCooldown > 0} className="min-h-11 w-full rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] disabled:cursor-not-allowed disabled:opacity-50">
            {completionOtpRequestBusy ? "Requesting email…" : completionOtpCooldown > 0 ? `Resend email in ${completionOtpCooldown}s` : "Resend verification email"}
          </button>
        </form>
      </section>
    </div>}
  </>;

  if (section === "history") {
    const earnedValues = orders.filter((order) => order.status === "DELIVERED").map((order) => order.deliveryEarning ?? order.deliveryFee).filter((value) => value != null && Number.isFinite(Number(value)));
    const totalEarned = earnedValues.length ? money(earnedValues.reduce((sum, value) => sum + Number(value), 0)) : "—";
    return <section className="mx-auto w-full max-w-[1400px] space-y-6" aria-label="Delivery history">
      {loading ? <HistoryDeliverySkeletons /> : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{error}</p><button type="button" onClick={() => load()} className="inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 transition duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></div></div>
        : orders.length ? <><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="text-[#2B1B12]/60">{orders.length} deliveries</p><p className="font-semibold text-emerald-800">Total earned {totalEarned}</p></div><div className="flex w-full min-w-0 flex-col gap-4">{orders.map((order) => <HistoryDeliveryCard key={order.id} order={order} />)}</div></>
          : <div className="mx-auto flex min-h-[300px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-[#2B1B12]/10 bg-white px-6 py-16 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D2552B]/10 text-[#D2552B]"><Clock3 className="h-8 w-8" aria-hidden="true" /></span><h1 className="mt-5 text-lg font-semibold text-[#2B1B12]">No deliveries yet</h1><p className="mt-2 text-sm text-[#2B1B12]/60">Completed deliveries will appear here.</p><Link to="/delivery-agent/available" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Browse available deliveries</Link></div>}
    </section>;
  }

  if (section === "earnings") {
    const deliveries = Array.isArray(data?.deliveries) ? data.deliveries : [];
    const now = new Date();
    const todayStart = getLocalDayStart(now);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = getWeekStart(now);
    const monthStart = getMonthStart(now);
    const isOnOrAfter = (delivery, start) => {
      const date = getDeliveryDate(delivery);
      return date && date >= start && date <= now;
    };
    const amountSum = (items) => {
      const amounts = items.map(getDeliveryAmount);
      return amounts.some((amount) => amount == null) ? null : amounts.reduce((sum, amount) => sum + amount, 0);
    };
    const formatEarning = (amount) => amount == null ? "—" : money(amount);
    const todayDeliveries = deliveries.filter((delivery) => isOnOrAfter(delivery, todayStart));
    const weekDeliveries = deliveries.filter((delivery) => isOnOrAfter(delivery, weekStart));
    const totalEarned = amountSum(deliveries);
    const filteredDeliveries = deliveries.filter((delivery) => {
      if (earningsFilter === "All") return true;
      const start = earningsFilter === "Today" ? todayStart : earningsFilter === "This week" ? weekStart : monthStart;
      return isOnOrAfter(delivery, start);
    });
    const groupedDeliveries = new Map();
    filteredDeliveries.forEach((delivery) => {
      const date = getDeliveryDate(delivery);
      const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown";
      if (!groupedDeliveries.has(key)) groupedDeliveries.set(key, { date, deliveries: [] });
      groupedDeliveries.get(key).deliveries.push(delivery);
    });
    const dateKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const filters = ["All", "Today", "This week", "This month"];

    return <section className="mx-auto w-full max-w-[1400px] space-y-6" aria-label="Delivery earnings">
      {loading ? <EarningsSkeleton /> : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold">{error}</p><button type="button" onClick={() => load()} className="inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 text-sm font-bold text-red-700 transition duration-150 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">Try again</button></div></div> : <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <EarningsStatCard label="Total earned" value={formatEarning(totalEarned)} caption={`From ${deliveries.length} deliveries`} Icon={Wallet} highlight />
          <EarningsStatCard label="Today" value={formatEarning(amountSum(todayDeliveries))} caption={`${todayDeliveries.length} deliveries today`} Icon={CalendarDays} />
          <EarningsStatCard label="This week" value={formatEarning(amountSum(weekDeliveries))} caption={`${weekDeliveries.length} deliveries`} Icon={Bike} />
          <EarningsStatCard label="Average per delivery" value={deliveries.length ? formatEarning(totalEarned == null ? null : totalEarned / deliveries.length) : money(0)} caption="Per completed delivery" Icon={TrendingUp} />
        </div>
        <p className="-mt-3 text-sm text-gray-500">Based on completed deliveries. Payouts are not shown here.</p>
        <section aria-labelledby="earnings-list-title" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="earnings-list-title" className="text-xl font-semibold text-[#2B1B12]">Earnings by delivery</h2>
            <div className="flex flex-wrap gap-2" aria-label="Filter earnings">
              {filters.map((filter) => <button key={filter} type="button" aria-pressed={earningsFilter === filter} onClick={() => setEarningsFilter(filter)} className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2 ${earningsFilter === filter ? "border-[#D2552B] bg-[#D2552B] text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{filter}</button>)}
            </div>
          </div>
          {groupedDeliveries.size ? <div className="space-y-5">
            {[...groupedDeliveries.entries()].map(([key, group]) => {
              const groupLabel = !group.date ? "Date unavailable" : dateKey(group.date) === dateKey(todayStart) ? "Today" : dateKey(group.date) === dateKey(yesterdayStart) ? "Yesterday" : group.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
              return <section key={key} aria-label={`${groupLabel} earnings`} className="space-y-3">
                <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-gray-600">{groupLabel}</h3><p className="text-sm font-semibold text-emerald-800">{formatEarning(amountSum(group.deliveries))}</p></div>
                <div className="flex flex-col gap-3">{group.deliveries.map((delivery) => <EarningsDeliveryRow key={delivery.id} delivery={delivery} />)}</div>
              </section>;
            })}
          </div> : <div className="mx-auto flex min-h-[260px] max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center shadow-sm"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#D2552B]/10 text-[#D2552B]"><Wallet className="h-8 w-8" aria-hidden="true" /></span><h3 className="mt-4 text-lg font-semibold text-[#2B1B12]">No earnings yet</h3><p className="mt-2 text-sm text-gray-500">Complete a delivery to start earning.</p><Link to="/delivery-agent/available" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#D2552B] px-5 py-2.5 text-sm font-bold text-white transition duration-150 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D2552B] focus-visible:ring-offset-2">Browse available deliveries</Link></div>}
        </section>
      </>}
    </section>;
  }

  return <section className="mx-auto max-w-4xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#D2552B]">Delivery Agent Panel</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold tracking-tight text-[#2B1B12]"><Icon className="h-7 w-7" />{title}</h1></div><button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></header>
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}<button type="button" onClick={load} className="ml-2 font-bold underline">Try again</button></div></div>}
    {notice && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</p>}
    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin text-red-600" />Loading…</div> : error ? null : orders.length ? <div className="space-y-3">{orders.map((order) => <OrderCard key={order.id} order={order} showAddress={section !== "available"}>{section === "available" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, "claim")} className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">{busyId === order.id ? "Claiming…" : "Accept delivery"}</button> : section === "current" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, order.status === "READY_FOR_PICKUP" ? "pickup" : "complete")} className="rounded-xl bg-[#D2552B] px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">{busyId === order.id ? "Updating…" : order.status === "READY_FOR_PICKUP" ? "Picked up" : "Mark delivered"}</button> : section === "history" && order.status === "DELIVERED" && order.paymentMethod === "COD" && order.paymentStatus === "PENDING" ? <button type="button" disabled={Boolean(busyId)} onClick={() => act(order.id, "collect")} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">{busyId === order.id ? "Recording…" : "Confirm cash collected"}</button> : null}</OrderCard>)}</div> : <div className="rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm"><Icon className="mx-auto h-9 w-9 text-gray-400" /><p className="mt-3 font-bold text-[#2B1B12]">{section === "available" ? "No deliveries are ready right now." : section === "current" ? "No active deliveries assigned." : "No completed deliveries yet."}</p><p className="mt-1 text-sm text-gray-600">Refresh this page to check for updates.</p></div>}
    <Link to="/delivery-agent" className="inline-flex items-center gap-2 text-sm font-bold text-red-700 hover:underline"><ArrowLeft className="h-4 w-4" />Home</Link>
  </section>;
};

export default DeliveryAgentSectionPage;
