import { z } from "zod";
import { PAGINATION } from "../../constants/index.js";

const positiveIntegerQuery = (maximum) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, "Must be a positive integer")
    .transform(Number)
    .refine((value) => Number.isSafeInteger(value) && value <= maximum, {
      message: `Must be no greater than ${maximum}`,
    });

const categoryIdQuery = z
  .string()
  .trim()
  .min(1, "Category ID cannot be empty")
  .max(128, "Category ID is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Category ID contains invalid characters");

export const publicDishListQuerySchema = {
  query: z
    .object({
      search: z.string().trim().max(100, "Search must be 100 characters or fewer").optional(),
      categoryId: categoryIdQuery.optional(),
      sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
      page: positiveIntegerQuery(1_000_000).default(PAGINATION.DEFAULT_PAGE),
      limit: positiveIntegerQuery(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    })
    .strict(),
};

export const publicDishIdParamsSchema = {
  params: z.object({
    id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  }),
};
