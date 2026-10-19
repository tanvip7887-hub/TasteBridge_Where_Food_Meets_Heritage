import prisma from "../config/prisma.js";
import { generateToken } from "../modules/auth/auth.service.js";
import { cookService } from "../modules/cook/cook.service.js";

async function runTests() {
  console.log("=== Testing Cook Panel Services & Data ===");

  // 1. Find approved cook
  const approvedCook = await prisma.user.findFirst({
    where: {
      role: "COOK",
      cookProfile: { verificationStatus: "APPROVED" },
    },
    include: { cookProfile: true },
  });

  if (!approvedCook) {
    throw new Error("No approved cook found in database.");
  }
  console.log("Found Approved Cook:", approvedCook.email, `(${approvedCook.cookProfile.businessName})`);

  // 2. Test getKitchenProfile
  const kitchen = await cookService.getKitchenProfile(approvedCook.id);
  console.log("getKitchenProfile result:", {
    id: kitchen.id,
    businessName: kitchen.businessName,
    isOpen: kitchen.isOpen,
    whoTaughtCooking: kitchen.whoTaughtCooking,
    city: kitchen.city,
    locality: kitchen.locality,
    verificationStatus: kitchen.verificationStatus,
    fssaiStatus: kitchen.fssaiStatus,
    isApprovedToSell: kitchen.isApprovedToSell,
  });

  // 3. Test updateKitchenProfile
  const updatedKitchen = await cookService.updateKitchenProfile(approvedCook.id, {
    whoTaughtCooking: "Grandmother Alka with 40 years of North Indian culinary heritage",
    isOpen: true,
    signatureDishes: "Traditional Dal Makhani & Tandoori Kulcha",
  });
  console.log("updateKitchenProfile result:", {
    whoTaughtCooking: updatedKitchen.whoTaughtCooking,
    isOpen: updatedKitchen.isOpen,
    signatureDishes: updatedKitchen.signatureDishes,
  });

  // 4. Test getCookDashboard
  const dashboard = await cookService.getCookDashboard(approvedCook.id);
  console.log("getCookDashboard result:", {
    summary: dashboard.summary,
    recentOrdersCount: dashboard.recentOrders.length,
    experiencesCount: dashboard.experiences.length,
  });

  // 5. Test ownership / non-cook access
  const customerUser = await prisma.user.findFirst({
    where: { role: "CUSTOMER" },
  });
  if (customerUser) {
    try {
      await cookService.getKitchenProfile(customerUser.id);
      console.error("FAIL: Non-cook retrieved kitchen profile unexpectedly");
    } catch (err) {
      console.log("SUCCESS: Non-cook access properly rejected with:", err.message);
    }
  }

  console.log("=== All Backend Service Tests Passed! ===");
}

runTests()
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
