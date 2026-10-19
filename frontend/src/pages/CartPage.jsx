import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, LoaderCircle, Minus, Plus, RefreshCw, ShoppingBag, Trash2, UtensilsCrossed } from "lucide-react";
import { cartApi } from "../api/cartApi.js";

const formatPrice = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(value || 0);

export const CartPage = () => {
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyItemId, setBusyItemId] = useState(null);

  const loadCart = useCallback(async (signal) => {
    try {
      setError("");
      const response = await cartApi.getCart(signal ? { signal } : {});
      setCart(response?.data || { items: [], totals: { subtotal: 0, itemCount: 0, unavailableItemCount: 0 } });
    } catch (requestError) {
      if (requestError.name !== "CanceledError" && requestError.code !== "ERR_CANCELED") {
        setError(requestError.message || "Your cart could not be loaded. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    cartApi.getCart({ signal: controller.signal })
      .then((response) => {
        if (active) {
          setCart(response?.data || { items: [], totals: { subtotal: 0, itemCount: 0, unavailableItemCount: 0 } });
          setError("");
        }
      })
      .catch((requestError) => {
        if (active && requestError.name !== "CanceledError" && requestError.code !== "ERR_CANCELED") {
          setError(requestError.message || "Your cart could not be loaded. Please try again.");
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  const applyMutation = async (itemId, request) => {
    setBusyItemId(itemId);
    setError("");
    try {
      const response = await request();
      setCart(response?.data || null);
    } catch (requestError) {
      setError(requestError.message || "The cart could not be updated. Please try again.");
    } finally {
      setBusyItemId(null);
    }
  };

  const items = cart?.items || [];
  const totals = cart?.totals || { subtotal: 0, itemCount: 0, unavailableItemCount: 0 };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading your cart…</div>;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Your cart</h1>
          <p className="mt-1 text-sm text-gray-600">Items from multiple home kitchens stay together here.</p>
        </div>
        <button type="button" onClick={() => loadCart()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh cart
        </button>
      </div>

      {error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

      {items.length === 0 && error ? (
        <section className="mt-8 rounded-3xl border border-red-100 bg-white px-5 py-12 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-300" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-gray-900">Your cart could not be loaded</h2>
          <p className="mt-2 text-sm text-gray-600">Check your connection and try again. Your saved cart has not been changed.</p>
          <button type="button" onClick={() => loadCart()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        </section>
      ) : items.length === 0 ? (
        <section className="mt-8 rounded-3xl border border-orange-100 bg-white px-5 py-16 text-center shadow-sm">
          <ShoppingBag className="mx-auto h-12 w-12 text-orange-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">Your cart is empty</h2>
          <p className="mt-2 text-sm text-gray-600">Explore eligible home-cooked dishes and add a few to your cart.</p>
          <Link to="/explore" className="mt-5 inline-flex rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700">Browse dishes</Link>
        </section>
      ) : (
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-3" aria-label="Cart items">
            {items.map((item) => (
              <article key={item.id} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${item.isAvailable ? "border-gray-200" : "border-amber-300"}`}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  {item.dish?.image ? <img src={item.dish.image} alt={item.dish.name} className="h-28 w-full rounded-xl object-cover sm:h-24 sm:w-28" /> : <div className="flex h-28 w-full items-center justify-center rounded-xl bg-orange-50 text-orange-300 sm:h-24 sm:w-28"><UtensilsCrossed className="h-8 w-8" aria-hidden="true" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-bold text-gray-900">{item.dish?.name || "Removed dish"}</h2>
                        <p className="mt-1 text-xs text-gray-600">Prepared by {item.dish?.cook?.businessName || "Home kitchen"}{item.dish?.cuisine ? ` · ${item.dish.cuisine}` : ""}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.isAvailable ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{item.isAvailable ? "Available" : "Currently unavailable"}</span>
                    </div>
                    {item.unavailableReasons?.length > 0 && <p className="mt-2 text-xs text-amber-900">{item.unavailableReasons.join(" ")}</p>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-800">{formatPrice(item.unitPrice)} each</span>
                        <div className="inline-flex items-center rounded-lg border border-gray-200">
                          <button type="button" aria-label={`Decrease ${item.dish?.name || "item"} quantity`} disabled={!item.isAvailable || busyItemId === item.id || item.quantity <= 1} onClick={() => applyMutation(item.id, () => cartApi.updateItem(item.id, { quantity: item.quantity - 1 }))} className="p-2 text-gray-700 disabled:opacity-40"><Minus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                          <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">{item.quantity}</span>
                          <button type="button" aria-label={`Increase ${item.dish?.name || "item"} quantity`} disabled={!item.isAvailable || busyItemId === item.id || item.quantity >= (item.dish?.availableQuantity || 0) || item.quantity >= 99} onClick={() => applyMutation(item.id, () => cartApi.updateItem(item.id, { quantity: item.quantity + 1 }))} className="p-2 text-gray-700 disabled:opacity-40"><Plus className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-extrabold text-gray-900">{formatPrice(item.subtotal)}</span>
                        <button type="button" disabled={busyItemId === item.id} onClick={() => applyMutation(item.id, () => cartApi.removeItem(item.id))} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"><Trash2 className="h-4 w-4" aria-hidden="true" /> Remove</button>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Cart summary</h2>
            <div className="mt-4 flex justify-between text-sm text-gray-600"><span>Available items</span><span>{totals.availableItemCount ?? totals.itemCount}</span></div>
            {totals.unavailableItemCount > 0 && <p className="mt-2 text-xs text-amber-800">Unavailable dishes are excluded from this total. Remove them or check back later.</p>}
            <div className="mt-4 flex justify-between border-t border-gray-100 pt-4 text-base font-extrabold text-gray-900"><span>Estimated total</span><span>{formatPrice(totals.subtotal)}</span></div>
            <p className="mt-3 text-xs leading-5 text-gray-500">Prices and availability are rechecked by the kitchen when you continue. Online payment is not available yet.</p>
            {totals.unavailableItemCount === 0 && items.length > 0 && <Link to="/checkout" className="mt-4 inline-flex w-full justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700">Continue to checkout</Link>}
            <Link to="/explore" className="mt-5 inline-flex w-full justify-center rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">Continue browsing</Link>
          </aside>
        </div>
      )}
    </main>
  );
};

export default CartPage;
