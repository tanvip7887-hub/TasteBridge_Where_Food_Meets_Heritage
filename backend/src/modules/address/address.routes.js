import express from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCartCustomer } from "../cart/cart.auth.js";
import {
  createAddress,
  deleteAddress,
  getDefaultAddress,
  listAddresses,
  setDefaultAddress,
  updateAddress,
} from "./address.controller.js";
import { addressIdSchema, createAddressSchema, updateAddressSchema } from "./address.validation.js";

const router = express.Router();
router.use(authenticate, requireCartCustomer);
router.get("/default", getDefaultAddress);
router.get("/", listAddresses);
router.post("/", validate(createAddressSchema), createAddress);
router.put("/:id/default", validate(addressIdSchema), setDefaultAddress);
router.patch("/:id", validate(updateAddressSchema), updateAddress);
router.delete("/:id", validate(addressIdSchema), deleteAddress);

export default router;
