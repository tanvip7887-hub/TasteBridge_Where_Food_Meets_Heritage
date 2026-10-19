export const findFoodCategoryById = (categories, categoryId) => {
  if (!categoryId || !Array.isArray(categories)) return null;
  return categories.find((category) =>
    String(category?.id) === String(categoryId) && category?.isActive !== false
  ) || null;
};

export const foodCategoryExploreHref = (category) => {
  if (!category?.id) return "/explore";
  const params = new URLSearchParams({ categoryId: String(category.id) });
  return `/explore?${params.toString()}`;
};

export const foodCategoryCuisineName = (category) =>
  typeof category?.name === "string" ? category.name.trim() : "";
