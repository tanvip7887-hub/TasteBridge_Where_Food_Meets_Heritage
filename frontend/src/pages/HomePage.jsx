import { useRef, useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import heroImage from "../assets/user_homepage.png";
import { foodCategoryExploreHref } from "../utils/foodCategoryDiscovery.js";
import { getRegionalCuisinePhoto } from "../utils/regionalCuisineImages.js";
import {
  Sparkles,
  UtensilsCrossed,
  Users,
  ChefHat,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Award,
  Play,
} from "lucide-react";

export const HomePage = () => {
  // Real Categories State from Backend API
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoryRetry, setCategoryRetry] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true);
        setCategoriesError("");
        const res = await api.get("/categories");
        if (isMounted) {
          setCategories(Array.isArray(res.data) ? res.data : []);
        }
      } catch {
        if (isMounted) {
          setCategories([]);
          setCategoriesError("Regional categories could not be loaded. Please try again later.");
        }
      } finally {
        if (isMounted) {
          setLoadingCategories(false);
        }
      }
    };

    fetchCategories();
    return () => {
      isMounted = false;
    };
  }, [categoryRetry]);

  // Carousel Scroll State
  const rowRefs = useRef([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollLimits = useCallback(() => {
    const row = rowRefs.current[0];
    if (row) {
      const { scrollLeft, scrollWidth, clientWidth } = row;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  }, []);

  useEffect(() => {
    const rows = rowRefs.current.filter(Boolean);
    checkScrollLimits();
    rows.forEach((row) => row.addEventListener("scroll", checkScrollLimits));
    window.addEventListener("resize", checkScrollLimits);
    return () => {
      rows.forEach((row) => row.removeEventListener("scroll", checkScrollLimits));
      window.removeEventListener("resize", checkScrollLimits);
    };
  }, [categories, checkScrollLimits, loadingCategories]);

  const handleScroll = (direction) => {
    const scrollAmount = direction === "left" ? -320 : 320;
    rowRefs.current.filter(Boolean).forEach((row) => {
      row.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    });
  };

  return (
    <div className="w-full space-y-12 pb-8">
      {/* Full-bleed homepage hero, below the 72px authenticated navbar. */}
      <section className="relative isolate flex min-h-[calc(100svh-4.5rem)] w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
        <img
          src={heroImage}
          alt="A home-cooked meal shared around a table"
          className="absolute inset-0 z-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/55 via-black/45 to-black/65" />

        <div className="relative z-20 mx-auto w-full max-w-5xl space-y-5 text-center sm:space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-100/40 bg-red-600/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Welcome to TasteBridge
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md sm:text-6xl md:text-7xl">
            Every dish has a story.
          </h1>
          <p className="mx-auto max-w-2xl text-base font-normal leading-relaxed text-gray-100 drop-shadow-sm sm:text-xl">
            Order authentic home-cooked food, dine with local families, and discover recipes passed down through generations.
          </p>

          <div className="grid grid-cols-1 gap-3 pt-2 text-left sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {[
              { title: "Order", description: "Home-cooked food delivered to your door", icon: UtensilsCrossed, to: "/explore" },
              { title: "Dine", description: "Eat at a local family's home", icon: Users, to: "/explore?type=dining" },
              { title: "Learn", description: "Join a cooking workshop with a home cook.", icon: ChefHat, to: "/explore?type=workshop" },
              { title: "Stories", description: "Photos, cooking videos and recipes from home cooks.", icon: Play, to: "/stories" },
            ].map(({ title, description, icon: Icon, to }) => (
              to ? <Link
                key={title}
                to={to}
                className="group flex min-h-[88px] items-center gap-4 rounded-2xl border border-white/50 bg-[#FFF8F0]/95 p-4 shadow-lg backdrop-blur-sm transition duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-xl sm:min-h-[112px] sm:p-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-gray-900 sm:text-lg">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-600 sm:text-sm">{description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-red-600 transition-transform group-hover:translate-x-1" />
              </Link> : <div
                key={title}
                className="flex min-h-[88px] items-center gap-4 rounded-2xl border border-white/50 bg-[#FFF8F0]/95 p-4 shadow-lg backdrop-blur-sm sm:min-h-[112px] sm:p-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-600 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-gray-900 sm:text-lg">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-gray-600 sm:text-sm">{description}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-red-600" />
              </div>
            ))}
          </div>

        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8">
      {/* 3. FOOD DISCOVERY SECTION ("EXPLORE FLAVOURS") */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">
              Explore Flavours
            </h2>
            <p className="text-sm text-gray-600">
              Discover regional dishes and food traditions from across India.
            </p>
          </div>

          {/* Carousel Scroll Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleScroll("left")}
              disabled={!canScrollLeft}
              aria-label="Scroll left"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                canScrollLeft
                  ? "border-gray-300 bg-white text-gray-700 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-xs"
                  : "border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleScroll("right")}
              disabled={!canScrollRight}
              aria-label="Scroll right"
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                canScrollRight
                  ? "border-gray-300 bg-white text-gray-700 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-xs"
                  : "border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Single swipeable category row */}
        {loadingCategories ? (
          <div className="flex items-center gap-5 overflow-x-auto scrollbar-none py-2 px-1">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex w-28 shrink-0 flex-col items-center sm:w-32 animate-pulse">
                <div className="h-28 w-28 rounded-full bg-gray-200 sm:h-32 sm:w-32" />
                <div className="mt-3 h-3 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : categoriesError ? (
          <div role="alert" className="py-8 text-center text-sm text-red-700">
            {categoriesError}
            <button type="button" onClick={() => setCategoryRetry((value) => value + 1)} className="ml-2 font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            No regional food categories currently available.
          </div>
        ) : (
          <div
            ref={(element) => { rowRefs.current[0] = element; }}
            className="flex items-center gap-5 overflow-x-auto overscroll-x-contain scrollbar-none snap-x snap-mandatory py-2 px-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", scrollBehavior: "smooth", touchAction: "pan-x" }}
          >
            {categories.map((item) => {
              const cuisinePhoto = getRegionalCuisinePhoto(item);
              return (
                <Link
                  key={item.id}
                  to={foodCategoryExploreHref(item)}
                  className="group flex w-28 shrink-0 snap-start cursor-pointer flex-col items-center sm:w-32"
                >
                  <div className="relative h-28 w-28 overflow-hidden rounded-full border-2 border-transparent bg-white p-1 shadow-xs transition-all group-hover:border-red-400 sm:h-32 sm:w-32">
                    {cuisinePhoto.image ? (
                      <img
                        src={cuisinePhoto.image}
                        alt={cuisinePhoto.alt}
                        loading="lazy"
                        className="h-full w-full rounded-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.hidden = true;
                          e.currentTarget.nextElementSibling?.classList.remove("hidden");
                          checkScrollLimits();
                        }}
                        onLoad={checkScrollLimits}
                      />
                    ) : null}
                    <span
                      className={`${cuisinePhoto.image ? "hidden " : ""}absolute inset-1 flex items-center justify-center rounded-full bg-orange-50 text-orange-600`}
                      role="img"
                      aria-label={`${cuisinePhoto.dish} photo unavailable`}
                    >
                      <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
                    </span>
                  </div>
                  <span className="mt-3 text-center text-xs font-semibold text-gray-900 transition-colors group-hover:text-red-600 sm:text-sm">
                    {item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. CULTURE / HERITAGE SECTION ("MORE THAN JUST A MEAL") */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-100 shadow-xs space-y-6">
        <div className="max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold">
            <Award className="w-3.5 h-3.5 text-amber-700" /> TasteBridge Promise
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            More Than Just a Meal
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed font-normal">
            TasteBridge is a culture-first marketplace. Beyond food delivery, we preserve ancestral recipes, honor family kitchens, and share the origin stories behind every regional dish.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-orange-100/80 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-gray-900">Ancestral Recipes</h3>
            <p className="text-xs text-gray-600 leading-relaxed font-normal">
              Crafted by home chefs using hand-ground spices and traditional cooking methods.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-orange-100/80 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-gray-900">Cultural Storytelling</h3>
            <p className="text-xs text-gray-600 leading-relaxed font-normal">
              Learn the history, festive significance, and secret ingredients behind every meal.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-orange-100/80 space-y-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-gray-900">Community Connections</h3>
            <p className="text-xs text-gray-600 leading-relaxed font-normal">
              Supporting local families while bringing people together over authentic food.
            </p>
          </div>
        </div>
      </section>

    </div>
    </div>
  );
};

export default HomePage;
