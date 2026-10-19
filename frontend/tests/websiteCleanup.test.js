import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the shared error boundary gives users recovery guidance without exposing exception details", async () => {
  const boundary = await source("../src/components/common/ErrorBoundary.jsx");

  assert.match(boundary, /This page could not be displayed\. Reload the page or return home and try again\./);
  assert.doesNotMatch(boundary, /\{this\.state\.error\?\.message/);
  assert.match(boundary, /console\.error\("TasteBridge ErrorBoundary caught an error:"/);
});

