import express from "express";
import request from "node:http";
import prisma from "../config/prisma.js";
import { generateToken } from "../modules/auth/auth.service.js";
import app from "../app.js";

async function testHttpEndpoints() {
  console.log("=== Testing Cook Panel HTTP APIs ===");

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1/cooks`;

  try {
    const approvedCook = await prisma.user.findFirst({
      where: {
        role: "COOK",
        cookProfile: { verificationStatus: "APPROVED" },
      },
      include: { cookProfile: true },
    });

    const cookToken = generateToken(approvedCook.id, approvedCook.role);

    // 1. Unauthenticated test -> 401
    const unauthRes = await fetch(`${baseUrl}/kitchen`);
    console.log("1. Unauthenticated GET /kitchen status:", unauthRes.status, "(Expected 401)");
    if (unauthRes.status !== 401) throw new Error("Expected 401 for unauthenticated request");

    // 2. Authenticated GET /kitchen -> 200
    const kitchenRes = await fetch(`${baseUrl}/kitchen`, {
      headers: { Authorization: `Bearer ${cookToken}` },
    });
    const kitchenJson = await kitchenRes.json();
    console.log("2. Authenticated GET /kitchen status:", kitchenRes.status, "data businessName:", kitchenJson.data?.businessName);
    if (kitchenRes.status !== 200) throw new Error("Expected 200 for authenticated kitchen profile");

    // 3. Authenticated PUT /kitchen -> 200
    const updateRes = await fetch(`${baseUrl}/kitchen`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cookToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bio: "Authentic culinary heritage passed down with treasured family recipes and pure desi ghee.",
        isOpen: true,
      }),
    });
    const updateJson = await updateRes.json();
    console.log("3. Authenticated PUT /kitchen status:", updateRes.status, "success:", updateJson.success);
    if (updateRes.status !== 200) throw new Error("Expected 200 for kitchen update");

    // 4. Authenticated GET /dashboard -> 200
    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Authorization: `Bearer ${cookToken}` },
    });
    const dashJson = await dashRes.json();
    console.log("4. Authenticated GET /dashboard status:", dashRes.status, "summary:", dashJson.data?.summary);
    if (dashRes.status !== 200) throw new Error("Expected 200 for cook dashboard");

    // 5. Invalid Input PUT /kitchen -> 400
    const invalidRes = await fetch(`${baseUrl}/kitchen`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cookToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "A", // too short, min is 2
      }),
    });
    console.log("5. Invalid input PUT /kitchen status:", invalidRes.status, "(Expected 400)");
    if (invalidRes.status !== 400) throw new Error("Expected 400 for invalid kitchen input");

    console.log("=== All HTTP API Tests Passed Successfully! ===");
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

testHttpEndpoints().catch((err) => {
  console.error("HTTP test failed:", err);
  process.exit(1);
});
