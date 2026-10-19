import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { requireCustomerOrderAccess } from "../orders/orders.auth.js";
import { createCustomerReview, listMyReviews, listPendingReviews, updateCustomerReview } from "./reviews.controller.js";
import { createReviewSchema, myReviewsSchema, pendingReviewsSchema, updateReviewSchema } from "./reviews.validation.js";

const router = Router();
router.use(authenticate, requireCustomerOrderAccess);
router.get("/pending", validate(pendingReviewsSchema), listPendingReviews);
router.get("/mine", validate(myReviewsSchema), listMyReviews);
router.post("/", validate(createReviewSchema), createCustomerReview);
router.patch("/:id", validate(updateReviewSchema), updateCustomerReview);
export default router;
