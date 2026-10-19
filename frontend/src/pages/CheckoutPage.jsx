import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle2, CreditCard, Landmark, LoaderCircle, MapPin, QrCode, ShoppingBag, Wallet, X } from "lucide-react";
import { orderApi } from "../api/orderApi.js";
import { UpiScreen } from "../components/checkout/UpiScreen.jsx";
import { CardScreen } from "../components/checkout/CardScreen.jsx";
import { NetBankingScreen } from "../components/checkout/NetBankingScreen.jsx";
import { WalletScreen } from "../components/checkout/WalletScreen.jsx";
import { PaymentSuccess } from "../components/checkout/PaymentSuccess.jsx";
import { PaymentFailed } from "../components/checkout/PaymentFailed.jsx";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);
const requestKeyStorage = "tastebridge:checkout-idempotency";
const onlineRequestKeyStorage = "tastebridge:online-checkout-idempotency";
const onlineAttemptStorage = "tastebridge:online-payment-attempt";
const getRequestKey = () => {
  const existing = sessionStorage.getItem(requestKeyStorage);
  if (existing) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(requestKeyStorage, key);
  return key;
};
const getOnlineRequestKey = () => {
  const existing = sessionStorage.getItem(onlineRequestKeyStorage);
  if (existing) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(onlineRequestKeyStorage, key);
  return key;
};
const simulatedMethods = [
  { id: "upi", label: "UPI ID / QR", icon: QrCode },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "bank", label: "Net banking", icon: Landmark },
  { id: "wallet", label: "Wallet", icon: Wallet },
];

export const CheckoutPage = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [demoMethod, setDemoMethod] = useState("upi");
  const [paymentAttempt, setPaymentAttempt] = useState(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentStage, setPaymentStage] = useState("choice");
  const [confirmedFulfillment, setConfirmedFulfillment] = useState(null);

  const finishOnlinePayment = useCallback((fulfillment) => {
    const orders = fulfillment?.orders;
    if (fulfillment?.paymentAttempt?.status !== "SUCCEEDED"
      || !fulfillment?.checkoutId
      || !Array.isArray(orders)
      || !orders.length
      || orders.some((order) => !order?.id)) {
      throw new Error("Payment was not confirmed with completed kitchen orders. Refresh the attempt status before retrying.");
    }
    sessionStorage.removeItem(onlineAttemptStorage);
    sessionStorage.removeItem(onlineRequestKeyStorage);
    setConfirmedFulfillment(fulfillment);
    setPaymentAttempt(fulfillment.paymentAttempt);
    setPaymentStage("success");
  }, []);

  const viewConfirmedOrders = () => {
    if (!confirmedFulfillment) return;
    navigate(`/orders/confirmation/${encodeURIComponent(confirmedFulfillment.checkoutId)}`, {
      replace: true,
      state: { onlinePaymentConfirmed: true, orderIds: confirmedFulfillment.orders.map((order) => order.id) },
    });
  };

  useEffect(() => {
    const attemptId = sessionStorage.getItem(onlineAttemptStorage);
    if (!attemptId) return;
    let active = true;
    orderApi.getPaymentAttempt(attemptId).then((response) => {
      const attempt = response?.data || null;
      if (active) {
        setPaymentAttempt(attempt);
        setPaymentMethod("ONLINE");
        setShowPaymentChoice(true);
        setPaymentStage(attempt?.status === "PENDING" ? "gateway" : attempt?.status === "SUCCEEDED" ? "processing" : "failure");
      }
      if (active && attempt?.status === "SUCCEEDED") {
        return orderApi.confirmPaymentAttempt(attemptId).then((confirmed) => {
          if (active) finishOnlinePayment(confirmed?.data);
        }).catch((requestError) => {
          if (active) {
            setPaymentStage("gateway");
            setPaymentError(requestError.message || "Confirmed orders could not be loaded. Retry confirmation safely.");
          }
        });
      }
    }).catch((requestError) => {
      if (active) {
        sessionStorage.removeItem(onlineAttemptStorage);
        sessionStorage.removeItem(onlineRequestKeyStorage);
        setPaymentMethod("ONLINE");
        setShowPaymentChoice(true);
        setPaymentStage("failure");
        setPaymentError(requestError.message || "The previous payment attempt could not be retrieved.");
      }
    });
    return () => { active = false; };
  }, [finishOnlinePayment]);

  useEffect(() => {
    if (!showPaymentChoice || paymentAttempt?.status !== "PENDING" || !paymentAttempt.id) return undefined;
    let active = true;
    const poll = window.setInterval(() => {
      orderApi.getPaymentAttempt(paymentAttempt.id).then((response) => {
        const current = response?.data || null;
        if (active) {
          if (!current) {
            setPaymentStage("failure");
            setPaymentError("The payment attempt could not be found. No order was created.");
            return;
          }
          setPaymentAttempt(current);
          if (current?.status === "FAILED" || current?.status === "EXPIRED") setPaymentStage("failure");
          if (current?.status === "SUCCEEDED") {
            setPaymentStage("processing");
            orderApi.confirmPaymentAttempt(current.id).then((confirmed) => {
              if (active) finishOnlinePayment(confirmed?.data);
            }).catch((requestError) => {
              if (active) {
                setPaymentStage("gateway");
                setPaymentError(requestError.message || "Confirmed orders could not be loaded. Retry confirmation safely.");
              }
            });
          }
        }
      }).catch((requestError) => {
        if (active) setPaymentError(requestError.message || "Payment status could not be refreshed.");
      });
    }, 5000);
    return () => { active = false; window.clearInterval(poll); };
  }, [finishOnlinePayment, paymentAttempt?.id, paymentAttempt?.status, showPaymentChoice]);

  const cancelOnlinePayment = useCallback(async () => {
    const attemptId = paymentAttempt?.id || sessionStorage.getItem(onlineAttemptStorage);
    if (!attemptId || paymentBusy) {
      setShowPaymentChoice(false);
      return;
    }
    setPaymentBusy(true);
    setPaymentError("");
    try {
      const response = await orderApi.cancelPaymentAttempt(attemptId);
      const cancelled = response?.data || null;
      setPaymentAttempt(cancelled);
      if (cancelled?.status === "SUCCEEDED") {
        const confirmed = await orderApi.confirmPaymentAttempt(attemptId);
        finishOnlinePayment(confirmed?.data);
        return;
      }
      sessionStorage.removeItem(onlineAttemptStorage);
      sessionStorage.removeItem(onlineRequestKeyStorage);
      setPaymentStage("cancelled");
    } catch (requestError) {
      setPaymentError(requestError.message || "The payment attempt could not be cancelled.");
    } finally {
      setPaymentBusy(false);
    }
  }, [paymentAttempt?.id, paymentBusy, finishOnlinePayment]);

  useEffect(() => {
    if (!showPaymentChoice) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (paymentBusy) {
          event.preventDefault();
          return;
        }
        if (paymentStage === "gateway" && paymentAttempt?.status === "PENDING") {
          cancelOnlinePayment();
        } else {
          setShowPaymentChoice(false);
          setPaymentError("");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPaymentChoice, paymentBusy, paymentStage, paymentAttempt?.status, cancelOnlinePayment]);

  const loadSummary = useCallback(async (addressId) => {
    setLoading(true);
    setError("");
    try {
      const response = await orderApi.getCheckoutSummary(addressId ? { addressId } : {});
      const next = response?.data || null;
      setSummary(next);
      setSelectedAddressId(next?.selectedAddressId || "");
    } catch (requestError) {
      setError(requestError.message || "Checkout details could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    orderApi.getCheckoutSummary()
      .then((response) => {
        if (!active) return;
        const next = response?.data || null;
        setSummary(next);
        setSelectedAddressId(next?.selectedAddressId || "");
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "Checkout details could not be loaded. Please try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const placeOrder = async () => {
    if (!selectedAddressId || placing || !summary?.canPlaceOrder || paymentMethod !== "COD") return;
    setPlacing(true);
    setError("");
    try {
      const response = await orderApi.placeOrder({ addressId: selectedAddressId, paymentMethod, idempotencyKey: getRequestKey() });
      const checkout = response?.data;
      if (!checkout?.id) throw new Error("The order response was incomplete. Refresh your orders before trying again.");
      sessionStorage.removeItem(requestKeyStorage);
      navigate(`/orders/confirmation/${encodeURIComponent(checkout.id)}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message || "Your order could not be placed. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const startOnlinePayment = async () => {
    if (!selectedAddressId || paymentBusy || !summary?.canPlaceOrder || !summary?.items?.length) return;
    setPaymentBusy(true);
    setPaymentError("");
    let startedAttempt = null;
    try {
      const response = await orderApi.initiateOnlineCheckout({
        addressId: selectedAddressId,
        idempotencyKey: getOnlineRequestKey(),
      });
      const initiated = response?.data;
      if (!initiated?.paymentAttempt?.id || initiated.paymentAttempt.status !== "PENDING") {
        throw new Error("The payment service returned an incomplete pending attempt.");
      }
      sessionStorage.setItem(onlineAttemptStorage, initiated.paymentAttempt.id);
      const statusResponse = await orderApi.getPaymentAttempt(initiated.paymentAttempt.id);
      const currentAttempt = statusResponse?.data || initiated.paymentAttempt;
      startedAttempt = currentAttempt;
      setPaymentAttempt(currentAttempt);
      setShowPaymentChoice(true);
      setPaymentMethod("ONLINE");
      if (currentAttempt.status === "PENDING") {
        setPaymentStage("gateway");
      } else if (currentAttempt.status === "SUCCEEDED") {
        setPaymentStage("processing");
        const confirmed = await orderApi.confirmPaymentAttempt(currentAttempt.id);
        finishOnlinePayment(confirmed?.data);
      } else {
        sessionStorage.removeItem(onlineAttemptStorage);
        sessionStorage.removeItem(onlineRequestKeyStorage);
        setPaymentStage("failure");
      }
    } catch (requestError) {
      if (startedAttempt) {
        setPaymentAttempt(startedAttempt);
        setPaymentMethod("ONLINE");
        setShowPaymentChoice(true);
        setPaymentStage(startedAttempt.status === "PENDING" || startedAttempt.status === "SUCCEEDED" ? "gateway" : "failure");
      }
      setPaymentError(requestError.message || "Payment could not be started. Please try again.");
    } finally {
      setPaymentBusy(false);
    }
  };

  const confirmOnlinePayment = async (mockOutcome) => {
    let attemptId = paymentAttempt?.id || sessionStorage.getItem(onlineAttemptStorage);
    if (paymentBusy) return;
    setPaymentBusy(true);
    setPaymentStage("processing");
    setPaymentError("");
    try {
      if (!attemptId && selectedAddressId) {
        const initResponse = await orderApi.initiateOnlineCheckout({
          addressId: selectedAddressId,
          idempotencyKey: getOnlineRequestKey(),
        });
        const initiated = initResponse?.data;
        if (!initiated?.paymentAttempt?.id) {
          throw new Error("The payment service returned an incomplete pending attempt.");
        }
        attemptId = initiated.paymentAttempt.id;
        sessionStorage.setItem(onlineAttemptStorage, attemptId);
        setPaymentAttempt(initiated.paymentAttempt);
      }
      if (!attemptId) {
        throw new Error("Could not initialize payment attempt. Please verify your delivery address.");
      }
      const response = await orderApi.confirmPaymentAttempt(attemptId, mockOutcome);
      const result = response?.data;
      setPaymentAttempt(result?.paymentAttempt || null);
      if (result?.paymentAttempt?.status === "SUCCEEDED") {
        finishOnlinePayment(result);
      } else if (result?.paymentAttempt?.status === "FAILED") {
        sessionStorage.removeItem(onlineAttemptStorage);
        sessionStorage.removeItem(onlineRequestKeyStorage);
        setPaymentStage("failure");
      } else {
        setPaymentStage("failure");
        setPaymentError("This payment attempt is no longer active. No order was created.");
      }
    } catch (requestError) {
      setPaymentError(requestError.message || "Payment could not be confirmed. Please refresh and check its status.");
      setPaymentStage("failure");
      try {
        if (attemptId) {
          const statusResponse = await orderApi.getPaymentAttempt(attemptId);
          const current = statusResponse?.data || null;
          setPaymentAttempt(current);
          if (current?.status === "EXPIRED" || current?.status === "FAILED") {
            sessionStorage.removeItem(onlineAttemptStorage);
            sessionStorage.removeItem(onlineRequestKeyStorage);
            setPaymentStage("failure");
          } else if (current?.status === "PENDING" || current?.status === "SUCCEEDED") setPaymentStage("gateway");
        }
      } catch { /* Keep the confirmation error visible if status refresh also fails. */ }
    } finally {
      setPaymentBusy(false);
    }
  };

  const retryOnlinePayment = () => {
    sessionStorage.removeItem(onlineAttemptStorage);
    sessionStorage.removeItem(onlineRequestKeyStorage);
    setPaymentAttempt(null);
    setConfirmedFulfillment(null);
    setPaymentError("");
    setPaymentStage("choice");
  };

  if (loading && !summary) return <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Preparing checkout…</div>;

  const addresses = summary?.addresses || [];
  const totals = summary?.totals || {};
  const items = summary?.items || [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link to="/cart" className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to cart</Link>
      <div className="mt-5">
        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-gray-600">Review your dishes and choose a saved delivery address.</p>
      </div>

      {error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div>}

      {!summary && !loading ? (
        <section className="mt-7 rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-9 w-9 text-red-500" aria-hidden="true" />
          <h2 className="mt-3 font-bold text-gray-900">Checkout could not be loaded</h2>
          <button type="button" onClick={() => loadSummary()} className="mt-4 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Try again</button>
        </section>
      ) : !addresses.length && !loading ? (
        <section className="mt-7 rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
          <MapPin className="mx-auto h-10 w-10 text-orange-400" aria-hidden="true" />
          <h2 className="mt-3 font-bold text-gray-900">Add a delivery address</h2>
          <p className="mt-1 text-sm text-gray-600">A saved address is needed before you can place an order.</p>
          <Link to="/addresses" className="mt-4 inline-flex rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700">Manage addresses</Link>
        </section>
      ) : (
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-gray-900">Delivery address</h2><Link to="/addresses" className="text-sm font-semibold text-red-700 hover:underline">Manage addresses</Link></div>
              <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="checkout-address">Choose a saved address</label>
              <select id="checkout-address" value={selectedAddressId} onChange={(event) => { setSelectedAddressId(event.target.value); loadSummary(event.target.value); }} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-100">
                <option value="">Select an address</option>
                {addresses.map((address) => <option key={address.id} value={address.id}>{address.label || "Delivery address"}{address.isDefault ? " (Default)" : ""} — {address.city}, {address.pincode}</option>)}
              </select>
              {summary?.addressSnapshot && <div className="mt-3 rounded-xl bg-orange-50/70 p-4 text-sm text-gray-700"><p className="font-semibold text-gray-900">{summary.addressSnapshot.recipientName} · {summary.addressSnapshot.phone}</p><p className="mt-1">{[summary.addressSnapshot.addressLine1, summary.addressSnapshot.addressLine2, summary.addressSnapshot.locality, summary.addressSnapshot.landmark, summary.addressSnapshot.city, summary.addressSnapshot.state, summary.addressSnapshot.pincode].filter(Boolean).join(", ")}</p></div>}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-bold text-gray-900">Items in your order</h2>
              {!items.length ? <div className="py-10 text-center"><ShoppingBag className="mx-auto h-9 w-9 text-orange-300" aria-hidden="true" /><p className="mt-3 text-sm text-gray-600">Your cart is empty.</p><Link to="/explore" className="mt-3 inline-block text-sm font-semibold text-red-700">Browse dishes</Link></div> : <div className="mt-4 divide-y divide-gray-100">{items.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0"><div className="flex min-w-0 gap-3">{item.dish?.image ? <img src={item.dish.image} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-orange-50"><ShoppingBag className="h-6 w-6 text-orange-300" aria-hidden="true" /></div>}<div><h3 className="font-semibold text-gray-900">{item.dish?.name || "Removed dish"}</h3><p className="mt-1 text-xs text-gray-600">{item.dish?.cook?.businessName || "Home kitchen"} · Qty {item.quantity}</p><p className="mt-1 text-xs text-gray-600">{formatPrice(item.unitPrice)} each</p>{!item.isAvailable && <p className="mt-1 text-xs text-red-700">{item.unavailableReasons?.join(" ")}</p>}</div></div><span className="shrink-0 text-sm font-bold text-gray-900">{formatPrice(item.subtotal)}</span></article>)}</div>}
              {summary?.issues?.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Please resolve these items before ordering:</p><ul className="mt-2 list-disc space-y-1 pl-5">{summary.issues.flatMap((issue) => issue.reasons).map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul><Link to="/cart" className="mt-3 inline-block font-semibold underline">Review your cart</Link></div>}
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Order summary</h2>
            <div className="mt-4 space-y-2 text-sm text-gray-600"><div className="flex justify-between"><span>Items subtotal</span><span>{formatPrice(totals.subtotal)}</span></div><div className="flex justify-between"><span>Delivery ({summary?.orderSplits?.length || 0} kitchen orders)</span><span>{formatPrice(totals.deliveryFee)}</span></div><div className="flex justify-between"><span>Platform fee</span><span>{formatPrice(totals.platformFee)}</span></div></div>
            <div className="mt-4 flex justify-between border-t border-gray-100 pt-4 text-base font-extrabold text-gray-900"><span>Total</span><span>{formatPrice(totals.totalAmount)}</span></div>
            {summary?.orderSplits?.length > 1 && <p className="mt-3 text-xs leading-5 text-gray-600">Your cart includes multiple cooks. TasteBridge will create a separate kitchen order for each cook under this checkout.</p>}
            <p className="mt-3 rounded-lg bg-orange-50/70 p-3 text-xs leading-5 text-stone-700">Choose between Cash on Delivery and seamless Online Payment.</p>
            <button type="button" onClick={() => { setPaymentMethod(""); setPaymentStage("choice"); setPaymentError(""); setShowPaymentChoice(true); }} disabled={!summary?.canPlaceOrder || placing || loading || Boolean(error)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Place order</button>
          </aside>
        </div>
      )}
      {showPaymentChoice && <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget && !paymentBusy) {
            if (paymentStage === "gateway" && paymentAttempt?.status === "PENDING") {
              cancelOnlinePayment();
            } else {
              setShowPaymentChoice(false);
              setPaymentError("");
            }
          }
        }}
      >
        <section role="dialog" aria-modal="true" aria-labelledby="payment-choice-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-rose-700 via-red-700 to-orange-600 px-5 py-5 text-white sm:px-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="payment-choice-title" className="text-xl font-extrabold sm:text-2xl tracking-tight">TasteBridge Pay</h2>
                <p className="mt-0.5 text-xs font-medium text-rose-100/90">{paymentStage === "choice" ? "Select your payment method" : "Online payment"}</p>
              </div>
              <button type="button" aria-label="Close payment dialog" onClick={cancelOnlinePayment} disabled={paymentBusy} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-7">
            {paymentError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{paymentError}</div>}

            {paymentStage === "choice" && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-gray-700">Select how you want to pay for this checkout.</p>
                <div className="space-y-3">
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${paymentMethod === "COD" ? "border-orange-400 bg-orange-50 ring-2 ring-orange-200" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} className="mt-1 accent-red-600" />
                    <span>
                      <strong className="block text-sm text-gray-900">Cash on Delivery</strong>
                      <span className="mt-1 block text-xs text-gray-600">Pay cash when your order is delivered. Payment remains pending until collection.</span>
                    </span>
                  </label>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${paymentMethod === "ONLINE" ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                    <input type="radio" name="paymentMethod" value="ONLINE" checked={paymentMethod === "ONLINE"} onChange={() => setPaymentMethod("ONLINE")} className="mt-1 accent-red-600" />
                    <span>
                      <strong className="block text-sm text-gray-900">Online Payment</strong>
                      <span className="mt-1 block text-xs text-gray-600">Simulated checkout via UPI, cards, net banking, or wallets. No money is charged.</span>
                    </span>
                  </label>
                </div>

                {paymentMethod === "COD" && (
                  <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                    Cash on Delivery remains unchanged. Payment is pending until cash is collected.
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => { setShowPaymentChoice(false); setPaymentError(""); }}
                    disabled={paymentBusy}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  {paymentMethod === "COD" && (
                    <button
                      type="button"
                      onClick={async () => { setShowPaymentChoice(false); await placeOrder(); }}
                      disabled={placing}
                      className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {placing ? "Placing…" : "Confirm COD order"}
                    </button>
                  )}
                  {paymentMethod === "ONLINE" && (
                    <button
                      type="button"
                      onClick={startOnlinePayment}
                      disabled={paymentBusy || placing}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-3 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {paymentBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      {paymentBusy ? "Starting…" : "Continue to payment"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {paymentStage === "gateway" && (
              <div className="space-y-4">
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" role="note">
                  Simulated checkout only. No payment provider is contacted. Do not enter real payment or banking credentials.
                </p>
                <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order amount</p>
                      <p className="mt-1 text-3xl font-extrabold tracking-tight text-gray-950">
                        {formatPrice(paymentAttempt?.amount ?? totals.totalAmount)} <span className="text-sm font-bold text-gray-500">INR</span>
                      </p>
                    </div>
                    {paymentAttempt && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{paymentAttempt.status}</span>}
                  </div>
                  <div className="mt-4 space-y-2 border-t border-gray-200 pt-3 text-xs text-gray-600">
                    {items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between gap-3">
                        <span className="truncate">{item.dish?.name || "Dish"} × {item.quantity}</span>
                        <span className="shrink-0">{formatPrice(item.subtotal)}</span>
                      </div>
                    ))}
                    {items.length > 3 && <p>+ {items.length - 3} more items</p>}
                    <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-gray-800">
                      <span>Total due</span>
                      <span>{formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}</span>
                    </div>
                  </div>
                </div>

                {paymentAttempt && (
                  <p className="text-xs text-gray-500">
                    Order reference: <span className="font-mono">{paymentAttempt.reference}</span>
                    {paymentAttempt.expiresAt && <> · expires {new Date(paymentAttempt.expiresAt).toLocaleTimeString()}</>}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Simulated payment options">
                  {simulatedMethods.map(({ id, label, icon: Icon }) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setDemoMethod(id)}
                      aria-pressed={demoMethod === id}
                      disabled={paymentBusy}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        demoMethod === id
                          ? "border-red-500 bg-red-50 ring-2 ring-red-200 font-bold"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <Icon className="h-5 w-5 text-red-600" aria-hidden="true" />
                      <span className="mt-2 block text-xs font-bold text-gray-900">{label}</span>
                    </button>
                  ))}
                </div>

                {/* Active Screen Component */}
                {demoMethod === "upi" && (
                  <UpiScreen
                    amount={formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}
                    reference={paymentAttempt?.reference || "TB-SIM-DEMO"}
                    onConfirm={confirmOnlinePayment}
                    onCancel={() => setPaymentStage("choice")}
                    isBusy={paymentBusy}
                  />
                )}
                {demoMethod === "card" && (
                  <CardScreen
                    amount={formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}
                    onConfirm={confirmOnlinePayment}
                    onCancel={() => setPaymentStage("choice")}
                    isBusy={paymentBusy}
                  />
                )}
                {demoMethod === "bank" && (
                  <NetBankingScreen
                    amount={formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}
                    onConfirm={confirmOnlinePayment}
                    onCancel={() => setPaymentStage("choice")}
                    isBusy={paymentBusy}
                  />
                )}
                {demoMethod === "wallet" && (
                  <WalletScreen
                    amount={formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}
                    onConfirm={confirmOnlinePayment}
                    onCancel={() => setPaymentStage("choice")}
                    isBusy={paymentBusy}
                  />
                )}

              </div>
            )}

            {paymentStage === "success" && (
              <PaymentSuccess
                amount={formatPrice(paymentAttempt?.amount ?? totals.totalAmount)}
                reference={paymentAttempt?.reference}
                orderCount={confirmedFulfillment?.orders?.length || 1}
                onViewOrders={viewConfirmedOrders}
              />
            )}

            {paymentStage === "failure" && (
              <PaymentFailed
                error={paymentError}
                reference={paymentAttempt?.reference}
                onRetry={retryOnlinePayment}
                onClose={() => {
                  setShowPaymentChoice(false);
                  setPaymentError("");
                }}
                isBusy={paymentBusy}
              />
            )}

            {paymentStage === "cancelled" && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center" role="status">
                <X className="mx-auto h-10 w-10 text-gray-500" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-extrabold text-gray-900">Payment cancelled</h3>
                <p className="mt-1 text-sm text-gray-600">No order was fulfilled. Your cart and inventory remain unchanged.</p>
                <button type="button" onClick={retryOnlinePayment} className="mt-5 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-100">
                  Back to payment methods
                </button>
              </div>
            )}

            {paymentStage === "processing" && (
              <div className="rounded-2xl bg-slate-50 p-6 text-center" role="status">
                <LoaderCircle className="mx-auto h-8 w-8 animate-spin text-red-600" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-gray-800">Waiting for the server to confirm your payment…</p>
                <p className="mt-1 text-xs text-gray-500">Do not refresh or submit another payment action.</p>
              </div>
            )}

            {paymentMethod === "ONLINE" && paymentStage === "gateway" && paymentAttempt?.status === "SUCCEEDED" && (
              <div className="flex justify-end border-t border-gray-100 pt-4">
                <button type="button" onClick={() => confirmOnlinePayment()} disabled={paymentBusy} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                  {paymentBusy ? "Loading orders…" : "Retry confirmation lookup"}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>}
    </main>
  );
};

export default CheckoutPage;
