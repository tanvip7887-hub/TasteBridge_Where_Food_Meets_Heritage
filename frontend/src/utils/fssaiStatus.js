export const getCookFssaiStatus = (status, expiryDate, now = new Date()) =>
  status === "APPROVED" && expiryDate && new Date(expiryDate) <= now ? "EXPIRED" : (status || "NOT_SUBMITTED");

export const getCookFssaiStatusMessage = (status, expiryDate, rejectionReason, now = new Date()) => {
  const effectiveStatus = getCookFssaiStatus(status, expiryDate, now);
  const details = {
    NOT_SUBMITTED: ["Not submitted", "Submit your FSSAI details."],
    IN_PROCESS: ["In process", "Upload your certificate when it is available."],
    SUBMITTED: ["Submitted", "Waiting for admin review."],
    APPROVED: ["Approved", expiryDate ? `Certificate expires ${new Date(expiryDate).toLocaleDateString()}.` : "Your certificate is approved."],
    REJECTED: ["Rejected", rejectionReason ? `${rejectionReason} Upload a corrected certificate to resubmit.` : "Upload a corrected certificate to resubmit."],
    EXPIRED: ["Expired", "Upload a renewed certificate for review."],
  };
  return { status: effectiveStatus, label: details[effectiveStatus][0], nextAction: details[effectiveStatus][1] };
};
