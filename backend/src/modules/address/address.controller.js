import { addressService } from "./address.service.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export const listAddresses = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Addresses retrieved successfully", await addressService.list(req.user.id));
  } catch (error) { next(error); }
};

export const getDefaultAddress = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Default address retrieved successfully", await addressService.getDefault(req.user.id));
  } catch (error) { next(error); }
};

export const createAddress = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.CREATED, "Address created successfully", await addressService.create(req.user.id, req.body));
  } catch (error) { next(error); }
};

export const updateAddress = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Address updated successfully", await addressService.update(req.user.id, req.params.id, req.body));
  } catch (error) { next(error); }
};

export const setDefaultAddress = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Default address updated successfully", await addressService.setDefault(req.user.id, req.params.id));
  } catch (error) { next(error); }
};

export const deleteAddress = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Address deleted successfully", await addressService.remove(req.user.id, req.params.id));
  } catch (error) { next(error); }
};
