import assert from "node:assert/strict";
import test from "node:test";
import { buildDishStoryPayload } from "../src/utils/dishSubmission.js";

test("saving a draft or pending dish without Cook story data does not fabricate a story", () => {
  assert.equal(buildDishStoryPayload({}), undefined);
});

test("story fields are preserved only when the teacher and minimum-length story are supplied", () => {
  assert.deepEqual(
    buildDishStoryPayload({
      whoTaught: "Aaji",
      occasion: "",
      culturalSignificance: "Regional preparation",
      storyText: "A truthful account supplied by the Cook.",
      visibility: "PUBLIC",
    }),
    {
      whoTaught: "Aaji",
      occasion: null,
      culturalSignificance: "Regional preparation",
      storyText: "A truthful account supplied by the Cook.",
      visibility: "PUBLIC",
    }
  );
});

test("partial personal story details fail clearly instead of being replaced with defaults", () => {
  assert.throws(
    () => buildDishStoryPayload({ storyText: "Family recipe passed down." }),
    /who taught you this recipe/
  );
  assert.throws(
    () => buildDishStoryPayload({ whoTaught: "Aaji", storyText: "Short" }),
    /at least 10 characters/
  );
});
