import express from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCustomerOrderAccess } from "./orders.auth.js";
import { cancelCustomerOrder, confirmCustomerOrderReceived, getCheckoutSummary, getCustomerOrder, hideCustomerOrderFromHistory, listCustomerOrders, placeOrder } from "./orders.controller.js";
import { checkoutSummarySchema, orderIdSchema, placeOrderSchema } from "./orders.validation.js";

const router = express.Router();
router.use(authenticate, requireCustomerOrderAccess);
router.get("/checkout/summary", validate(checkoutSummarySchema), getCheckoutSummary);
router.post("/", validate(placeOrderSchema), placeOrder);
router.post("/:id/cancel", validate(orderIdSchema), cancelCustomerOrder);
router.post("/:id/receipt-confirmation", validate(orderIdSchema), confirmCustomerOrderReceived);
router.post("/:id/hide", validate(orderIdSchema), hideCustomerOrderFromHistory);
router.get("/", listCustomerOrders);
router.get("/:id", validate(orderIdSchema), getCustomerOrder);

export default router;
