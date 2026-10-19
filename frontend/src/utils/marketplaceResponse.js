export const readMarketplaceListing = (response) => {
  const result = response?.data;
  if (!Array.isArray(result?.items) || !result?.pagination) {
    throw new Error("The marketplace returned an unexpected response.");
  }
  return { items: result.items, pagination: result.pagination };
};

export const marketplaceListingView = ({ pending, error, items }) => {
  if (pending) return "loading";
  if (error) return "error";
  if (items.length === 0) return "empty";
  return "results";
};
