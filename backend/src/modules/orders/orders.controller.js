import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { ordersService } from "./orders.service.js";

export const getCheckoutSummary = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Checkout summary retrieved successfully", await ordersService.getCheckoutSummary(req.user.id, req.validatedQuery.addressId || null));
  } catch (error) { next(error); }
};

export const placeOrder = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.CREATED, "Order placed successfully", await ordersService.placeOrder(req.user.id, req.body));
  } catch (error) { next(error); }
};

export const cancelCustomerOrder = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Checkout cancelled successfully", await ordersService.cancelCheckout(req.user.id, req.params.id));
  } catch (error) { next(error); }
};

export const confirmCustomerOrderReceived = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Order receipt confirmed", await ordersService.confirmOrderReceived(req.user.id, req.params.id));
  } catch (error) { next(error); }
};

export const hideCustomerOrderFromHistory = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Order hidden from your history", await ordersService.hideOrderFromHistory(req.user.id, req.params.id));
  } catch (error) { next(error); }
};

export const listCustomerOrders = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Orders retrieved successfully", { items: await ordersService.listOrders(req.user.id) });
  } catch (error) { next(error); }
};

export const getCustomerOrder = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Order retrieved successfully", await ordersService.getOrder(req.user.id, req.params.id));
  } catch (error) { next(error); }
};
