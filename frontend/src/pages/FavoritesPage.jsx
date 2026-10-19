import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { AlertCircle, Heart, LoaderCircle, UtensilsCrossed } from "lucide-react";
import FavoriteButton from "../components/favorites/FavoriteButton.jsx";
import { fetchFavorites } from "../store/slices/favoritesSlice.js";

const formatPrice = (price) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

export const FavoritesPage = () => {
  const dispatch = useDispatch();
  const { items, status, error } = useSelector((state) => state.favorites);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-7">
        <p className="text-sm font-semibold text-rose-700">Your collection</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900">Favorite dishes</h1>
        <p className="mt-2 text-sm text-gray-600">The dishes you saved for another time.</p>
      </header>

      {status === "idle" || status === "loading" ? (
        <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading your favorites…</div>
      ) : status === "failed" && error ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center" role="alert">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <p className="mt-3 font-semibold text-red-900">Favorites could not be loaded</p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
          <button type="button" onClick={() => dispatch(fetchFavorites())} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">Try again</button>
        </section>
      ) : items.length === 0 ? (
        <section className="rounded-2xl border border-orange-100 bg-white px-5 py-14 text-center">
          <Heart className="mx-auto h-10 w-10 text-rose-400" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">No favorites yet</h2>
          <p className="mt-2 text-sm text-gray-600">Save dishes you love and they’ll be collected here.</p>
          <Link to="/explore" className="mt-5 inline-flex rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700">Browse dishes</Link>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((dish) => (
            <article key={dish.id} className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
              <Link to={`/dishes/${encodeURIComponent(dish.id)}`} className="block focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500">
                {dish.image ? <img src={dish.image} alt={dish.name} className="h-48 w-full object-cover" loading="lazy" /> : <div className="flex h-48 items-center justify-center bg-orange-50 text-orange-300"><UtensilsCrossed className="h-10 w-10" aria-hidden="true" /></div>}
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3"><h2 className="font-bold text-gray-900">{dish.name}</h2><span className="shrink-0 font-bold text-gray-900">{formatPrice(dish.price)}</span></div>
                  <p className="text-xs text-gray-500">{dish.cook?.businessName || "TasteBridge cook"}</p>
                  <p className={`text-xs font-semibold ${dish.isAvailable ? "text-emerald-700" : "text-amber-700"}`}>{dish.isAvailable ? "Available" : "Currently unavailable"}</p>
                </div>
              </Link>
              <div className="border-t border-gray-100 px-4 py-3"><FavoriteButton dishId={dish.id} showLabel className="w-full" /></div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

export default FavoritesPage;
