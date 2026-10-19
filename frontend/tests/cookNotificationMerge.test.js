import assert from "node:assert/strict";
import test from "node:test";
import { countCookUnreadNotifications, mergeCookNotificationFeeds } from "../src/utils/cookNotifications.js";

const fssai = (overrides = {}) => ({
  id: "shared-1",
  source: "shared",
  title: "FSSAI verification approved",
  message: "Your FSSAI document has been approved.",
  isRead: false,
  createdAt: "2026-10-17T12:00:00.000Z",
  metadata: { kind: "FSSAI_REVIEW", eventKey: "fssai:doc-1:review:APPROVED:cook:user-1" },
  ...overrides,
});

test("same FSSAI event is presented once while both read records remain separately addressable", () => {
  const shared = fssai();
  const legacy = fssai({ id: "legacy-1", source: "legacy" });
  const merged = mergeCookNotificationFeeds([shared], [legacy]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].isRead, false);
  assert.deepEqual(merged[0].sources.map(({ source, id }) => [source, id]), [
    ["legacy", "legacy-1"], ["shared", "shared-1"],
  ]);
});

test("unrelated or historical FSSAI and ordinary notifications are not hidden", () => {
  const shared = [
    fssai(),
    fssai({ id: "shared-old", metadata: { kind: "FSSAI_REVIEW" } }),
    fssai({ id: "shared-other", metadata: { kind: "FSSAI_REVIEW", eventKey: "another-event" } }),
    fssai({ id: "shared-order", metadata: { kind: "ORDER_STATUS", eventKey: "fssai:doc-1:review:APPROVED:cook:user-1" } }),
  ];
  const legacy = [
    fssai({ id: "legacy-1", source: "legacy" }),
    fssai({ id: "legacy-old", source: "legacy", metadata: { kind: "FSSAI_REVIEW" } }),
    fssai({ id: "legacy-mismatch", source: "legacy", message: "A different review message." }),
  ];
  const merged = mergeCookNotificationFeeds(shared, legacy);
  assert.equal(merged.length, 6);
  assert.equal(merged.filter(({ displayKey }) => displayKey.startsWith("fssai:")).length, 1);
});

test("combined presentation reports read only after both independent records are read", () => {
  const shared = fssai({ isRead: true });
  const legacy = fssai({ id: "legacy-1", source: "legacy", isRead: false });
  assert.equal(mergeCookNotificationFeeds([shared], [legacy])[0].isRead, false);
  assert.equal(mergeCookNotificationFeeds([fssai({ isRead: true })], [fssai({ id: "legacy-1", source: "legacy", isRead: true })])[0].isRead, true);
});

test("Cook unread badge counts a paired unread FSSAI event once without coupling read states", () => {
  const pairedUnread = mergeCookNotificationFeeds(
    [fssai()],
    [fssai({ id: "legacy-1", source: "legacy" })],
  );
  assert.equal(countCookUnreadNotifications(1, 1, pairedUnread), 1);

  const oneSideRead = mergeCookNotificationFeeds(
    [fssai({ isRead: true })],
    [fssai({ id: "legacy-1", source: "legacy" })],
  );
  assert.equal(countCookUnreadNotifications(0, 1, oneSideRead), 1);

  const bothRead = mergeCookNotificationFeeds(
    [fssai({ isRead: true })],
    [fssai({ id: "legacy-1", source: "legacy", isRead: true })],
  );
  assert.equal(countCookUnreadNotifications(0, 0, bothRead), 0);
});
