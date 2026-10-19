import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { markAllCookNotificationsReadForUser } from "../modules/cook/cook.service.js";

test("mark-all updates only the authenticated Cook's unread legacy notifications", async () => {
  let updateArgs;
  const database = {
    cookNotification: {
      async updateMany(args) {
        updateArgs = args;
        return { count: 9 };
      },
    },
  };

  const result = await markAllCookNotificationsReadForUser(database, "cook-user-1");

  assert.deepEqual(updateArgs, {
    where: { userId: "cook-user-1", isRead: false },
    data: { isRead: true },
  });
  assert.deepEqual(result, { updatedCount: 9, unreadCount: 0 });
});

test("Cook mark-all notification route remains restricted to an approved authenticated Cook", async () => {
  const routes = await readFile(new URL("../modules/cook/cook.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../modules/cook/cook.controller.js", import.meta.url), "utf8");
  assert.match(routes, /router\.use\(authenticate\)/);
  assert.match(routes, /router\.patch\("\/notifications\/read-all", requireApprovedCook, markAllMyNotificationsRead\)/);
  assert.match(controller, /cookService\.markAllCookNotificationsRead\(req\.user\.id\)/);
});
