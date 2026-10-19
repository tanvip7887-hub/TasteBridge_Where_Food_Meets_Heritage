import { isValidDeliveryAgentPayoutDetails } from "./delivery-agent.validation.js";

const DELIVERY_MODES_REQUIRING_VEHICLE_DOCUMENTS = new Set(["TWO_WHEELER"]);

const latestDocumentFor = (documents = [], documentType) => documents
  .filter((document) => document.documentType === documentType)
  .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)
    || String(right.id).localeCompare(String(left.id)))[0] || null;

const documentIsApproved = (document, now) => Boolean(
  document
  && document.verificationStatus === "APPROVED"
  && (!document.expiryDate || new Date(document.expiryDate) > now),
);

/**
 * Return the delivery work requirements from the newest document of each type.
 * A pending replacement therefore cannot inherit an older document's approval.
 */
export const getDeliveryAgentReadiness = (agent, now = new Date()) => {
  const requirements = [];
  const user = agent?.user;
  const addRequirement = (id, label, complete, action, href) => requirements.push({
    id, label, complete: Boolean(complete), action, href,
  });

  addRequirement(
    "active-account",
    "Active delivery-agent account",
    user?.status === "ACTIVE" && agent?.verificationStatus === "APPROVED",
    "Your account must be active with delivery-agent access.",
    "/become-a-delivery-agent",
  );
  addRequirement(
    "approved-profile",
    "Delivery-agent profile approved",
    agent?.verificationStatus === "APPROVED",
    "Wait for TasteBridge to approve your delivery-agent profile.",
    "/become-a-delivery-agent",
  );

  const documents = user?.verificationDocuments || agent?.verificationDocuments || [];
  const identity = latestDocumentFor(documents, "IDENTITY_PROOF");
  addRequirement(
    "identity-document",
    "Identity document approved",
    documentIsApproved(identity, now),
    identity ? "Your latest identity document must be approved and unexpired." : "Upload an identity document for review.",
    "/become-a-delivery-agent",
  );

  const deliveryType = agent?.deliveryType || "TWO_WHEELER";
  if (DELIVERY_MODES_REQUIRING_VEHICLE_DOCUMENTS.has(deliveryType)) {
    const vehicleRegistration = latestDocumentFor(documents, "VEHICLE_REGISTRATION");
    addRequirement(
      "vehicle-registration",
      "Vehicle registration approved",
      documentIsApproved(vehicleRegistration, now),
      vehicleRegistration ? "Your latest vehicle registration document must be approved and unexpired." : "Upload your vehicle registration document for review.",
      "/become-a-delivery-agent",
    );

    const drivingLicense = latestDocumentFor(documents, "DRIVING_LICENSE");
    addRequirement(
      "driving-license",
      "Driving licence approved",
      documentIsApproved(drivingLicense, now),
      drivingLicense ? "Your latest driving licence must be approved and unexpired." : "Upload your driving licence for review.",
      "/become-a-delivery-agent",
    );
  }

  // Only an admin-approved UPI payout destination unlocks delivery work.
  const payout = agent?.payoutDetails;
  const payoutComplete = isValidDeliveryAgentPayoutDetails(payout);
  const paymentDetailsApproved = payout?.verificationStatus === "APPROVED" && payoutComplete;
  const payoutAction = payout?.verificationStatus === "PENDING" && payoutComplete
    ? "Your payout details are awaiting admin approval."
    : payout?.verificationStatus === "REJECTED"
      ? `Your payout details were rejected${payout.rejectionReason ? `: ${payout.rejectionReason}` : ""}. Update your UPI ID and account holder name, then resubmit.`
      : payout?.verificationStatus === "PENDING"
        ? "Complete your UPI ID and account holder name so your payout details can be reviewed."
        : payout?.verificationStatus === "APPROVED" && !payoutComplete
          ? "Update your UPI ID and account holder name. The updated details will need admin review."
          : "Submit your UPI ID and account holder name so TasteBridge can review your delivery-fee payment details.";
  addRequirement(
    "payment-details",
    "Payout details approved",
    paymentDetailsApproved,
    paymentDetailsApproved ? "Payout details are approved." : payoutAction,
    "/delivery-agent/profile#payment-details",
  );

  const pendingRequirements = requirements.filter((requirement) => !requirement.complete);
  return { readyToWork: pendingRequirements.length === 0, requirements, pendingRequirements };
};

export const isReadyToWork = (agent, now = new Date()) => getDeliveryAgentReadiness(agent, now).readyToWork;

export default isReadyToWork;
