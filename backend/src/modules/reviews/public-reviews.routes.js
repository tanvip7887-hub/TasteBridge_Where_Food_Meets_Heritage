import { Router } from "express";
import { validate } from "../../middlewares/validate.js";
import {
  getPublicCookProfile,
  listCookPublicReviews,
  listDishReviews,
} from "./reviews.controller.js";
import { publicReviewsSchema, reviewIdSchema } from "./reviews.validation.js";

const RESERVED_COOK_ROUTES = new Set([
  "application",
  "kitchen",
  "dashboard",
  "earnings",
  "orders",
  "experiences",
  "dishes",
  "notifications",
  "documents",
  "reviews",
  "experience-bookings",
  "welcome",
  "fssai-document",
]);

const router = Router();

router.get("/dishes/:id/reviews", validate(publicReviewsSchema), listDishReviews);
router.get("/cooks/:id/reviews", validate(publicReviewsSchema), listCookPublicReviews);
router.get(
  "/cooks/:id",
  (req, res, next) => {
    if (RESERVED_COOK_ROUTES.has(req.params.id)) {
      return next("router");
    }
    return validate(reviewIdSchema)(req, res, next);
  },
  getPublicCookProfile
);

export default router;
