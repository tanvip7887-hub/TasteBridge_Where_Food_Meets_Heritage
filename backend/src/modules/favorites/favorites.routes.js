import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCartCustomer } from "../cart/cart.auth.js";
import { addFavorite, listFavorites, removeFavorite } from "./favorites.controller.js";
import { favoriteDishParamsSchema } from "./favorites.validation.js";

const router = Router();
router.use(authenticate, requireCartCustomer);
router.get("/", listFavorites);
router.post("/:dishId", validate(favoriteDishParamsSchema), addFavorite);
router.delete("/:dishId", validate(favoriteDishParamsSchema), removeFavorite);

export default router;
