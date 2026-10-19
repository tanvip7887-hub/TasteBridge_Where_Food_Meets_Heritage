import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Heart, LoaderCircle } from "lucide-react";
import { addFavorite, removeFavorite } from "../../store/slices/favoritesSlice.js";
import { OPEN_AUTH_MODAL_EVENT } from "../../utils/authModalEvents.js";

export const FavoriteButton = ({ dishId, className = "", showLabel = false }) => {
  const dispatch = useDispatch();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const { ids, pendingDishIds, status, currentCustomerId } = useSelector((state) => state.favorites);
  const [feedback, setFeedback] = useState("");
  const isFavorite = ids.includes(dishId);
  const busy = pendingDishIds.includes(dishId);
  const waitingForFavorites = isAuthenticated && user?.activePortal === "CUSTOMER"
    && (status === "loading" || currentCustomerId !== user?.id);

  const toggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      window.dispatchEvent(new Event(OPEN_AUTH_MODAL_EVENT));
      return;
    }
    if (user?.activePortal !== "CUSTOMER" || busy || waitingForFavorites) return;
    setFeedback("");
    const favoriteAction = isFavorite
      ? removeFavorite({ dishId, customerId: user.id })
      : addFavorite({ dishId, customerId: user.id });
    dispatch(favoriteAction)
      .unwrap()
      .then(() => setFeedback(isFavorite ? "Removed from favorites." : "Added to favorites."))
      .catch((error) => setFeedback(error?.message || "This dish could not be saved. Please try again."));
  };

  return (
    <>
    <button
      type="button"
      onClick={toggle}
      disabled={busy || waitingForFavorites || (isAuthenticated && user?.activePortal !== "CUSTOMER")}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
      aria-busy={busy || waitingForFavorites}
      title={!isAuthenticated ? "Sign in to save this dish" : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-orange-100 bg-white/95 text-gray-600 shadow-sm transition hover:border-rose-200 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-60 ${showLabel ? "px-4 py-2 text-sm font-semibold" : "h-10 w-10"} ${className}`}
    >
      {busy || waitingForFavorites ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Heart className={`h-5 w-5 ${isFavorite ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden="true" />}
      {showLabel && (isFavorite ? "Saved" : "Save to favorites")}
    </button>
    {feedback && <span className="sr-only" role={feedback.includes("could not") ? "alert" : "status"}>{feedback}</span>}
    </>
  );
};

export default FavoriteButton;
