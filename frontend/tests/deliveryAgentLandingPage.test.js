import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Delivery Agent Landing Page imports agent_homepage.png and renders hero, Sign Up, and Login options", async () => {
  const [pageSource, routesSource, navbarSource] = await Promise.all([
    readSource("../src/pages/delivery/BecomeDeliveryAgentPage.jsx"),
    readSource("../src/routes/AppRoutes.jsx"),
    readSource("../src/components/layout/Navbar.jsx"),
  ]);

  // 1. Reuses existing image asset (agent_homepage.png) full in background
  assert.match(pageSource, /import\s+agentHeroImage\s+from\s+["']\.\.\/\.\.\/assets\/agent_homepage\.png["']/);
  assert.match(pageSource, /<img[\s\S]*?src=\{agentHeroImage\}[\s\S]*?object-cover/);
  assert.match(pageSource, /absolute inset-0/);

  // 2. Clear heading and value proposition
  assert.match(pageSource, /Deliver Fresh Home Meals/);
  assert.match(pageSource, /Earn On Your Own Terms/);

  // 3. Prominent Sign Up button
  assert.match(pageSource, /Sign Up to Deliver/);

  // 4. Clean Login option
  assert.match(pageSource, /Log In/);

  // 5. AuthModal integration without separate authentication logic
  assert.match(pageSource, /import\s+AuthModal\s+from\s+["']\.\.\/\.\.\/components\/auth\/AuthModal\.jsx["']/);
  assert.match(pageSource, /<AuthModal/);

  // 6. Connected navigation in AppRoutes
  assert.match(routesSource, /import\s+BecomeDeliveryAgentPage\s+from\s+["']\.\.\/pages\/delivery\/BecomeDeliveryAgentPage\.jsx["']/);
  assert.match(routesSource, /<Route\s+path="become-a-delivery-agent"\s+element=\{<BecomeDeliveryAgentPage\s*\/>\}/);

  // 7. Navbar links to become-a-delivery-agent
  assert.match(navbarSource, /to="\/become-a-delivery-agent"/);
  assert.match(navbarSource, /Become a Delivery Agent/);
});
