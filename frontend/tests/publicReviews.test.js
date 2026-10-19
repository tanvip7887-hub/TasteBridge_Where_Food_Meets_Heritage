import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("DishDetailPage displays rating summary, links cook attribution to public cook profile, and embeds DishReviewList", async () => {
  const detailPageCode = await read("../src/pages/DishDetailPage.jsx");

  // Rating summary snippet under title
  assert.match(detailPageCode, /dish\.ratingSummary\?\.count\s*>\s*0/);
  assert.match(detailPageCode, /Number\(dish\.ratingSummary\.average\s*\|\|\s*0\)\.toFixed\(1\)/);
  assert.match(detailPageCode, /verified review/);

  // Link cook to public cook profile
  assert.match(detailPageCode, /to=\{`\/cooks\/\$\{dish\.cook\.id\}`\}/);
  assert.match(detailPageCode, /View cook profile & reviews/);

  // Embeds DishReviewList
  assert.match(detailPageCode, /<DishReviewList\s+dishId=\{dish\.id\}\s+ratingSummary=\{dish\.ratingSummary\}\s*\/>/);
});

test("DishReviewList renders published review rating, comment, date, verified indicator, and cook reply with date", async () => {
  const listCode = await read("../src/components/reviews/DishReviewList.jsx");

  // API call
  assert.match(listCode, /reviewsApi\.forDish\(dishId/);

  // Rating and star
  assert.match(listCode, /review\.rating\}\/5/);
  assert.match(listCode, /fill-amber-400/);

  // Masked customer name (privacy safe)
  assert.match(listCode, /review\.customerName/);

  // Verified badge indicator
  assert.match(listCode, /review\.verified === "VERIFIED_ORDER"/);
  assert.match(listCode, /Verified order/);
  assert.match(listCode, /Attended event/);

  // Comment
  assert.match(listCode, /review\.comment/);

  // Cook reply and cook reply timestamp
  assert.match(listCode, /review\.cookReply/);
  assert.match(listCode, /Reply from \{review\.cookName\}/);
  assert.match(listCode, /review\.cookRepliedAt/);

  // Authoritative rating summary
  assert.match(listCode, /payload\?\.ratingSummary/);
});

test("PublicCookProfilePage renders cook details, verification badge, rating summary, dishes, and customer reviews with pagination", async () => {
  const profilePageCode = await read("../src/pages/PublicCookProfilePage.jsx");

  // API calls
  assert.match(profilePageCode, /cookApi\s*\.\s*getPublicProfile\(id\)/);
  assert.match(profilePageCode, /reviewsApi\s*\.\s*forCook\(id/);

  // Cook profile information
  assert.match(profilePageCode, /cook\.businessName/);
  assert.match(profilePageCode, /Approved Home Kitchen/);
  assert.match(profilePageCode, /cook\.specialization/);
  assert.match(profilePageCode, /cook\.bio/);
  assert.match(profilePageCode, /cook\.cuisines/);

  // Rating summary
  assert.match(profilePageCode, /ratingSummary\?\.count\s*>\s*0/);
  assert.match(profilePageCode, /verified review/);

  // Dishes section & threshold rule (>= 3)
  assert.match(profilePageCode, /cook\.dishes/);
  assert.match(profilePageCode, /dish\.ratingSummary\?\.count\s*>=\s*3/);
  assert.match(profilePageCode, /to=\{`\/dishes\/\$\{dish\.id\}`\}/);

  // Reviews display
  assert.match(profilePageCode, /review\.customerName/);
  assert.match(profilePageCode, /review\.verified === "VERIFIED_ORDER"/);
  assert.match(profilePageCode, /review\.rating\}\/5/);
  assert.match(profilePageCode, /review\.comment/);
  assert.match(profilePageCode, /review\.cookReply/);
  assert.match(profilePageCode, /review\.cookRepliedAt/);

  // Pagination
  assert.match(profilePageCode, /pagination\.totalPages\s*>\s*1/);
  assert.match(profilePageCode, /Previous/);
  assert.match(profilePageCode, /Next/);
});

test("ExplorePage respects the review threshold and displays ratings only when count >= 3", async () => {
  const explorePageCode = await read("../src/pages/ExplorePage.jsx");

  // Threshold rule: only count >= 3
  assert.match(explorePageCode, /dish\.ratingSummary\?\.count\s*>=\s*3/);
  assert.match(explorePageCode, /Number\(dish\.ratingSummary\.average\s*\|\|\s*0\)\.toFixed\(1\)/);
});

test("cookApi exposes getPublicProfile endpoint", async () => {
  const apiCode = await read("../src/api/cookApi.js");

  assert.match(apiCode, /getPublicProfile:\s*\(id\)\s*=>\s*api\.get\(`/);
  assert.match(apiCode, /\/cooks\/\$\{encodeURIComponent\(id\)\}/);
});

test("AppRoutes registers public cook profile route under storefront layout", async () => {
  const routesCode = await read("../src/routes/AppRoutes.jsx");

  assert.match(routesCode, /import PublicCookProfilePage from "\.\.\/pages\/PublicCookProfilePage\.jsx"/);
  assert.match(routesCode, /<Route path="cooks\/:id" element={<PublicCookProfilePage \/>\} \/>/);
});
