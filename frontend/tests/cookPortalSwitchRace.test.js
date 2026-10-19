import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isApprovedCook, canLoadCookNotifications } from "../src/utils/cookAuth.js";

const readSource = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("cook readiness guard distinguishes approved cooks in COOK portal from portal-switching or unauthorized users", () => {
  const isReadyCook = (user) => user?.activePortal === "COOK" && isApprovedCook(user);

  // 1. Approved cook in COOK portal -> READY
  const approvedCookInCookPortal = {
    id: "cook_1",
    role: "COOK",
    activePortal: "COOK",
    availablePortals: ["CUSTOMER", "COOK"],
    cookProfile: { verificationStatus: "APPROVED" },
  };
  assert.equal(isReadyCook(approvedCookInCookPortal), true);
  assert.equal(canLoadCookNotifications(approvedCookInCookPortal), true);

  // 2. Approved cook in CUSTOMER portal (mid-portal switch race condition) -> NOT READY
  const approvedCookInCustomerPortal = {
    ...approvedCookInCookPortal,
    activePortal: "CUSTOMER",
  };
  assert.equal(isReadyCook(approvedCookInCustomerPortal), false);
  assert.equal(canLoadCookNotifications(approvedCookInCustomerPortal), false);

  // 3. Approved cook in DELIVERY_AGENT portal -> NOT READY
  const approvedCookInDeliveryPortal = {
    ...approvedCookInCookPortal,
    activePortal: "DELIVERY_AGENT",
  };
  assert.equal(isReadyCook(approvedCookInDeliveryPortal), false);
  assert.equal(canLoadCookNotifications(approvedCookInDeliveryPortal), false);

  // 4. Pending applicant in COOK portal (unauthorized) -> NOT READY
  const pendingCook = {
    id: "applicant_1",
    role: "CUSTOMER",
    activePortal: "COOK",
    availablePortals: ["CUSTOMER"],
    cookProfile: { verificationStatus: "PENDING" },
  };
  assert.equal(isReadyCook(pendingCook), false);
  assert.equal(canLoadCookNotifications(pendingCook), false);

  // 5. Pending applicant in CUSTOMER portal -> NOT READY
  const pendingCookInCustomer = {
    ...pendingCook,
    activePortal: "CUSTOMER",
  };
  assert.equal(isReadyCook(pendingCookInCustomer), false);
  assert.equal(canLoadCookNotifications(pendingCookInCustomer), false);

  // 6. Rejected applicant -> NOT READY
  const rejectedCook = {
    id: "rejected_1",
    role: "CUSTOMER",
    activePortal: "COOK",
    cookProfile: { verificationStatus: "REJECTED" },
  };
  assert.equal(isReadyCook(rejectedCook), false);

  // 7. Standard customer without cook profile -> NOT READY
  const standardCustomer = {
    id: "cust_1",
    role: "CUSTOMER",
    activePortal: "CUSTOMER",
    availablePortals: ["CUSTOMER"],
    cookProfile: null,
  };
  assert.equal(isReadyCook(standardCustomer), false);
  assert.equal(canLoadCookNotifications(standardCustomer), false);

  // 8. Admin user -> NOT READY
  const adminUser = {
    id: "admin_1",
    role: "ADMIN",
    activePortal: "ADMIN",
    cookProfile: null,
  };
  assert.equal(isReadyCook(adminUser), false);
  assert.equal(canLoadCookNotifications(adminUser), false);

  // 9. Unauthenticated / null user -> NOT READY
  assert.equal(isReadyCook(null), false);
  assert.equal(canLoadCookNotifications(null), false);
});

test("CookDashboardPage waits for activePortal COOK and APPROVED status before calling dashboard API", async () => {
  const page = await readSource("../src/pages/cook/panel/CookDashboardPage.jsx");

  // Verify import of isApprovedCook and useRef
  assert.match(page, /import\s*\{[^}]*isApprovedCook[^}]*\}\s*from\s*["']\.\.\/\.\.\/\.\.\/utils\/cookAuth\.js["']/);
  assert.match(page, /import\s*\{[^}]*useRef[^}]*\}\s*from\s*["']react["']/);

  // Verify definition of isReadyCook requiring activePortal COOK and APPROVED cookProfile
  assert.match(page, /const isReadyCook = user\?\.activePortal === "COOK" && isApprovedCook\(user\);/);

  // Verify requestDashboardData early returns without calling cookApi.getDashboard when not ready
  assert.match(page, /const requestDashboardData = (?:useCallback\()?async \(\) => \{\s*if \(!isReadyCook\) return null;/);

  // Verify duplicate request prevention via dashboardLoadRef
  assert.match(page, /const dashboardLoadRef = useRef\(null\);/);
  assert.match(page, /if \(dashboardLoadRef\.current\) return dashboardLoadRef\.current;/);

  // Verify useEffect runs upon isReadyCook change, avoids calling when not ready, and tracks active flag
  assert.match(page, /const \[loading, setLoading\] = useState\(true\);/);
  assert.match(page, /if \(!isReadyCook\) return undefined;/);
  assert.match(page, /let active = true;/);
  assert.match(page, /if \(active && data\) setDashboardData\(data\);/);
  assert.match(page, /return \(\) => \{\s*active = false;\s*\};/);
  assert.match(page, /\}, \[isReadyCook\]\);/);

  // Verify fetchDashboardData and refreshDashboardData are also gated
  assert.match(page, /const fetchDashboardData = async \(\) => \{\s*if \(!isReadyCook\) return;/);
  assert.match(page, /const refreshDashboardData = async \(\) => \{\s*if \(!isReadyCook \|\| refreshing\) return;/);
});

test("CookLayout gates cook orders API and notifications API on activePortal COOK and APPROVED status", async () => {
  const layout = await readSource("../src/layouts/CookLayout.jsx");

  // Verify imports
  assert.match(layout, /canLoadCookNotifications,\s*isApprovedCook/);

  // Verify order readiness gate
  assert.match(layout, /const canFetchCookOrders = user\?\.activePortal === "COOK" && isApprovedCook\(user\);/);

  // Background requests start without synchronously changing React state; refresh is event-driven.
  assert.match(layout, /const requestCookOrders = useCallback\(async \(\) => \{\s*if \(!canFetchCookOrders\) return;/);
  assert.match(layout, /const loadCookOrders = useCallback\(async \(\) => \{\s*if \(!canFetchCookOrders\) return;\s*setManualOrdersLoading\(true\);/);
  assert.match(layout, /const loadingOrders = manualOrdersLoading \|\| \([\s\S]*?ordersLoadedForUserId !== user\.id/);
  assert.match(layout, /const ordersError = ordersErrorState\.userId === user\?\.id \? ordersErrorState\.message : null;/);

  // Verify duplicate request prevention on orders
  assert.match(layout, /const ordersLoadRef = useRef\(null\);/);
  assert.match(layout, /if \(ordersLoadRef\.current\?\.userId === user\?\.id\) return ordersLoadRef\.current\.promise;/);
  assert.match(layout, /const requestEntry = \{ userId: requestUserId, promise: request \};/);
  assert.match(layout, /\}, \[canFetchCookOrders, user\?\.id\]\);/);

  // Verify unmount and portal-switch revision protection for orders
  assert.match(layout, /const ordersRevisionRef = useRef\(0\);/);
  assert.match(layout, /if \(requestRevision !== ordersRevisionRef\.current\) return;/);

  // Verify useEffect triggers when canFetchCookOrders transitions to true, and increments revision on unmount
  assert.match(layout, /if \(!canFetchCookOrders\) return;\s*requestCookOrders\(\);\s*return \(\) => \{\s*ordersRevisionRef\.current \+= 1;\s*\};\s*\}, \[canFetchCookOrders, requestCookOrders\]\);/);

  // Verify notifications useEffect also has unmount revision cleanup
  assert.match(layout, /if \(!canFetchCookNotifications\) return;\s*loadCookNotifications\(\);\s*return \(\) => \{\s*notificationRevisionRef\.current \+= 1;\s*\};\s*\}, \[canFetchCookNotifications, loadCookNotifications\]\);/);
});

test("duplicate in-flight request lock and cancellation behavior simulate expected portal-switch lifecycle", async () => {
  let apiCallCount = 0;
  const mockApi = {
    getDashboard: async () => {
      apiCallCount++;
      return { kitchen: { businessName: "Alka's Kitchen" } };
    },
  };

  // Simulation of CookDashboardPage request logic
  let activePortal = "CUSTOMER";
  const user = { role: "COOK", cookProfile: { verificationStatus: "APPROVED" } };
  let inFlightRef = null;

  const requestData = async () => {
    const isReady = activePortal === "COOK" && isApprovedCook(user);
    if (!isReady) return null;
    if (inFlightRef) return inFlightRef;

    const req = mockApi.getDashboard();
    inFlightRef = req;
    try {
      return await req;
    } finally {
      inFlightRef = null;
    }
  };

  // Phase 1: During portal switch (activePortal is still CUSTOMER) -> must not call API
  const phase1Result = await requestData();
  assert.equal(phase1Result, null);
  assert.equal(apiCallCount, 0, "No API call should occur while activePortal is CUSTOMER");

  // Phase 2: Portal switch completes (activePortal becomes COOK)
  activePortal = "COOK";

  // Simulate concurrent calls (e.g. quick re-render or double click)
  const [res1, res2] = await Promise.all([requestData(), requestData()]);
  assert.deepEqual(res1, { kitchen: { businessName: "Alka's Kitchen" } });
  assert.deepEqual(res2, { kitchen: { businessName: "Alka's Kitchen" } });
  assert.equal(apiCallCount, 1, "Duplicate concurrent calls must reuse the in-flight request");

  // Phase 3: Component unmounts / cancellations simulation
  let active = true;
  let stateUpdated = false;

  const runEffect = async () => {
    const data = await requestData();
    if (active && data) {
      stateUpdated = true;
    }
  };

  const effectPromise = runEffect();
  // Simulate immediate unmount before promise resolution completes
  active = false;
  await effectPromise;

  assert.equal(stateUpdated, false, "State should not update after component unmount / effect cancellation");
});
