import express from "express";
import prisma from "../../config/prisma.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { validate } from "../../middlewares/validate.js";
import {
  getPublicDishById,
  getPublicDishes,
  getPublicDishesForCategory,
} from "./category.service.js";
import {
  publicDishIdParamsSchema,
  publicDishListQuerySchema,
} from "./marketplace.validation.js";

const router = express.Router();
export const publicDishRouter = express.Router();

/**
 * GET /api/v1/dishes
 * Public, orderable marketplace dish discovery with bounded pagination.
 */
publicDishRouter.get("/", validate(publicDishListQuerySchema), async (req, res, next) => {
  try {
    const data = await getPublicDishes(prisma, req.validatedQuery);
    return sendSuccess(res, HTTP_STATUS.OK, "Public dishes retrieved successfully", data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/dishes/:id
 * Public detail for an eligible, orderable dish only.
 */
publicDishRouter.get("/:id", validate(publicDishIdParamsSchema), async (req, res, next) => {
  try {
    const dish = await getPublicDishById(prisma, req.params.id);
    if (!dish) throw new AppError("Dish not found", HTTP_STATUS.NOT_FOUND);
    return sendSuccess(res, HTTP_STATUS.OK, "Public dish retrieved successfully", dish);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/categories
 * Public endpoint to retrieve active regional food categories for customer discovery
 */
router.get("/", async (req, res, next) => {
  try {
    const categories = await prisma.foodCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        image: true,
        isActive: true,
      },
    });

    return sendSuccess(res, HTTP_STATUS.OK, "Food categories retrieved successfully", categories);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/categories/:id/dishes
 * Public endpoint to retrieve orderable dishes under a specific category
 * Enforces: status === PUBLISHED, isAvailable === true, availableQuantity > 0
 */
router.get("/:id/dishes", async (req, res, next) => {
  try {
    const publicDishes = await getPublicDishesForCategory(prisma, req.params.id);

    return sendSuccess(res, HTTP_STATUS.OK, "Category dishes retrieved successfully", publicDishes);
  } catch (err) {
    next(err);
  }
});

export default router;
