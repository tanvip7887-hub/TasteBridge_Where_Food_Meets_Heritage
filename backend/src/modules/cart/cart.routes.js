import express from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCartCustomer } from "./cart.auth.js";
import { addCartItem, getCart, removeCartItem, updateCartItem } from "./cart.controller.js";
import { addCartItemSchema, removeCartItemSchema, updateCartItemSchema } from "./cart.validation.js";

const router = express.Router();
router.use(authenticate, requireCartCustomer);
router.get("/", getCart);
router.post("/items", validate(addCartItemSchema), addCartItem);
router.patch("/items/:itemId", validate(updateCartItemSchema), updateCartItem);
router.delete("/items/:itemId", validate(removeCartItemSchema), removeCartItem);

export default router;
