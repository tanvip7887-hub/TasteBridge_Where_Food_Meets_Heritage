const photo = (dish, image, source) => ({ dish, image, source, alt: dish });

// These presentation photos intentionally stay separate from each cook's dish image.
// The API category ID and category image remain authoritative for all other categories.
export const regionalCuisinePhotos = Object.freeze({
  andhra: photo(
    "Andhra-style chicken curry",
    "https://media-assets.swiggy.com/swiggy/image/upload/f_auto%2Cq_auto%2Cfl_lossy/u4e93kbc8bvekwrivvgb",
    "https://www.swiggy.com/restaurants/srinivasa-andhra-mess-sholinganallur-chennai-522133",
  ),
  bengali: photo(
    "Bengali mishti doi",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/Mishti_doi.jpg/960px-Mishti_doi.jpg",
    "https://commons.wikimedia.org/wiki/File:Mishti_doi.jpg",
  ),
  goan: photo(
    "Goan fish curry",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3b/Goan_Fish_Curry.jpg/960px-Goan_Fish_Curry.jpg",
    "https://commons.wikimedia.org/wiki/File:Goan_Fish_Curry.jpg",
  ),
  gujarati: photo(
    "Gujarati dhokla",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4f/Food-Dhokla.jpg/960px-Food-Dhokla.jpg",
    "https://commons.wikimedia.org/wiki/File:Food-Dhokla.jpg",
  ),
  hyderabadi: photo(
    "Hyderabadi chicken biryani",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Hyderabadi_chicken_biriyani.jpg/960px-Hyderabadi_chicken_biriyani.jpg",
    "https://commons.wikimedia.org/wiki/File:Hyderabadi_chicken_biriyani.jpg",
  ),
  kashmiri: photo(
    "Kashmiri rogan josh",
    "https://etoiledukashmir.fr/images/posts/rogan-josh.webp",
    "https://etoiledukashmir.fr/gastronomie/rogan-josh/",
  ),
  kerala: photo(
    "Kerala appam with vegetable stew",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f1/Appam_and_stew.jpg/500px-Appam_and_stew.jpg",
    "https://commons.wikimedia.org/wiki/File:Appam_and_stew.jpg",
  ),
  maharashtrian: photo(
    "Maharashtrian puran poli",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Puran-Poli.jpg/960px-Puran-Poli.jpg",
    "https://commons.wikimedia.org/wiki/File:Puran-Poli.jpg",
  ),
  "north-indian": photo(
    "North Indian chole bhature",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Spicy_Chole_Bhature.jpg/960px-Spicy_Chole_Bhature.jpg",
    "https://commons.wikimedia.org/wiki/File:Spicy_Chole_Bhature.jpg",
  ),
});

const normalizeCategory = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

export const getRegionalCuisinePhoto = (category) => {
  const keys = [normalizeCategory(category?.slug), normalizeCategory(category?.name)];
  const regionalPhoto = keys.map((key) => regionalCuisinePhotos[key]).find(Boolean);

  if (regionalPhoto) return regionalPhoto;

  return {
    dish: `${category?.name || "Regional cuisine"} dishes`,
    image: category?.image || "",
    source: "",
    alt: `${category?.name || "Regional cuisine"} dishes`,
  };
};
