import express from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCartCustomer } from "../cart/cart.auth.js";
import { cancelPaymentAttempt, confirmPaymentAttempt, getPaymentAttempt, initiateOnlineCheckout } from "./payments.controller.js";
import { confirmPaymentAttemptSchema, initiateOnlineCheckoutSchema, paymentAttemptIdSchema } from "./payments.validation.js";

const router = express.Router();
router.use(authenticate, requireCartCustomer);
router.post("/online-checkouts", validate(initiateOnlineCheckoutSchema), initiateOnlineCheckout);
router.get("/attempts/:id", validate(paymentAttemptIdSchema), getPaymentAttempt);
router.post("/attempts/:id/confirm", validate(confirmPaymentAttemptSchema), confirmPaymentAttempt);
router.post("/attempts/:id/cancel", validate(paymentAttemptIdSchema), cancelPaymentAttempt);

export default router;
