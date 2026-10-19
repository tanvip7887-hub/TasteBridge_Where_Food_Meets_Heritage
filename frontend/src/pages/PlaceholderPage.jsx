import { useSearchParams, Link, useLocation } from "react-router-dom";
import { Compass, ArrowLeft, ChefHat, ShoppingBag, UserCheck, Package, Heart, Bike } from "lucide-react";

export const PlaceholderPage = ({ title, description, iconName }) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const typeParam = searchParams.get("type");
  const cuisineParam = searchParams.get("cuisine");

  const getPageIcon = () => {
    switch (iconName || location.pathname) {
      case "/become-a-cook":
        return <ChefHat className="w-8 h-8 text-red-600" />;
      case "/become-a-delivery-agent":
        return <Bike className="w-8 h-8 text-blue-600" />;
      case "/cart":
        return <ShoppingBag className="w-8 h-8 text-amber-600" />;
      case "/profile":
        return <UserCheck className="w-8 h-8 text-emerald-600" />;
      case "/orders":
        return <Package className="w-8 h-8 text-orange-600" />;
      case "/favourites":
        return <Heart className="w-8 h-8 text-rose-600" />;
      default:
        return <Compass className="w-8 h-8 text-red-600" />;
    }
  };

  const getPageTitle = () => {
    if (title) return title;
    switch (location.pathname) {
      case "/explore":
        return "Explore TasteBridge Marketplace";
      case "/become-a-cook":
        return "Become a TasteBridge Home Chef";
      case "/become-a-delivery-agent":
        return "Become a TasteBridge Delivery Partner";
      case "/cart":
        return "Your Shopping Cart";
      case "/profile":
        return "Your Account Profile";
      case "/orders":
        return "Your Orders & Bookings";
      case "/favourites":
        return "Your Saved Favourites";
      default:
        return "TasteBridge Feature";
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto shadow-xs">
        {getPageIcon()}
      </div>

      <h1 className="text-3xl font-bold text-gray-900">
        {getPageTitle()}
      </h1>

      {(typeParam || cuisineParam) && (
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-full text-xs font-semibold text-orange-800">
          {typeParam && <span>Experience: {typeParam.toUpperCase()}</span>}
          {typeParam && cuisineParam && <span>&bull;</span>}
          {cuisineParam && <span>Cuisine: {cuisineParam}</span>}
        </div>
      )}

      <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
        {description || "This feature and marketplace module will be fully integrated in upcoming TasteBridge releases."}
      </p>

      <div className="pt-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all hover:shadow-md cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
    </div>
  );
};

export default PlaceholderPage;
