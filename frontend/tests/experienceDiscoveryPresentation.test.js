import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("experience discovery keeps existing data flow while presenting responsive discovery controls", async () => {
  const page = await read("../src/components/events/DineExperienceDiscovery.jsx");
  assert.match(page, /eventsApi\.getExperiences\(params, \{ signal: controller\.signal \}\)/);
  assert.match(page, /eventsApi\.getExperience\(experienceId, \{ signal: controller\.signal \}\)/);
  assert.match(page, /eventsApi\.createBooking\(payload\)/);
  assert.match(page, /type: publicExperienceType\(discoveryType\)/);
  assert.match(page, /page,\s*limit: PAGE_SIZE,\s*sort/);
  assert.match(page, /<option value="newest">Newest<\/option>/);
  assert.match(page, /<option value="price_asc">Price: low to high<\/option>/);
  assert.match(page, /<option value="price_desc">Price: high to low<\/option>/);
  assert.match(page, /grid-cols-1 items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3/);
  assert.match(page, /discoveryType === "dining"[\s\S]*?grid-cols-1 items-stretch gap-5 lg:grid-cols-2/);
  assert.match(page, /Page \{page\} of \{listing\.pagination\.totalPages\}/);
  assert.match(page, /aria-label="Experience result pages"/);
  assert.doesNotMatch(page, /Available seats can change until the server accepts your booking request\./);
  assert.doesNotMatch(page, /<Link to=\{`\/explore\?type=\$\{discoveryType\}`\}/);
});

test("reusable experience card preserves route and booking actions and has one-shot image fallback", async () => {
  const card = await read("../src/components/events/ExperienceCard.jsx");
  assert.match(card, /type, selection, onSelection, onBook/);
  assert.match(card, /to: `\/workshops\/\$\{encodeURIComponent\(experience\.id\)\}`/);
  assert.match(card, /<ExperienceImage experience=\{experience\} type=\{normalizedType\} horizontal=\{isDining\} categories=\{categories\} \/>/);
  assert.match(card, /onError=\{\(\) => setFailedSource\(image\.src\)\}/);
  assert.match(card, /failed = !image\.src \|\| failedSource === image\.src/);
  assert.match(card, /type === "workshop" \? ChefHat : Table2/);
  assert.match(card, /onChange=\{\(event\) => onSelection/);
  assert.match(card, /onClick=\{onBook\}/);
  assert.match(card, /experience\.learningOutcomes/);
  assert.match(card, /experience\.teachingContent/);
  assert.match(card, /grid-cols-\[96px_minmax\(0,1fr\)\].*sm:grid-cols-\[144px_minmax\(0,1fr\)\]/);
  assert.match(card, /w-24 rounded-xl object-cover sm:w-36/);
  assert.match(card, /col-span-full mt-1 grid/);
});
