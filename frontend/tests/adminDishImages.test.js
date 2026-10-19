import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = () => readFile(new URL("../src/pages/admin/AdminDishes.jsx", import.meta.url), "utf8");

test("Admin dish cards show the uploaded photo for every status and fall back when unavailable", async () => {
  const source = await readSource();
  const cardLoop = source.slice(source.indexOf("{dishes.map((dish) => ("));
  const imageComponent = source.slice(source.indexOf("const DishCardImage"), source.indexOf("export const AdminDishes"));

  assert.match(cardLoop, /<DishCardImage key=\{`\$\{dish\.id\}:\$\{dish\.image \|\| "no-image"\}`\} dish=\{dish\} \/>/);
  assert.match(imageComponent, /src=\{dish\.image\}/);
  assert.match(imageComponent, /alt=\{dish\.name \? `\$\{dish\.name\} dish` : "Dish"\}/);
  assert.match(imageComponent, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(imageComponent, /No photo available/);
  assert.doesNotMatch(cardLoop, /dish\.status === "PENDING_APPROVAL"\s*&&\s*\(\s*<details[\s\S]*?<img/);
});
