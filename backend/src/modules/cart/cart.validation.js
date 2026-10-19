import { z } from "zod";

export const MAX_CART_ITEM_QUANTITY = 99;

const cartItemIdParams = z.object({
  itemId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

const quantitySchema = z.number()
  .int("Quantity must be a whole number.")
  .min(1, "Quantity must be at least 1.")
  .max(MAX_CART_ITEM_QUANTITY, `Quantity cannot exceed ${MAX_CART_ITEM_QUANTITY}.`);

export const addCartItemSchema = {
  body: z.object({
    dishId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
    quantity: quantitySchema.default(1),
  }).strict(),
};

export const updateCartItemSchema = {
  params: cartItemIdParams,
  body: z.object({ quantity: quantitySchema }).strict(),
};

export const removeCartItemSchema = { params: cartItemIdParams };
