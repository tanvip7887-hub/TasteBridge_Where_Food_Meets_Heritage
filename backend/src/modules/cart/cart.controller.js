import { cartService } from "./cart.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";

export const getCart = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Cart retrieved successfully", await cartService.getCart(req.user.id));
  } catch (error) { next(error); }
};

export const addCartItem = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Dish added to cart", await cartService.addItem(req.user.id, req.body));
  } catch (error) { next(error); }
};

export const updateCartItem = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Cart quantity updated", await cartService.updateItem(req.user.id, req.params.itemId, req.body.quantity));
  } catch (error) { next(error); }
};

export const removeCartItem = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Cart item removed", await cartService.removeItem(req.user.id, req.params.itemId));
  } catch (error) { next(error); }
};
