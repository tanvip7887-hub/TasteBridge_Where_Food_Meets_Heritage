import { z } from "zod";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const createDineBookingSchema = {
  body: z.object({
    experienceId: recordId,
    slotId: recordId,
    numberOfGuests: z.number().int().min(1).max(3),
    idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
  }).strict(),
};

export const initiateDinePaymentSchema = {
  params: z.object({ id: recordId }).strict(),
  body: z.object({ idempotencyKey: z.string().uuid() }).strict(),
};

export const confirmDinePaymentSchema = {
  params: z.object({ id: recordId, attemptId: recordId }).strict(),
  body: z.object({ mockOutcome: z.enum(["success", "failure"]) }).strict(),
};

export const cancelDineBookingSchema = {
  params: z.object({ id: recordId }).strict(),
  body: z.object({
    reason: z.string().trim().min(5, "Cancellation reason must be at least 5 characters.").max(500, "Cancellation reason cannot exceed 500 characters."),
  }).strict(),
};

export const cookRejectCancellationSchema = {
  params: z.object({ id: recordId }).strict(),
  body: z.object({
    rejectionReason: z.string().trim().max(500, "Rejection reason cannot exceed 500 characters.").optional(),
  }).strict(),
};
