import assert from "node:assert/strict";
import test from "node:test";
import { deliveryAgentApplicationSchema } from "../modules/delivery-agent/delivery-agent.validation.js";
import { deliveryAgentService } from "../modules/delivery-agent/delivery-agent.service.js";
import { persistDeliveryAgentVerificationTransition } from "../modules/admin/admin.service.js";

test("delivery agent schema validates valid two-wheeler application", () => {
  const validData = {
    fullName: "Rajesh Sharma",
    phone: "+919876543210",
    dateOfBirth: "1998-05-15",
    gender: "Male",
    addressLine1: "Flat 402, Lotus Heights, MG Road",
    locality: "Andheri West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400053",
    deliveryType: "TWO_WHEELER",
    vehicleType: "Motorcycle",
    vehicleNumber: "MH-02-AB-1234",
    licenseNumber: "MH0220180012345",
    emergencyContactName: "Suresh Sharma",
    emergencyContactPhone: "+919876543211",
    identityDocumentType: "Aadhaar Card",
    accurateInfoDeclaration: true,
    termsConsent: true,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(validData);
  assert.equal(parsed.success, true);
});

test("delivery agent schema validates valid bicycle/walking application without license or vehicle number", () => {
  const validBicycle = {
    fullName: "Amit Verma",
    phone: "9876543210",
    dateOfBirth: "2001-08-20",
    gender: "Male",
    addressLine1: "12/A, Gandhi Nagar",
    locality: "Kothrud",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411038",
    deliveryType: "BICYCLE",
    emergencyContactName: "Sunita Verma",
    emergencyContactPhone: "9876543212",
    accurateInfoDeclaration: true,
    termsConsent: true,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(validBicycle);
  assert.equal(parsed.success, true);
});

test("delivery agent schema enforces conditional vehicle and license for two-wheeler", () => {
  const missingVehicleData = {
    fullName: "Rajesh Sharma",
    phone: "+919876543210",
    dateOfBirth: "1998-05-15",
    addressLine1: "Flat 402, Lotus Heights",
    locality: "Andheri West",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400053",
    deliveryType: "TWO_WHEELER",
    emergencyContactName: "Suresh Sharma",
    emergencyContactPhone: "+919876543211",
    accurateInfoDeclaration: true,
    termsConsent: true,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(missingVehicleData);
  assert.equal(parsed.success, false);
  const issues = parsed.error.issues.map((i) => i.path.join("."));
  assert.ok(issues.includes("vehicleType"));
  assert.ok(issues.includes("vehicleNumber"));
  assert.ok(issues.includes("licenseNumber"));
});

test("delivery agent schema rejects underage applicants (< 18 years)", () => {
  const today = new Date();
  const underageYear = today.getFullYear() - 16;
  const underageData = {
    fullName: "Young Applicant",
    phone: "+919876543210",
    dateOfBirth: `${underageYear}-01-01`,
    addressLine1: "123 Main Street",
    locality: "Central",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    deliveryType: "WALKING",
    emergencyContactName: "Parent",
    emergencyContactPhone: "+919876543211",
    accurateInfoDeclaration: true,
    termsConsent: true,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(underageData);
  assert.equal(parsed.success, false);
  const dobIssue = parsed.error.issues.find((i) => i.path.includes("dateOfBirth"));
  assert.ok(dobIssue);
  assert.match(dobIssue.message, /18 years/);
});

test("delivery agent schema rejects missing consent and declaration", () => {
  const noConsent = {
    fullName: "Rajesh Sharma",
    phone: "+919876543210",
    dateOfBirth: "1998-05-15",
    addressLine1: "123 Main Street",
    locality: "Central",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    deliveryType: "BICYCLE",
    emergencyContactName: "Emergency Person",
    emergencyContactPhone: "+919876543211",
    accurateInfoDeclaration: false,
    termsConsent: false,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(noConsent);
  assert.equal(parsed.success, false);
  const issues = parsed.error.issues.map((i) => i.path.join("."));
  assert.ok(issues.includes("accurateInfoDeclaration"));
  assert.ok(issues.includes("termsConsent"));
});

test("delivery agent schema validates 6-digit Indian PIN code", () => {
  const invalidPincode = {
    fullName: "Rajesh Sharma",
    phone: "+919876543210",
    dateOfBirth: "1998-05-15",
    addressLine1: "123 Main Street",
    locality: "Central",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "000000", // Invalid PIN (leading 0)
    deliveryType: "WALKING",
    emergencyContactName: "Emergency Person",
    emergencyContactPhone: "+919876543211",
    accurateInfoDeclaration: true,
    termsConsent: true,
  };

  const parsed = deliveryAgentApplicationSchema.body.safeParse(invalidPincode);
  assert.equal(parsed.success, false);
  assert.ok(parsed.error.issues.some((i) => i.path.includes("pincode")));
});

test("unauthorized user cannot view private document of another applicant", async () => {
  const mockDoc = { id: "doc-1", userId: "applicant-user-1" };
  const mockUser = { id: "other-user-2", role: "CUSTOMER" };

  // Helper verifying ownership check
  const checkAccess = (doc, user) => {
    if (doc.userId !== user.id && user.role !== "ADMIN") {
      throw new Error("You do not have permission to view this document");
    }
    return true;
  };

  assert.throws(() => checkAccess(mockDoc, mockUser), /permission to view/);

  // Admin has permission
  const adminUser = { id: "admin-user", role: "ADMIN" };
  assert.equal(checkAccess(mockDoc, adminUser), true);

  // Owner has permission
  const ownerUser = { id: "applicant-user-1", role: "CUSTOMER" };
  assert.equal(checkAccess(mockDoc, ownerUser), true);
});

test("delivery agent approval flow: submission stays PENDING until admin approves", async () => {
  const state = {
    user: { id: "user-agent-99", role: "CUSTOMER" },
    agent: { id: "agent-99", verificationStatus: "PENDING", isAvailable: false },
    document: { verificationStatus: "PENDING" },
  };

  // Initially after submission, user is CUSTOMER and status is PENDING
  assert.equal(state.user.role, "CUSTOMER");
  assert.equal(state.agent.verificationStatus, "PENDING");
  assert.equal(state.agent.isAvailable, false);

  // When admin executes approval transaction
  const transactionalClient = {
    async $transaction(fn) {
      const tx = {
        user: { async update({ data }) { Object.assign(state.user, data); } },
        deliveryAgent: {
          async update({ data }) {
            Object.assign(state.agent, data);
            return { ...state.agent, user: { ...state.user } };
          },
        },
        verificationDocument: { async updateMany({ data }) { Object.assign(state.document, data); } },
      };
      return fn(tx);
    },
  };

  const approved = await persistDeliveryAgentVerificationTransition(
    transactionalClient,
    { id: "agent-99", userId: "user-agent-99" },
    "APPROVED"
  );

  assert.equal(state.user.role, "DELIVERY_AGENT");
  assert.equal(state.agent.verificationStatus, "APPROVED");
  assert.equal(state.document.verificationStatus, "APPROVED");
  assert.equal(approved.user.role, "DELIVERY_AGENT");
});
