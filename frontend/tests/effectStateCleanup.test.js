import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AuthModal resets its mode by mounting the dialog for the active initial mode", async () => {
  const component = await source("../src/components/auth/AuthModal.jsx");

  assert.match(component, /if \(!isOpen\) return null/);
  assert.match(component, /<AuthModalDialog\s+key=\{initialMode\}/);
  assert.match(component, /useState\(initialMode\)/);
  assert.doesNotMatch(component, /useEffect/);
});

test("Profile display follows Redux user data and saves through the existing profile action", async () => {
  const component = await source("../src/pages/Profile.jsx");

  assert.match(component, /const profileData = \{/);
  assert.match(component, /name: user\?\.name/);
  assert.match(component, /dispatch\(updateUserProfile\(\{ name: updated\.name, phone: updated\.phone \}\)\)/);
  assert.doesNotMatch(component, /setProfileData/);
});

test("Dish category props take precedence and stale category fetches are ignored", async () => {
  const component = await source("../src/pages/cook/panel/DishFormModal.jsx");

  assert.match(component, /const internalCategories = categories\?\.length \? categories : fetchedCategories/);
  assert.match(component, /if \(active\) setFetchedCategories\(catList\)/);
  assert.match(component, /active = false/);
});

test("Cook dashboard request callback is stable and its effect tracks it", async () => {
  const component = await source("../src/pages/cook/panel/CookDashboardPage.jsx");

  assert.match(component, /const requestDashboardData = useCallback\(async \(\) =>/);
  assert.match(component, /\}, \[isReadyCook, requestDashboardData\]\)/);
  assert.match(component, /let active = true/);
  assert.match(component, /active = false/);
});
