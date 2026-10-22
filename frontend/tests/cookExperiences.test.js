import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("direct event publishing uses an authenticated Cook API route and the existing management routes", async () => {
  const [api, routes] = await Promise.all([
    read("../src/api/cookApi.js"),
    read("../../backend/src/modules/cook/cook.routes.js"),
  ]);
  assert.match(api, /publishNewExperience: \(data, workshopImage\)/);
  assert.match(routes, /"\/experiences\/publish"[\s\S]*requireApprovedCook[\s\S]*imageUpload\.single\("workshopImage"\)[\s\S]*validate\(publishExperienceSchema\)/);
  assert.match(api, /getExperiences: \(\) => api\.get\("\/cooks\/experiences"\)/);
  assert.match(api, /pauseExperience:/);
  assert.match(api, /createExperienceSlot:/);
});

test("new event form separates total seats from per-booking guests and publishes in one action", async () => {
  const page = await read("../src/pages/cook/panel/CookExperiencesPage.jsx");
  for (const label of [
    "Experience type", "Title", "Theme", "Cuisine", "Menu type", "Description",
    "Dietary notes", "Menu notes", "Price per person (INR)",
    "Maximum guests per booking", "Seats for this event date", "Duration (minutes)", "Location", "Event date", "Event start time (IST)",
  ]) assert.ok(page.includes(label), `missing form field: ${label}`);
  assert.match(page, /"Publish Event"/);
  assert.doesNotMatch(page, /Experience photo|Inclusions|House rules|Private venue address|Address source/);
  assert.match(page, /publishNewExperience\(\{ \.\.\.data, idempotencyKey: pendingKey \}, workshopImage\)/);
  assert.doesNotMatch(page, /createExperience\(data\).*uploadExperiencePhoto/s);
});

test("Home Dining Theme dropdown uses the existing active regional food categories", async () => {
  const [page, api, explore, discovery, card] = await Promise.all([
    read("../src/pages/cook/panel/CookExperiencesPage.jsx"),
    read("../src/api/cookApi.js"),
    read("../src/pages/ExplorePage.jsx"),
    read("../src/components/events/DineExperienceDiscovery.jsx"),
    read("../src/components/events/ExperienceCard.jsx"),
  ]);
  assert.match(api, /getCategories: \(\) => api\.get\("\/categories"\)/);
  assert.match(page, /cookApi\.getCategories\(\)/);
  assert.match(page, /themeCategories\.map\(\(category\) => <option key=\{category\.id\} value=\{category\.name\}>\{category\.name\}<\/option>\)/);
  assert.match(explore, /regionalCategories=\{categories\}/);
  assert.match(discovery, /categories=\{regionalCategories\}/);
  assert.match(card, /getExperienceImage\(experience, 800, categories\)/);
});

test("Cook My events shows the same theme-selected Home Dining image as customer discovery", async () => {
  const [page, card] = await Promise.all([
    read("../src/pages/cook/panel/CookExperiencesPage.jsx"),
    read("../src/components/events/ExperienceCard.jsx"),
  ]);
  assert.match(card, /export const ExperienceImage/);
  assert.match(page, /experience\.type === "HOME_DINING" && <ExperienceImage experience=\{experience\} type="dining" horizontal categories=\{themeCategories\} \/>/);
});

test("publishing form validates required values, converts IST date/time, prevents duplicate submits and refreshes persisted status", async () => {
  const [page, validation, dateTime] = await Promise.all([
    read("../src/pages/cook/panel/CookExperiencesPage.jsx"),
    read("../../backend/src/modules/cook/experience.validation.js"),
    read("../src/utils/istDateTime.js"),
  ]);
  assert.match(page, /required minLength=\{3\}/);
  assert.match(page, /required minLength=\{10\}/);
  assert.match(page, /name="maxGuests"[^>]*max="3"/);
  assert.match(page, /name="capacity"[^>]*max="100"/);
  assert.match(page, /capacity: Number\(draft\.capacity\)/);
  assert.match(page, /capacity: Number\(slotDraft\.capacity\)/);
  assert.match(page, /limits one customer's booking; “Seats for this event date” is the total capacity/);
  assert.match(validation, /publishExperienceSchema/);
  assert.match(validation, /startsAt: isoDate/);
  assert.match(dateTime, /timeZone: "Asia\/Kolkata"/);
  assert.match(page, /istLocalDateTimeToInstant\(`\$\{draft\.eventDate\}T\$\{draft\.eventStartTime\}`\)/);
  assert.match(page, /actionLock\.current/);
  assert.match(page, /getDineExperiencePublishKey\(idempotencyPayload\)/);
  assert.match(page, /const submittedStatus = data\.type === "WORKSHOP" \? "PENDING" : "PUBLISHED"/);
  assert.match(page, /result\.status !== submittedStatus \|\| !result\.slots\?\.length/);
  assert.match(page, /await refreshAfterAction\(\)/);
  assert.match(page, /role="status"/);
  assert.match(page, /role="alert"/);
});

test("Workshop form captures learning details and an image while Dine-only menu fields stay conditional", async () => {
  const [page, schema, upload, routes, admin] = await Promise.all([
    read("../src/pages/cook/panel/CookExperiencesPage.jsx"),
    read("../../backend/src/modules/cook/experience.validation.js"),
    read("../../backend/src/utils/fileUpload.js"),
    read("../../backend/src/modules/cook/cook.routes.js"),
    read("../../backend/src/modules/admin/admin.routes.js"),
  ]);
  for (const label of ["What will you teach?", "What will participants learn?", "Materials or ingredients to bring (optional)", "Workshop image"]) assert.ok(page.includes(label));
  assert.match(page, /draft\.type === "HOME_DINING" && <Field label="Cuisine"/);
  assert.match(page, /draft\.type === "HOME_DINING" && <label[\s\S]*?>Menu type/);
  assert.match(page, /Workshop submitted for Admin review/);
  assert.match(schema, /teachingContent: optionalText\(5000/);
  assert.match(schema, /learningOutcomes: optionalText\(3000/);
  assert.match(upload, /fileSize: 5 \* 1024 \* 1024/);
  assert.match(routes, /router\.put\([\s\S]*"\/experiences\/:id\/workshop-image"[\s\S]*validateUploadedFileContent/);
  assert.match(routes, /router\.delete\("\/experiences\/:id\/workshop-image"/);
  assert.match(admin, /router\.use\(authenticate, requireRole\("ADMIN"\)\)/);
});

test("customers can open public Workshop detail and book only from its existing available slots", async () => {
  const [route, detail, discovery, card, api] = await Promise.all([
    read("../src/routes/AppRoutes.jsx"),
    read("../src/pages/WorkshopDetailPage.jsx"),
    read("../src/components/events/DineExperienceDiscovery.jsx"),
    read("../src/components/events/ExperienceCard.jsx"),
    read("../src/api/eventsApi.js"),
  ]);
  assert.match(route, /path="workshops\/:id" element={<WorkshopDetailPage \/>}/);
  assert.match(detail, /experienceId=\{id\}/);
  assert.match(api, /getExperience: \(id, config = \{\}\) => api\.get\(`\/experiences\//);
  assert.match(card, /experience\.learningOutcomes/);
  assert.match(card, /experience\.teachingContent/);
  assert.match(card, /experience\.materialsToBring/);
  assert.match(card, /isWorkshop && !detailView/);
  assert.match(discovery, /submitBooking\(experience\)/);
});

test("publish retry key survives refresh for identical fields and changes when the request changes", async () => {
  const { getDineExperiencePublishKey, retireDineExperiencePublishKey } = await import("../src/utils/dineExperiencePublish.js");
  const { webcrypto } = await import("node:crypto");
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const payload = { title: "Sunday table", location: "private venue", startsAt: "2026-10-25T12:30:00Z" };
  const first = await getDineExperiencePublishKey(payload, { storage, cryptoApi: webcrypto });
  const afterReload = await getDineExperiencePublishKey({ ...payload }, { storage, cryptoApi: webcrypto });
  const changed = await getDineExperiencePublishKey({ ...payload, title: "Saturday table" }, { storage, cryptoApi: webcrypto });
  assert.equal(first, afterReload);
  assert.notEqual(first, changed);
  assert.doesNotMatch([...values.values()][0], /private venue|Sunday table/);
  retireDineExperiencePublishKey(first, storage);
  assert.notEqual(await getDineExperiencePublishKey(payload, { storage, cryptoApi: webcrypto }), first);
});

test("invalid date/time and API failures show errors without claiming a publish", async () => {
  const page = await read("../src/pages/cook/panel/CookExperiencesPage.jsx");
  assert.match(page, /catch \(error\) \{\s*setActionError\(error\?\.message \|\| "The event could not be published/);
  assert.match(page, /onSave\(null, creating, error\)/);
  assert.match(page, /The event was submitted, but its status and first date could not be confirmed/);
});

test("event cards retain listing, status management, availability and error recovery", async () => {
  const page = await read("../src/pages/cook/panel/CookExperiencesPage.jsx");
  assert.match(page, /No experiences yet/);
  assert.match(page, /experience\.status === "PUBLISHED" \? "Unpublish" : experience\.type === "WORKSHOP" \? "Submit for review" : "Publish"/);
  assert.match(page, /Add date/);
  assert.match(page, /formatIstDateTime\(slot\.startsAt\)/);
  assert.match(page, />Retry</);
});

test("Cook My events filters by URL type and groups mixed results by event type", async () => {
  const page = await read("../src/pages/cook/panel/CookExperiencesPage.jsx");
  assert.match(page, /useSearchParams/);
  assert.match(page, /requestedType === "dining" \|\| requestedType === "workshop"/);
  assert.match(page, /next\.set\("type", type\)/);
  assert.match(page, /next\.delete\("type"\)/);
  assert.match(page, /items: diningExperiences/);
  assert.match(page, /items: workshops/);
  assert.match(page, /label: "Dining Experiences"/);
  assert.match(page, /label: "Workshops"/);
  assert.match(page, /<h1 className="sr-only">My events<\/h1>/);
  assert.doesNotMatch(page, /<button[^>]*>[^<]*Refresh<\/button>/);
});
