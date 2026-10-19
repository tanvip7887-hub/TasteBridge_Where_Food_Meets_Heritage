import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../prisma/migrations/20261015120000_add_fssai_workflow/migration.sql", import.meta.url),
  "utf8"
);

test("every FSSAI latest-document lookup has a unique deterministic tie-breaker", () => {
  const latestDocumentLookups = [...migration.matchAll(/ORDER BY ([^\n]+)/g)];

  assert.equal(latestDocumentLookups.length, 6);
  for (const [, orderBy] of latestDocumentLookups) {
    assert.match(orderBy, /"createdAt" DESC,\s*(?:latest|current_doc)\."id" DESC/);
  }
});

test("ambiguous newest documents cannot receive or retain an approved status", () => {
  assert.match(
    migration,
    /SET "expiryDate" = cp\."fssaiExpiryDate"[\s\S]*?AND NOT EXISTS \([\s\S]*?ambiguous\."createdAt" >= d\."createdAt"\s*\)/
  );
  assert.match(
    migration,
    /AND d\."expiryDate" = cp\."fssaiExpiryDate"[\s\S]*?AND d\."id" = \([\s\S]*?\)[\s\S]*?AND NOT EXISTS \([\s\S]*?ambiguous\."createdAt" >= d\."createdAt"\s*\)[\s\S]*?\) THEN 'APPROVED'/
  );
});
