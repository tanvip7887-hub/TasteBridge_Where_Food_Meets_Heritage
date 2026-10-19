const ALLOWED_SORTS = new Set(["newest", "price_asc", "price_desc"]);
export const MARKETPLACE_PAGE_SIZE = 12;

const parsePositiveInteger = (value, fallback, maximum) => {
  if (!value || !/^[1-9]\d*$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : fallback;
};

export const readMarketplaceFilters = (searchParams) => {
  const sort = searchParams.get("sort");
  return {
    search: searchParams.get("search") || "",
    categoryId: searchParams.get("categoryId") || "",
    sort: ALLOWED_SORTS.has(sort) ? sort : "newest",
    page: parsePositiveInteger(searchParams.get("page"), 1, 1_000_000),
    type: searchParams.get("type") || "",
  };
};

export const updateMarketplaceParams = (currentParams, key, value, { resetPage = false } = {}) => {
  const nextParams = new URLSearchParams(currentParams);
  if (value === "" || value === null || value === undefined) {
    nextParams.delete(key);
  } else {
    nextParams.set(key, String(value));
  }
  if (resetPage) nextParams.delete("page");
  return nextParams;
};

export const marketplaceDetailLocation = (dishId, searchParams) => {
  const query = new URLSearchParams(searchParams).toString();
  return `/dishes/${encodeURIComponent(dishId)}${query ? `?${query}` : ""}`;
};

export const marketplaceReturnLocation = (searchParams) => {
  const query = new URLSearchParams(searchParams).toString();
  return `/explore${query ? `?${query}` : ""}`;
};
