import fs from "fs";
import path from "path";
import prisma from "../config/prisma.js";
import { cloudinaryService } from "../services/cloudinary.service.js";
import { UPLOAD_DIRECTORY } from "../utils/fileUpload.js";

export async function runDocumentMigration() {
  console.log("=============================================================");
  console.log("   TASTEBRIDGE CLOUDINARY DOCUMENT MIGRATION UTILITY         ");
  console.log("=============================================================");

  if (!cloudinaryService.isConfigured()) {
    console.error("ERROR: Cloudinary credentials are not configured in environment variables.");
    process.exit(1);
  }

  // Ping Cloudinary
  try {
    const pingRes = await cloudinaryService.ping();
    console.log("✓ Cloudinary connection verified:", pingRes.status || "OK");
  } catch (err) {
    console.error("ERROR: Unable to reach Cloudinary:", err.message);
    process.exit(1);
  }

  // Fetch all documents in database
  const allDocs = await prisma.verificationDocument.findMany({
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${allDocs.length} total verification document records in PostgreSQL.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failedDocs = [];

  for (const doc of allDocs) {
    // Repeat-safe: Skip if already migrated to Cloudinary
    if (doc.cloudinaryPublicId && doc.storageProvider === "CLOUDINARY") {
      console.log(`- [SKIP] Doc ${doc.id} (${doc.fileName || doc.documentType}) is already migrated (Public ID: ${doc.cloudinaryPublicId})`);
      skippedCount++;
      continue;
    }

    console.log(`\n- Migrating Doc ${doc.id}:`);
    console.log(`  User: ${doc.user?.name} (${doc.user?.email})`);
    console.log(`  Type: ${doc.documentType} | Original: ${doc.fileName}`);

    // Resolve local file path
    let localPath = path.isAbsolute(doc.documentUrl)
      ? doc.documentUrl
      : path.resolve(UPLOAD_DIRECTORY, path.basename(doc.documentUrl));

    if (!fs.existsSync(localPath)) {
      localPath = path.resolve(process.cwd(), doc.documentUrl);
    }

    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ FAILED: Local file not found on disk at "${localPath}"`);
      failedCount++;
      failedDocs.push({ id: doc.id, fileName: doc.fileName, reason: "Local file not found on disk" });
      continue;
    }

    try {
      const fileBuffer = fs.readFileSync(localPath);
      const fileName = doc.fileName || path.basename(localPath);

      // Upload to Cloudinary private storage
      const uploadRes = await cloudinaryService.uploadPrivateDocument({
        fileBuffer,
        fileName,
        userId: doc.userId,
        documentType: doc.documentType,
        mimeType: doc.mimeType || (fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      });

      // Verify upload response
      if (!uploadRes.publicId || !uploadRes.secureUrl) {
        throw new Error("Cloudinary response missing publicId or secureUrl");
      }

      // Update database record with Cloudinary metadata
      await prisma.verificationDocument.update({
        where: { id: doc.id },
        data: {
          cloudinaryPublicId: uploadRes.publicId,
          resourceType: uploadRes.resourceType,
          storageProvider: "CLOUDINARY",
          documentUrl: uploadRes.secureUrl,
        },
      });

      console.log(`  ✓ SUCCESS: Migrated to Cloudinary!`);
      console.log(`    Public ID: ${uploadRes.publicId}`);
      console.log(`    Resource Type: ${uploadRes.resourceType}`);
      console.log(`    Original local file preserved at: ${localPath}`);
      migratedCount++;
    } catch (uploadErr) {
      console.error(`  ✗ FAILED to upload to Cloudinary: ${uploadErr.message}`);
      failedCount++;
      failedDocs.push({ id: doc.id, fileName: doc.fileName, reason: uploadErr.message });
    }
  }

  console.log("\n=============================================================");
  console.log("   MIGRATION SUMMARY                                         ");
  console.log("=============================================================");
  console.log(`Total Records:     ${allDocs.length}`);
  console.log(`Already Migrated:  ${skippedCount}`);
  console.log(`Newly Migrated:    ${migratedCount}`);
  console.log(`Failed:            ${failedCount}`);

  if (failedDocs.length > 0) {
    console.log("\nFailed Documents Details:");
    failedDocs.forEach((f) => console.log(`- ${f.id} (${f.fileName}): ${f.reason}`));
  }

  console.log("=============================================================\n");
  return { total: allDocs.length, skipped: skippedCount, migrated: migratedCount, failed: failedCount, failedDocs };
}

// Auto-run if executed directly via node
if (process.argv[1] && process.argv[1].includes("migrateDocumentsToCloudinary")) {
  runDocumentMigration()
    .catch((err) => {
      console.error("Migration error:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
