import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { requireCustomerOrderAccess } from "../orders/orders.auth.js";
import {
  confirmMyDineBookingPayment,
  cancelMyDineBooking,
  createMyDineBooking,
  initiateMyDineBookingPayment,
  listMyEventBookings,
  listMyDineBookings,
  listMyWorkshopBookings,
} from "./customer-events.controller.js";
import { validate } from "../../middlewares/validate.js";
import { cancelDineBookingSchema, confirmDinePaymentSchema, createDineBookingSchema, initiateDinePaymentSchema } from "./dine-bookings.validation.js";

const router = Router();
router.use(authenticate, requireCustomerOrderAccess);
router.post("/bookings", validate(createDineBookingSchema), createMyDineBooking);
router.post("/bookings/:id/cancel", validate(cancelDineBookingSchema), cancelMyDineBooking);
router.post("/bookings/:id/payment-attempts", validate(initiateDinePaymentSchema), initiateMyDineBookingPayment);
router.post("/bookings/:id/payment-attempts/:attemptId/confirm", validate(confirmDinePaymentSchema), confirmMyDineBookingPayment);
router.get("/my-bookings", listMyEventBookings);
router.get("/my-bookings/dine", listMyDineBookings);
router.get("/my-bookings/workshops", listMyWorkshopBookings);

export default router;
