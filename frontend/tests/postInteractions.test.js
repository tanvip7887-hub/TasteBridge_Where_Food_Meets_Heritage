import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupPostComments } from "../src/utils/socialFeed.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Post comments are grouped beneath their parent while preserving tombstones", () => {
  const grouped = groupPostComments([
    { id: "parent", parentId: null, deleted: true, text: null },
    { id: "reply", parentId: "parent", text: "A reply" },
    { id: "root", parentId: null, text: "Another comment" },
  ]);
  assert.deepEqual(grouped.map(({ id }) => id), ["parent", "root"]);
  assert.equal(grouped[0].deleted, true);
  assert.equal(grouped[0].replies[0].text, "A reply");
});

test("Customer Stories connects Post cards to existing like and comment endpoints without adding Story interactions", async () => {
  const [api, page, component, routes] = await Promise.all([
    read("../src/api/socialApi.js"),
    read("../src/pages/StoriesPage.jsx"),
    read("../src/components/social/PostInteractions.jsx"),
    read("../src/routes/AppRoutes.jsx"),
  ]);
  for (const path of ["/social/posts/${encodeURIComponent(postId)}/likes", "/social/posts/${encodeURIComponent(postId)}/comments", "/social/comments/${encodeURIComponent(commentId)}"]) assert.ok(api.includes(path));
  assert.match(page, /<PostCardInteractions post=\{post\} \/>/);
  assert.match(component, /OPEN_AUTH_MODAL_EVENT/);
  assert.match(component, /maxLength=\{300\}/);
  assert.match(component, /canDelete &&/);
  assert.match(component, /Load more comments/);
  assert.match(component, /deletePostComment\(comment\.id\)/);
  assert.match(routes, /<Route element=\{<MainLayout \/>\}>\s*<Route path="\/stories" element=\{<StoriesPage \/>\} \/>\s*<\/Route>/);
  assert.doesNotMatch(page, /Like.*Story|Story.*like/i);
});

test("like UI uses the server state, blocks repeated clicks, redirects guests, and leaves state unchanged on errors", async () => {
  const component = await read("../src/components/social/PostInteractions.jsx");
  assert.match(component, /getPostLikeState\(postId/);
  assert.match(component, /currentLikeState\.likedByMe \? await unlikePost\(postId\) : await likePost\(postId\)/);
  assert.match(component, /if \(busy \|\| !currentLikeState\) return/);
  assert.match(component, /if \(!isAuthenticated\) \{ login\(\); return; \}/);
  assert.match(component, /catch \(requestError\) \{\s*setError\(messageFor\(requestError, "Your like could not be updated/);
  assert.match(component, /setLikeState\(\{ userId: user\.id, value: next, failed: false \}\)/);
});

test("comment UI validates locally, supports replies and pagination, and gates deletion by server permission", async () => {
  const component = await read("../src/components/social/PostInteractions.jsx");
  assert.match(component, /maxLength=\{300\}/);
  assert.match(component, /const cleanText = text\.trim\(\)/);
  assert.match(component, /createPostComment\(post\.id, payload, commentRequestRef\.current\.key\)/);
  assert.match(component, /commentRequestRef\.current\?\.fingerprint !== fingerprint/);
  const api = await read("../src/api/socialApi.js");
  assert.match(api, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
  assert.match(component, /comment\.canDelete &&/);
  assert.match(component, /deletePostComment\(comment\.id\)/);
  assert.match(component, /items: previous\.items\.map\(\(item\) => item\.id === comment\.id \? \{ \.\.\.item, text: null, deleted: true/);
  assert.match(component, /listPostComments\(post\.id, \{ page: result\.pagination\.page \+ 1, limit: 20 \}\)/);
  assert.match(component, /onCountChange\?\.\(count\)/);
});

test("Cook comment notifications link to the Comments tab filtered to the owning Post", async () => {
  const page = await read("../src/pages/cook/panel/CookStoriesPage.jsx");
  const api = await read("../src/api/cookApi.js");
  assert.match(page, /searchParams\.get\("tab"\) === "Comments"/);
  assert.match(page, /searchParams\.get\("postId"\)/);
  assert.match(page, /postId: selectedCommentPostId \|\| undefined/);
  assert.match(api, /\.\.\.\(postId \? \{ postId \} : \{\}\)/);
});
