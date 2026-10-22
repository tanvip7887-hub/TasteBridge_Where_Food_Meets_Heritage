import express from "express";
import {
  getMyDeliveryAgentApplication,
  getDeliveryAgentPanelAccess,
  updateDeliveryAgentAvailability,
  listAvailableDeliveries,
  claimDelivery,
  listCurrentDeliveries,
  markDeliveryPickedUp,
  markDeliveryCompleted,
  requestDeliveryCompletionOtp,
  getDeliveryCompletionOtpStatus,
  confirmCodCollection,
  listDeliveryHistory,
  getDeliveryEarnings,
  submitDeliveryAgentPayoutDetails,
  submitDeliveryAgentApplication,
  getSecureDocument,
} from "./delivery-agent.controller.js";
import { authenticate, requireApprovedDeliveryAgent } from "../../middlewares/auth.js";
import { documentUpload, validateUploadedFileContent } from "../../utils/fileUpload.js";
import { validate } from "../../middlewares/validate.js";
import { orderIdSchema } from "../orders/orders.validation.js";
import { deliveryAgentApplicationSchema, deliveryAgentAvailabilitySchema, deliveryAgentPayoutDetailsSchema, deliveryCompletionOrderParamsSchema, deliveryCompletionOtpSchema } from "./delivery-agent.validation.js";

const router = express.Router();

// All delivery agent application routes require user authentication
router.use(authenticate);

// 1. Get current applicant's delivery agent registration and application status
router.get("/application", getMyDeliveryAgentApplication);

// Panel access is checked against the current active user and approved profile.
router.get("/panel", requireApprovedDeliveryAgent, getDeliveryAgentPanelAccess);
router.patch(
  "/availability",
  requireApprovedDeliveryAgent,
  validate(deliveryAgentAvailabilitySchema),
  updateDeliveryAgentAvailability
);
router.get("/deliveries/available", requireApprovedDeliveryAgent, listAvailableDeliveries);
router.post("/deliveries/:orderId/claim", requireApprovedDeliveryAgent, claimDelivery);
router.get("/deliveries/current", requireApprovedDeliveryAgent, listCurrentDeliveries);
router.post("/deliveries/:orderId/pickup", requireApprovedDeliveryAgent, markDeliveryPickedUp);
router.post("/deliveries/:orderId/completion-otp", requireApprovedDeliveryAgent, validate(deliveryCompletionOrderParamsSchema), requestDeliveryCompletionOtp);
router.get("/deliveries/:orderId/completion-otp", requireApprovedDeliveryAgent, validate(deliveryCompletionOrderParamsSchema), getDeliveryCompletionOtpStatus);
router.post("/deliveries/:orderId/complete", requireApprovedDeliveryAgent, validate(deliveryCompletionOtpSchema), markDeliveryCompleted);
router.post("/deliveries/:id/collect-cod", requireApprovedDeliveryAgent, validate(orderIdSchema), confirmCodCollection);
router.get("/deliveries/history", requireApprovedDeliveryAgent, listDeliveryHistory);
router.get("/earnings", requireApprovedDeliveryAgent, getDeliveryEarnings);
router.post(
  "/payout-details",
  requireApprovedDeliveryAgent,
  validate(deliveryAgentPayoutDetailsSchema),
  submitDeliveryAgentPayoutDetails,
);

// 2. Submit or resubmit delivery agent registration with uploaded documents
router.post(
  "/application",
  documentUpload.fields([
    { name: "identityProof", maxCount: 1 },
    { name: "drivingLicense", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "addressProof", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
  ]),
  validateUploadedFileContent,
  validate(deliveryAgentApplicationSchema),
  submitDeliveryAgentApplication
);

// 3. Secure document download/viewing (accessible only by document owner or admin)
router.get("/documents/:id", getSecureDocument);

export default router;
