import assert from "node:assert/strict";
import test from "node:test";
import { copyBookingReference, getBookingImage, getBookingTabItems, getExperienceImage, shortenBookingReference } from "./bookingPresentation.js";

test("booking thumbnail order is Experience image, kitchen photo, then the chef-hat placeholder", () => {
  const images = getBookingImage({
    title: "Sunday feast",
    experienceImageUrl: "https://res.cloudinary.com/tastebridge/image/upload/v1/experience.jpg",
    kitchenName: "Alka's Kitchen",
    kitchenPhotoUrl: "https://res.cloudinary.com/tastebridge/image/upload/v1/kitchen.jpg",
  });
  assert.deepEqual(images, [
    { src: "https://res.cloudinary.com/tastebridge/image/upload/w_400,c_limit,f_auto,q_auto/v1/experience.jpg", alt: "Photo of Sunday feast" },
    { src: "https://res.cloudinary.com/tastebridge/image/upload/w_400,c_limit,f_auto,q_auto/v1/kitchen.jpg", alt: "Alka's Kitchen kitchen" },
    { src: null, alt: "No booking photo available", placeholder: true },
  ]);
});

test("400px Cloudinary transforms apply only to upload URLs and replace prior size transforms", () => {
  const [ordinary, existingTransform] = getBookingImage({
    experienceImageUrl: "https://images.example.org/workshop.jpg",
    kitchenPhotoUrl: "https://res.cloudinary.com/tastebridge/image/upload/w_200,c_fill/v2/kitchen.jpg",
  });
  assert.equal(ordinary.src, "https://images.example.org/workshop.jpg");
  assert.equal(existingTransform.src, "https://res.cloudinary.com/tastebridge/image/upload/w_400,c_limit,f_auto,q_auto/v2/kitchen.jpg");
});

test("thumbnail candidates safely fall back when the Experience image is absent or not public", () => {
  assert.deepEqual(getBookingImage({ title: "Dine", experienceImageUrl: "http://localhost/private.jpg", kitchenPhotoUrl: "https://images.example.org/kitchen.jpg", kitchenName: "Test" }), [
    { src: "https://images.example.org/kitchen.jpg", alt: "Test kitchen" },
    { src: null, alt: "No booking photo available", placeholder: true },
  ]);
  assert.deepEqual(getBookingImage({ title: "Dine" }).at(-1), { src: null, alt: "No booking photo available", placeholder: true });
});

test("experience card image helper requests an 800px Cloudinary image and leaves other URLs unchanged", () => {
  assert.deepEqual(getExperienceImage({
    type: "WORKSHOP", title: "Bread workshop", photos: ["https://res.cloudinary.com/tastebridge/image/upload/v3/bread.jpg"],
  }), {
    src: "https://res.cloudinary.com/tastebridge/image/upload/w_800,c_limit,f_auto,q_auto/v3/bread.jpg",
    alt: "Photo of Bread workshop",
    placeholderType: "workshop",
  });
  assert.equal(getExperienceImage({ type: "HOME_DINING", image: "https://images.example.org/table.jpg" }).src, "https://images.example.org/table.jpg");
  assert.equal(getExperienceImage({ type: "HOME_DINING", image: "https://res.cloudinary.com/tastebridge/image/upload/w_300,c_fill/v1/table.jpg" }).src,
    "https://res.cloudinary.com/tastebridge/image/upload/w_800,c_limit,f_auto,q_auto/v1/table.jpg");
});

test("dining cards prefer a menu dish image matching the experience cuisine", () => {
  const image = getExperienceImage({
    type: "HOME_DINING",
    title: "Regional thali",
    cuisine: "Rajasthan",
    photos: ["https://images.example.org/cook.jpg"],
    menuItems: [
      { dish: { name: "Rajasthani Thali", cuisine: "Rajasthani", image: "https://images.example.org/thali.jpg" } },
      { dish: { name: "Idli", cuisine: "South Indian", image: "https://images.example.org/idli.jpg" } },
    ],
  });
  assert.equal(image.src, "https://images.example.org/thali.jpg");
  assert.equal(image.alt, "Photo of Rajasthani Thali");
});

test("dining cards use the existing regional category image selected as the experience theme", () => {
  const image = getExperienceImage({
    type: "HOME_DINING",
    title: "Rajasthani feast",
    theme: "Rajasthani",
    cuisine: "North Indian",
    photos: ["https://images.example.org/cook.jpg"],
  }, 800, [{ id: "region-1", name: "Rajasthani", slug: "rajasthani", image: "https://images.example.org/rajasthani-thali.jpg", isActive: true }]);
  assert.equal(image.src, "https://images.example.org/rajasthani-thali.jpg");
  assert.equal(image.alt, "Rajasthani dishes");
});

test("a linked menu dish matching the selected regional theme remains the first image choice", () => {
  const image = getExperienceImage({
    type: "HOME_DINING",
    theme: "Rajasthani",
    cuisine: "Indian",
    photos: ["https://images.example.org/category.jpg"],
    menuItems: [{ dish: { name: "Rajasthani thali", cuisine: "Rajasthani", image: "https://images.example.org/thali.jpg" } }],
  }, 800, [{ name: "Rajasthani", image: "https://images.example.org/category.jpg" }]);
  assert.equal(image.src, "https://images.example.org/thali.jpg");
  assert.equal(image.alt, "Photo of Rajasthani thali");
});

test("dining image falls back to the experience photo when no matching public dish image exists", () => {
  const image = getExperienceImage({
    type: "HOME_DINING",
    cuisine: "Rajasthan",
    photos: ["https://images.example.org/cook.jpg"],
    menuItems: [{ dish: { cuisine: "South Indian", image: "https://images.example.org/idli.jpg" } }],
  });
  assert.equal(image.src, "https://images.example.org/cook.jpg");
});

test("booking references are shortened for display while clipboard receives the complete value", async () => {
  const reference = "cmvdp7gor00023ctmrc843i40";
  assert.equal(shortenBookingReference(reference), "cmvdp7…3i40");
  let copied;
  await copyBookingReference(reference, { writeText: async (value) => { copied = value; } });
  assert.equal(copied, reference);
});

test("Dine tab selection returns only the selected existing booking group", () => {
  const groups = { upcoming: [{ id: "upcoming-1" }], past: [{ id: "past-1" }], cancelled: [] };
  assert.deepEqual(getBookingTabItems(groups, "upcoming"), [{ id: "upcoming-1" }]);
  assert.deepEqual(getBookingTabItems(groups, "past"), [{ id: "past-1" }]);
  assert.deepEqual(getBookingTabItems(groups, "cancelled"), []);
});
