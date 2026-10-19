import prisma from "../../config/prisma.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { createCustomerEventsService } from "./customer-events.service.js";
import { createDineBookingsService } from "./dine-bookings.service.js";
import { createDineCancellationsService } from "./dine-cancellations.service.js";
import { createDinePaymentsService } from "./dine-payments.service.js";

const service = createCustomerEventsService(prisma);
const dineBookings = createDineBookingsService(prisma);
const dineCancellations = createDineCancellationsService(prisma);
const dinePayments = createDinePaymentsService(prisma);

export const listMyEventBookings = async (req, res, next) => {
  try {
    const data = await service.listMyBookings(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Your event bookings retrieved successfully", data);
  } catch (error) { next(error); }
};

const listMyBookingsOfType = async (req, res, next, experienceType) => {
  try {
    const data = await service.listMyBookings(req.user.id, experienceType);
    return sendSuccess(res, HTTP_STATUS.OK, "Your event bookings retrieved successfully", data);
  } catch (error) { next(error); }
};

export const listMyDineBookings = (req, res, next) => listMyBookingsOfType(req, res, next, "HOME_DINING");
export const listMyWorkshopBookings = (req, res, next) => listMyBookingsOfType(req, res, next, "WORKSHOP");

export const createMyDineBooking = async (req, res, next) => {
  try {
    const data = await dineBookings.createBooking(req.user.id, req.body);
    return sendSuccess(res, HTTP_STATUS.CREATED, "Experience booking request created", data);
  } catch (error) { next(error); }
};

export const cancelMyDineBooking = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await dineCancellations.requestCancellation(req.user.id, req.params.id, reason);
    return sendSuccess(res, HTTP_STATUS.OK, "Cancellation request submitted and awaiting Cook review.", result);
  } catch (error) { next(error); }
};

export const initiateMyDineBookingPayment = async (req, res, next) => {
  try {
    const result = await dinePayments.initiatePayment(req.user.id, req.params.id, req.body.idempotencyKey);
    const status = result.reused ? HTTP_STATUS.OK : HTTP_STATUS.CREATED;
    return sendSuccess(
      res,
      status,
      result.simulated
        ? "Simulated Dine payment attempt created; payment is not confirmed"
        : "Dine payment attempt created",
      result,
    );
  } catch (error) { next(error); }
};

export const confirmMyDineBookingPayment = async (req, res, next) => {
  try {
    const result = await dinePayments.confirmPayment(
      req.user.id,
      req.params.id,
      req.params.attemptId,
      req.body.mockOutcome,
    );
    const succeeded = result.paymentAttempt.status === "SUCCEEDED";
    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      succeeded ? "Simulated Dine payment confirmed; booking confirmed" : "Simulated Dine payment failure recorded",
      result,
    );
  } catch (error) { next(error); }
};
