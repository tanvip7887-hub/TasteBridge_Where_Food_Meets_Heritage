import { z } from "zod";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const initiateOnlineCheckoutSchema = {
  body: z.object({
    addressId: recordId,
    idempotencyKey: z.string().uuid(),
  }).strict(),
};

export const paymentAttemptIdSchema = { params: z.object({ id: recordId }).strict() };

export const confirmPaymentAttemptSchema = {
  params: z.object({ id: recordId }).strict(),
  // This selects a demonstration scenario only. The backend provider maps it
  // to a simulated result; callers cannot submit a payment status or paid flag.
  body: z.preprocess((value) => value ?? {}, z.object({
    mockOutcome: z.enum(["SUCCESS", "FAILURE"]).optional(),
  }).strict()),
};
