import { z } from "zod";

const recordId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const checkoutSummarySchema = {
  query: z.object({ addressId: recordId.optional() }).strict(),
};

export const placeOrderSchema = {
  body: z.object({
    addressId: recordId,
    idempotencyKey: z.string().uuid(),
    paymentMethod: z.enum(["COD"]),
  }).strict(),
};

export const orderIdSchema = { params: z.object({ id: recordId }) };
