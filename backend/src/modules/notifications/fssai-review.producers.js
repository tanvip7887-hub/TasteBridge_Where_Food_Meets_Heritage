import { createNotificationsService } from "./notifications.service.js";

export const fssaiReviewEventKey = ({ documentId, status, cookUserId }) =>
  `fssai:${documentId}:review:${status}:cook:${cookUserId}`;

export const notifyCookFssaiReview = async (transaction, {
  cookUserId,
  documentId,
  status,
  title,
  message,
}) => {
  if (!cookUserId || !documentId || !status || !title || !message) return;
  const eventKey = fssaiReviewEventKey({ documentId, status, cookUserId });
  return createNotificationsService(transaction).create({
    userId: cookUserId,
    portal: "COOK",
    type: "VERIFICATION_ALERT",
    title,
    message,
    metadata: { kind: "FSSAI_REVIEW", documentId, fssaiStatus: status, eventKey },
    eventKey,
  });
};
