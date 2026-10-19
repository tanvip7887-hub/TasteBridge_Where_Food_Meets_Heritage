import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Delivery Agent Registration components and API client are fully implemented", async () => {
  const [formSource, statusSource, pageSource, apiSource] = await Promise.all([
    readSource("../src/pages/delivery/DeliveryAgentApplicationForm.jsx"),
    readSource("../src/pages/delivery/DeliveryAgentApplicationStatus.jsx"),
    readSource("../src/pages/delivery/BecomeDeliveryAgentPage.jsx"),
    readSource("../src/api/deliveryAgentApi.js"),
  ]);

  // 1. API Client exports required endpoints
  assert.match(apiSource, /getMyApplication:\s*\(\)\s*=>\s*api\.get\(["']\/delivery-agents\/application["']\)/);
  assert.match(apiSource, /submitApplication:\s*\(formData\)\s*=>/);
  assert.match(apiSource, /getDocument:\s*\(docId\)\s*=>\s*api\.get\(`\/delivery-agents\/documents\/\$\{docId\}`/);

  // 2. Form - Section A: Personal Information
  assert.match(formSource, /name="fullName"/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /name="dateOfBirth"/);
  assert.match(formSource, /name="gender"/);
  assert.match(formSource, /id="profilePhotoInput"/);

  // 3. Form - Section B: Address Information
  assert.match(formSource, /name="addressLine1"/);
  assert.match(formSource, /name="locality"/);
  assert.match(formSource, /name="city"/);
  assert.match(formSource, /name="state"/);
  assert.match(formSource, /name="pincode"/);

  // 4. Form - Section C: Delivery & Vehicle Information (Conditional)
  assert.match(formSource, /DELIVERY_MODES\.map/);
  assert.match(formSource, /deliveryType:\s*mode\.id/);
  assert.match(formSource, /TWO_WHEELER/);
  assert.match(formSource, /BICYCLE/);
  assert.match(formSource, /WALKING/);
  assert.match(formSource, /name="vehicleType"/);
  assert.match(formSource, /name="vehicleNumber"/);
  assert.match(formSource, /name="licenseNumber"/);
  assert.match(formSource, /name="emergencyContactName"/);
  assert.match(formSource, /name="emergencyContactPhone"/);

  // 5. Form - Section D: Document Uploads with Replace / Remove
  assert.match(formSource, /id="identityFile"/);
  assert.match(formSource, /id="drivingLicenseFile"/);
  assert.match(formSource, /id="vehicleRegistrationFile"/);
  assert.match(formSource, /id="addressFile"/);
  assert.match(formSource, /Replace/);
  assert.match(formSource, /Trash2/);

  // 6. Form - Section E: Declarations & Submit
  assert.match(formSource, /name="accurateInfoDeclaration"/);
  assert.match(formSource, /name="termsConsent"/);
  assert.match(formSource, /Submit Registration/);
  assert.match(formSource, /Back to Overview/);

  // 7. Status View - Handles PENDING status and document viewing
  assert.match(statusSource, /Status: Under Review/);
  assert.match(statusSource, /Your Application Is Under Review/);
  assert.match(statusSource, /deliveryAgentApi\.getDocument/);
  assert.match(statusSource, /View Document/);

  // 8. Page integration - View modes: landing, wizard, status
  assert.match(pageSource, /import\s+DeliveryAgentApplicationForm\s+from/);
  assert.match(pageSource, /import\s+DeliveryAgentApplicationStatus\s+from/);
  assert.match(pageSource, /viewMode\s*===\s*["']wizard["']/);
  assert.match(pageSource, /viewMode\s*===\s*["']status["']/);
  assert.match(pageSource, /viewMode\s*===\s*["']landing["']/);
  assert.match(pageSource, /deliveryAgentApi\.getMyApplication/);
});
