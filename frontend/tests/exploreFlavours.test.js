import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  findFoodCategoryById,
  foodCategoryCuisineName,
  foodCategoryExploreHref,
} from "../src/utils/foodCategoryDiscovery.js";
import { getRegionalCuisinePhoto, regionalCuisinePhotos } from "../src/utils/regionalCuisineImages.js";
import { updateMarketplaceParams } from "../src/utils/marketplaceUrl.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("regional flavour cards link using the authoritative active category ID", async () => {
  const categories = [
    { id: "clx-maharashtrian-01", name: "Maharashtrian", slug: "maharashtrian", isActive: true },
    { id: "clx-bengali-02", name: "Bengali", slug: "bengali", isActive: true },
    { id: "clx-goan-03", name: "Goan", slug: "goan", isActive: true },
    { id: "clx-andhra-04", name: "Andhra", slug: "andhra", isActive: true },
  ];
  for (const category of categories) {
    assert.equal(findFoodCategoryById(categories, category.id), category);
    assert.equal(new URL(foodCategoryExploreHref(category), "https://tastebridge.example").searchParams.get("categoryId"), category.id);
  }
  assert.equal(findFoodCategoryById(categories, "maharashtrian"), null);
  assert.equal(foodCategoryExploreHref({ name: "Maharashtrian" }), "/explore");
});

test("category selection and clearing preserve unrelated URL filters", () => {
  const initial = new URLSearchParams("type=order&search=dal&sort=price_desc&page=3");
  const selected = updateMarketplaceParams(initial, "categoryId", "clx-maharashtrian-01", { resetPage: true });
  assert.equal(selected.get("categoryId"), "clx-maharashtrian-01");
  assert.equal(selected.get("search"), "dal");
  assert.equal(selected.get("sort"), "price_desc");
  assert.equal(selected.get("type"), "order");
  assert.equal(selected.get("page"), null);

  const cleared = updateMarketplaceParams(selected, "categoryId", "", { resetPage: true });
  assert.equal(cleared.has("categoryId"), false);
  assert.equal(cleared.get("search"), "dal");
  assert.equal(cleared.get("sort"), "price_desc");
  assert.equal(cleared.get("type"), "order");
});

test("Dine category selection resolves the live category name and filters through cuisine", async () => {
  const categories = [{ id: "database-id-1", name: "Maharashtrian", isActive: true }];
  const category = findFoodCategoryById(categories, "database-id-1");
  assert.equal(foodCategoryCuisineName(category), "Maharashtrian");
  const [explore, discovery] = await Promise.all([
    read("../src/pages/ExplorePage.jsx"),
    read("../src/components/events/DineExperienceDiscovery.jsx"),
  ]);
  assert.match(explore, /categoryName=\{selectedCuisine\}/);
  assert.match(explore, /categoriesPending=\{categoriesLoading && Boolean\(filters\.categoryId\)\}/);
  assert.match(explore, /onRetryCategories=\{retryCategories\}/);
  assert.match(discovery, /\.\.\.\(categoryName \? \{ cuisine: categoryName \} : \{\}\)/);
  assert.match(discovery, /controller\.abort\(\)/);
  assert.match(discovery, /Clear cuisine filter/);
  assert.match(discovery, /onClick=\{onRetryCategories\}/);
});

test("homepage uses API categories, accessible links, and a retry state", async () => {
  const homepage = await read("../src/pages/HomePage.jsx");
  assert.match(homepage, /api\.get\("\/categories"\)/);
  assert.match(homepage, /to=\{foodCategoryExploreHref\(item\)\}/);
  assert.match(homepage, /src=\{cuisinePhoto\.image\}/);
  assert.match(homepage, /alt=\{cuisinePhoto\.alt\}/);
  assert.match(homepage, /e\.currentTarget\.nextElementSibling\?\.classList\.remove\("hidden"\)/);
  assert.match(homepage, /Try again/);
  assert.match(homepage, /<Link[\s\S]*?foodCategoryExploreHref/);
});

test("customer panel keeps its three working cards and navigates its Stories card to the public feed", async () => {
  const homepage = await read("../src/pages/HomePage.jsx");
  assert.match(homepage, /title: "Order"[\s\S]*?to: "\/explore"/);
  assert.match(homepage, /title: "Dine"[\s\S]*?to: "\/explore\?type=dining"/);
  assert.match(homepage, /title: "Learn", description: "Join a cooking workshop with a home cook\.", icon: ChefHat, to: "\/explore\?type=workshop"/);
  assert.match(homepage, /title: "Stories", description: "Photos, cooking videos and recipes from home cooks\.", icon: Play, to: "\/stories" \}/);
  assert.match(homepage, /sm:grid-cols-2 sm:gap-4 xl:grid-cols-4/);
  assert.match(homepage, /title: "Stories"[^\n]*to: "\/stories"/);
  assert.match(homepage, /title: "Stories"[\s\S]*?<ArrowRight className="h-4 w-4 shrink-0 text-red-600" \/>/);
  assert.match(homepage, /import[\s\S]*\bPlay\b[\s\S]*from "lucide-react"/);
});

test("regional cards use distinct iconic dish photos while retaining API category identity", () => {
  const expected = {
    Andhra: "Andhra-style chicken curry",
    Bengali: "Bengali mishti doi",
    Goan: "Goan fish curry",
    Gujarati: "Gujarati thali",
    Hyderabadi: "Hyderabadi chicken biryani",
    Kashmiri: "Kashmiri rogan josh",
    Kerala: "Kerala appam with vegetable stew",
    Maharashtrian: "Maharashtrian puran poli",
    "North Indian": "North Indian chole bhature",
  };
  const images = new Set();

  for (const [name, dish] of Object.entries(expected)) {
    const resolved = getRegionalCuisinePhoto({ id: `live-${name}`, name, slug: name.toLowerCase().replaceAll(" ", "-") });
    assert.equal(resolved.dish, dish);
    assert.equal(resolved.alt, dish);
    assert.match(resolved.image, /^https:\/\//);
    assert.match(resolved.source, /^https:\/\//);
    images.add(resolved.image);
  }

  assert.equal(Object.keys(regionalCuisinePhotos).length, 9);
  assert.equal(images.size, 9, "each regional cuisine must use a distinct image");
  assert.equal(getRegionalCuisinePhoto({ slug: "new-region", name: "New Region", image: "https://example.test/category.jpg" }).image, "https://example.test/category.jpg");
  assert.equal(foodCategoryExploreHref({ id: "database-category-id", name: "Andhra" }), "/explore?categoryId=database-category-id");
});
