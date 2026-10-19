import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, AlertCircle, LoaderCircle, ShoppingBag, Star, UtensilsCrossed } from "lucide-react";
import api from "../api/axios.js";
import { cartApi } from "../api/cartApi.js";
import { marketplaceReturnLocation } from "../utils/marketplaceUrl.js";
import FavoriteButton from "../components/favorites/FavoriteButton.jsx";
import DishReviewList from "../components/reviews/DishReviewList.jsx";

const formatPrice = (price) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);

const AddDishToCart = ({ dish }) => {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const add = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      await cartApi.addItem({ dishId: dish.id, quantity: 1 });
      setMessage("Added to your cart.");
    } catch (requestError) {
      setError(requestError.status === 401
        ? "Sign in to add dishes to your cart."
        : requestError.message || "This dish could not be added. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6">
      <button type="button" onClick={add} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
        {saving ? "Adding…" : "Add to cart"}
      </button>
      {message && <p className="mt-2 text-sm text-emerald-700" role="status">{message} <Link to="/cart" className="font-semibold underline">View cart</Link></p>}
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
};

export const DishDetailPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [detailState, setDetailState] = useState({ id: null, dish: null, error: null });
  const pending = detailState.id !== id;
  const dish = pending ? null : detailState.dish;
  const error = pending ? null : detailState.error;

  useEffect(() => {
    const controller = new AbortController();
    api.get(`/dishes/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          if (!response?.data?.id) throw new Error("The dish could not be found.");
          setDetailState({ id, dish: response.data, error: null });
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setDetailState({
            id,
            dish: null,
            error: { status: requestError?.status, message: requestError?.message || "Dish details could not be loaded." },
          });
        }
      });
    return () => controller.abort();
  }, [id]);

  const backToMarketplace = marketplaceReturnLocation(searchParams);

  if (pending) {
    return <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading dish details…</div>;
  }

  if (error || !dish) {
    const unavailable = error?.status === 404;
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24" role="alert">
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold text-gray-900">{unavailable ? "Dish unavailable" : "Dish details could not be loaded"}</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-600">{unavailable ? "This dish may have sold out or is no longer available." : error?.message || "Please try again later."}</p>
        <Link to={backToMarketplace} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dishes</Link>
      </section>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link to={backToMarketplace} className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dishes</Link>
      <article className="mt-5 overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="flex min-h-64 items-center justify-center bg-orange-50 lg:min-h-[480px]">
            {dish.image ? <img src={dish.image} alt={dish.name} className="h-full max-h-[560px] w-full object-cover" /> : <UtensilsCrossed className="h-16 w-16 text-orange-300" aria-label="Dish image unavailable" />}
          </div>
          <div className="flex flex-col p-5 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700">
              <span>{dish.category?.name || dish.cuisine}</span>
              {dish.isVegetarian && <span className="rounded-full bg-green-50 px-2.5 py-1 text-green-800">Vegetarian</span>}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{dish.name}</h1>
              <FavoriteButton dishId={dish.id} showLabel className="shrink-0" />
            </div>
            {dish.ratingSummary?.count > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" />
                <span>{Number(dish.ratingSummary.average || 0).toFixed(1)}</span>
                <span className="font-normal text-gray-500">({dish.ratingSummary.count} verified review{dish.ratingSummary.count === 1 ? "" : "s"})</span>
              </div>
            )}
            <p className="mt-3 text-2xl font-bold text-gray-900">{formatPrice(dish.price)}</p>
            {dish.description && <p className="mt-5 text-sm leading-6 text-gray-600">{dish.description}</p>}
            <AddDishToCart dish={dish} />

            <section className="mt-7 border-t border-gray-100 pt-5" aria-labelledby="kitchen-heading">
              <h2 id="kitchen-heading" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Prepared by</h2>
              <div className="mt-3 flex items-center gap-3">
                {dish.cook?.profileImage ? <img src={dish.cook.profileImage} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700" aria-hidden="true"><UtensilsCrossed className="h-5 w-5" /></span>}
                <div>
                  {dish.cook?.id ? (
                    <Link to={`/cooks/${dish.cook.id}`} className="font-semibold text-gray-900 hover:text-red-700 hover:underline">
                      {dish.cook.businessName}
                    </Link>
                  ) : (
                    dish.cook?.businessName && <p className="font-semibold text-gray-900">{dish.cook.businessName}</p>
                  )}
                  {dish.cook?.specialization && <p className="mt-0.5 text-sm text-gray-600">{dish.cook.specialization}</p>}
                  {(dish.cook?.locality || dish.cook?.city) && <p className="mt-0.5 text-xs text-gray-500">{[dish.cook.locality, dish.cook.city].filter(Boolean).join(", ")}</p>}
                </div>
              </div>
              {dish.cook?.bio && <p className="mt-3 text-sm leading-6 text-gray-600">{dish.cook.bio}</p>}
              {dish.cook?.id && (
                <p className="mt-3 text-xs">
                  <Link to={`/cooks/${dish.cook.id}`} className="font-semibold text-red-700 hover:text-red-800 hover:underline">
                    View cook profile & reviews →
                  </Link>
                </p>
              )}
            </section>

            {(dish.ingredients?.length > 0 || dish.prepTimeMinutes || dish.dietaryTags?.length > 0) && (
              <section className="mt-7 border-t border-gray-100 pt-5" aria-labelledby="dish-details-heading">
                <h2 id="dish-details-heading" className="text-sm font-bold text-gray-900">Dish details</h2>
                {dish.prepTimeMinutes && <p className="mt-2 text-sm text-gray-600">Preparation time: {dish.prepTimeMinutes} minutes</p>}
                {dish.ingredients?.length > 0 && <p className="mt-2 text-sm leading-6 text-gray-600"><span className="font-semibold text-gray-800">Ingredients:</span> {dish.ingredients.join(", ")}</p>}
                {dish.dietaryTags?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{dish.dietaryTags.map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">{tag}</span>)}</div>}
              </section>
            )}
          </div>
        </div>

        {dish.story && (
          <section className="border-t border-orange-100 bg-[#FFFCF8] px-5 py-7 sm:px-8 lg:px-10" aria-labelledby="story-heading">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">A story from the kitchen</p>
            <h2 id="story-heading" className="mt-2 text-xl font-bold text-gray-900">{dish.story.whoTaught}</h2>
            {dish.story.occasion && <p className="mt-1 text-sm font-medium text-gray-600">{dish.story.occasion}</p>}
            <p className="mt-4 max-w-4xl whitespace-pre-line text-sm leading-7 text-gray-700">{dish.story.storyText}</p>
            {dish.story.culturalSignificance && <p className="mt-4 max-w-4xl text-sm leading-7 text-gray-600">{dish.story.culturalSignificance}</p>}
          </section>
        )}
      </article>
      <DishReviewList dishId={dish.id} ratingSummary={dish.ratingSummary} />
      <p className="mt-5 text-center text-xs text-gray-500">Your cart saves current items and prices. Checkout is not available yet.</p>
    </main>
  );
};

export default DishDetailPage;
