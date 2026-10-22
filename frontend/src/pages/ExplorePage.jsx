import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, LoaderCircle, Search, Star, UtensilsCrossed } from "lucide-react";
import api from "../api/axios.js";
import {
  MARKETPLACE_PAGE_SIZE,
  marketplaceDetailLocation,
  readMarketplaceFilters,
  updateMarketplaceParams,
} from "../utils/marketplaceUrl.js";
import { marketplaceListingView, readMarketplaceListing } from "../utils/marketplaceResponse.js";
import { findFoodCategoryById, foodCategoryCuisineName } from "../utils/foodCategoryDiscovery.js";
import FavoriteButton from "../components/favorites/FavoriteButton.jsx";
import DineExperienceDiscovery from "../components/events/DineExperienceDiscovery.jsx";

const formatPrice = (price) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);

const DishImage = ({ src, name, className }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-orange-50 text-orange-300`} aria-label={`${name} image unavailable`}>
        <UtensilsCrossed className="h-10 w-10" aria-hidden="true" />
      </div>
    );
  }
  return <img src={src} alt={name} className={className} loading="lazy" onError={() => setFailed(true)} />;
};

export const ExplorePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();
  const filters = useMemo(() => readMarketplaceFilters(new URLSearchParams(queryString)), [queryString]);
  const [searchDraftState, setSearchDraftState] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState("");
  const [categoriesRetry, setCategoriesRetry] = useState(0);
  const [listingState, setListingState] = useState({ identity: null, items: [], pagination: null, error: "" });
  const [retryKey, setRetryKey] = useState(0);
  const isMarketplace = !filters.type || filters.type === "order";
  const searchDraft = searchDraftState?.sourceSearch === filters.search
    ? searchDraftState.value
    : filters.search;
  const requestIdentity = `${queryString}:${retryKey}`;
  const isDineDiscovery = filters.type === "dining" || filters.type === "workshop";
  const selectedCategory = findFoodCategoryById(categories, filters.categoryId);
  const selectedCuisine = foodCategoryCuisineName(selectedCategory);
  const requestPending = listingState.identity !== requestIdentity;
  const items = requestPending ? [] : listingState.items;
  const pagination = requestPending || !listingState.pagination
    ? { page: filters.page, limit: MARKETPLACE_PAGE_SIZE, total: 0, totalPages: 0 }
    : listingState.pagination;
  const error = requestPending ? "" : listingState.error;
  const listingView = marketplaceListingView({ pending: requestPending, error, items });

  useEffect(() => {
    let active = true;
    api.get("/categories")
      .then((response) => {
        if (active) setCategories(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((requestError) => {
        if (active) setCategoryError(requestError?.message || "Categories could not be loaded.");
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => { active = false; };
  }, [categoriesRetry]);

  const retryCategories = () => {
    setCategoriesLoading(true);
    setCategoryError("");
    setCategoriesRetry((value) => value + 1);
  };

  useEffect(() => {
    if (!isMarketplace) return undefined;
    const controller = new AbortController();
    const params = {
      sort: filters.sort,
      page: filters.page,
      limit: MARKETPLACE_PAGE_SIZE,
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    };
    api.get("/dishes", { params, signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          const result = readMarketplaceListing(response);
          setListingState({ identity: requestIdentity, items: result.items, pagination: result.pagination, error: "" });
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setListingState({
            identity: requestIdentity,
            items: [],
            pagination: null,
            error: requestError?.message || "Dishes could not be loaded. Please try again.",
          });
        }
      });
    return () => controller.abort();
  }, [filters.categoryId, filters.page, filters.search, filters.sort, isMarketplace, requestIdentity]);

  const changeParam = useCallback((key, value, resetPage = true) => {
    setSearchParams((current) => updateMarketplaceParams(current, key, value, { resetPage }));
  }, [setSearchParams]);

  const submitSearch = (event) => {
    event.preventDefault();
    setSearchDraftState(null);
    changeParam("search", searchDraft.trim());
  };

  const updateSearchDraft = (value) => setSearchDraftState({ sourceSearch: filters.search, value });

  if (isDineDiscovery) return (
    <DineExperienceDiscovery
      discoveryType={filters.type}
      categoryId={filters.categoryId}
      categoryName={selectedCuisine}
      regionalCategories={categories}
      categoriesPending={categoriesLoading && Boolean(filters.categoryId)}
      categoriesError={Boolean(categoryError && filters.categoryId)}
      onRetryCategories={retryCategories}
    />
  );
  if (!isMarketplace) {
    const title = filters.type === "dining" ? "Dining experiences" : "Cooking workshops";
    return <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-24" aria-labelledby="discovery-unavailable-title"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><UtensilsCrossed aria-hidden="true" /></div><h1 id="discovery-unavailable-title" className="mt-5 text-2xl font-bold text-gray-900">{title}</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-600">This discovery experience is not available yet. You can browse eligible home-cooked dishes in the marketplace.</p><Link to="/explore" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700">Browse dishes <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></section>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-7 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Home</Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{selectedCategory ? `${selectedCategory.name} dishes` : "Home-cooked dishes"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{selectedCategory ? `Showing available dishes in ${selectedCategory.name}.` : "Discover available dishes from approved home kitchens."}</p>
        </div>
      </header>

      <section className="mb-7 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm sm:p-5" aria-label="Dish filters">
        <form onSubmit={submitSearch} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_minmax(160px,0.55fr)_auto]">
          <label className="sr-only" htmlFor="dish-search">Search dishes</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input id="dish-search" type="search" maxLength={100} value={searchDraft} onChange={(event) => updateSearchDraft(event.target.value)} placeholder="Search dishes, cuisine, or cook" className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
          </div>
          <label className="sr-only" htmlFor="dish-category">Filter by category</label>
          <select id="dish-category" value={filters.categoryId} onChange={(event) => changeParam("categoryId", event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100">
            <option value="">All categories</option>
            {filters.categoryId && !categories.some((category) => category.id === filters.categoryId) && <option value={filters.categoryId}>Selected category unavailable</option>}
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="dish-sort">Sort dishes</label>
          <select id="dish-sort" value={filters.sort} onChange={(event) => changeParam("sort", event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100">
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"><Search className="h-4 w-4" aria-hidden="true" /> Search</button>
        </form>
        {categoryError && <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-amber-800" role="status">{categoryError} You can still browse all dishes.<button type="button" onClick={retryCategories} className="font-semibold underline underline-offset-2">Retry categories</button></p>}
        {filters.categoryId && <button type="button" onClick={() => changeParam("categoryId", "")} className="mt-3 text-sm font-semibold text-red-700 hover:text-red-800">Clear cuisine filter</button>}
      </section>

      {listingView === "loading" ? (
        <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-gray-600" role="status"><LoaderCircle className="h-5 w-5 animate-spin text-red-600" aria-hidden="true" /> Loading available dishes…</div>
      ) : listingView === "error" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-8 text-center" role="alert">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <p className="mt-3 font-semibold text-red-900">Marketplace unavailable</p>
          <p className="mt-1 text-sm text-red-800">{error}</p>
          <button type="button" onClick={() => setRetryKey((key) => key + 1)} className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100">Try again</button>
        </div>
      ) : listingView === "empty" ? (
        <div className="rounded-2xl border border-orange-100 bg-white px-5 py-14 text-center">
          <UtensilsCrossed className="mx-auto h-9 w-9 text-orange-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">{pagination.total > 0 ? "No dishes on this page" : "No dishes found"}</h2>
          <p className="mt-2 text-sm text-gray-600">{pagination.total > 0 ? "Return to an earlier results page." : "Try another search or category. Eligible dishes will appear here when available."}</p>
          {(filters.search || filters.categoryId) && <button type="button" onClick={() => setSearchParams((current) => {
            const next = new URLSearchParams(current);
            next.delete("search");
            next.delete("categoryId");
            next.delete("page");
            return next;
          })} className="mt-4 text-sm font-semibold text-red-700 hover:text-red-800">Clear filters</button>}
          {pagination.total > 0 && <button type="button" onClick={() => changeParam("page", pagination.totalPages, false)} className="mt-4 block w-full text-sm font-semibold text-red-700 hover:text-red-800">Go to the last results page</button>}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600" aria-live="polite">
            <span>{pagination.total} {pagination.total === 1 ? "dish" : "dishes"} available</span>
            <span>Page {pagination.page} of {pagination.totalPages}</span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((dish) => (
              <article key={dish.id} className="group relative overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <FavoriteButton dishId={dish.id} className="absolute right-3 top-3 z-10" />
                <Link to={marketplaceDetailLocation(dish.id, searchParams)} className="block focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-500">
                <DishImage src={dish.image} name={dish.name} className="h-48 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-gray-900 group-hover:text-red-700">{dish.name}</h2>
                      <p className="mt-1 truncate text-xs text-gray-500">{dish.category?.name || dish.cuisine}</p>
                      {dish.ratingSummary?.count >= 3 && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-700"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" />{Number(dish.ratingSummary.average || 0).toFixed(1)} · {dish.ratingSummary.count}</p>}
                    </div>
                    <span className="shrink-0 font-bold text-gray-900">{formatPrice(dish.price)}</span>
                  </div>
                  {dish.description && <p className="line-clamp-2 text-sm leading-5 text-gray-600">{dish.description}</p>}
                  <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                    {dish.cook?.profileImage ? <img src={dish.cook.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-orange-700" aria-hidden="true"><UtensilsCrossed className="h-4 w-4" /></span>}
                    {dish.cook?.businessName && <span className="truncate text-xs font-medium text-gray-700">{dish.cook.businessName}</span>}
                    {dish.isVegetarian && <span className="ml-auto rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold text-green-800">Vegetarian</span>}
                  </div>
                </div>
                </Link>
              </article>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Dish result pages">
              <button type="button" onClick={() => changeParam("page", Math.max(1, filters.page - 1), false)} disabled={filters.page <= 1} className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
              <span className="text-sm text-gray-600" aria-live="polite">{filters.page} / {pagination.totalPages}</span>
              <button type="button" onClick={() => changeParam("page", Math.min(pagination.totalPages, filters.page + 1), false)} disabled={filters.page >= pagination.totalPages} className="inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default ExplorePage;
