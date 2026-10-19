import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("CookReviewsPage loads reviews belonging to authenticated cook via reviewsApi.forMyCook", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  // API query
  assert.match(pageCode, /reviewsApi\s*\.\s*forMyCook\(/);
  assert.match(pageCode, /limit:\s*50/);
});

test("CookReviewsPage displays customer rating, comment, subject name, date, verified indicator, and cook reply", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  // Rating and star
  assert.match(pageCode, /review\.rating\}\/5/);
  assert.match(pageCode, /fill-amber-400/);

  // Customer comment
  assert.match(pageCode, /review\.comment/);

  // Dish or event title
  assert.match(pageCode, /subjectTitle/);
  assert.match(pageCode, /review\.subjectName/);

  // Verified badge indicator
  assert.match(pageCode, /isFood\s*\?\s*"Verified order"\s*:\s*"Attended event"/);

  // Date
  assert.match(pageCode, /dateText\(review\.createdAt\)/);

  // Cook reply display with timestamp
  assert.match(pageCode, /review\.cookReply/);
  assert.match(pageCode, /Your reply/);
  assert.match(pageCode, /review\.cookRepliedAt/);
});

test("CookReviewsPage provides All, Food, Events, and Needs Reply filters", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  // Filter tabs
  assert.match(pageCode, />\s*All\s*<\/button>/);
  assert.match(pageCode, />\s*Food\s*<\/button>/);
  assert.match(pageCode, />\s*Events\s*<\/button>/);
  assert.match(pageCode, />\s*Needs Reply\s*<\/button>/);

  // Query parameters applied
  assert.match(pageCode, /filterType\s*\?\s*\{\s*type:\s*filterType\s*\}\s*:\s*\{\}/);
  assert.match(pageCode, /filterNeedsReply\s*\?\s*\{\s*needsReply:\s*filterNeedsReply\s*\}\s*:\s*\{\}/);
});

test("CookReviewsPage enforces single reply up to 300 characters and prevents second reply", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  // Textarea maxLength 300 and counter
  assert.match(pageCode, /maxLength=\{300\}/);
  assert.match(pageCode, /draft\.length\}\/300/);
  assert.match(pageCode, /draft\.length\s*>\s*300/);

  // Submits reply via reviewsApi.reply
  assert.match(pageCode, /reviewsApi\.reply\(review\.id,\s*draft\)/);

  // If already replied, shows cook reply card instead of reply form
  assert.match(pageCode, /review\.cookReply\s*\?\s*\(/);
  assert.match(pageCode, /Replied/);
});

test("CookReviewsPage provides accessible report modal with 5 to 500 characters validation without hiding review", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  // Accessible modal attributes
  assert.match(pageCode, /role="dialog"/);
  assert.match(pageCode, /aria-modal="true"/);
  assert.match(pageCode, /aria-labelledby="report-modal-title"/);

  // Validation 5 to 500
  assert.match(pageCode, /maxLength=\{500\}/);
  assert.match(pageCode, /reason\.length\s*<\s*5/);
  assert.match(pageCode, /reason\.length\s*>\s*500/);

  // Submits via reviewsApi.report
  assert.match(pageCode, /reviewsApi\.report\(reportingReview\.id,\s*reason\)/);

  // Shows reported badge and disables report button if already reported
  assert.match(pageCode, /review\.isReported/);
  assert.match(pageCode, /Reported for review/);
});

test("CookReviewsPage displays moderation badges for hidden and removed reviews", async () => {
  const pageCode = await read("../src/pages/cook/panel/CookReviewsPage.jsx");

  assert.match(pageCode, /review\.status === "HIDDEN"/);
  assert.match(pageCode, /Hidden by moderation/);
  assert.match(pageCode, /review\.status === "REMOVED"/);
  assert.match(pageCode, /Removed/);
});
