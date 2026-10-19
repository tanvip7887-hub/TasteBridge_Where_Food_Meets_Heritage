import { z } from "zod";
import { PAGINATION } from "../../constants/index.js";

const positiveInteger = (maximum) => z.string()
  .regex(/^[1-9]\d*$/, "Must be a positive integer")
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= maximum, {
    message: `Must be no greater than ${maximum}`,
  });

const optionalInstant = z.string().datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

const optionalText = (maximum) => z.string().trim().min(1).max(maximum).optional();

export const publicExperienceListQuerySchema = {
  query: z.object({
    type: z.enum(["HOME_DINING", "WORKSHOP"]).optional(),
    cuisine: optionalText(120),
    dietary: optionalText(200),
    vegetarian: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
    location: optionalText(250),
    startsAfter: optionalInstant,
    startsBefore: optionalInstant,
    sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
    page: positiveInteger(1_000_000).default(PAGINATION.DEFAULT_PAGE),
    limit: positiveInteger(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  }).strict().refine(
    ({ startsAfter, startsBefore }) => !startsAfter || !startsBefore || startsBefore > startsAfter,
    { message: "startsBefore must be later than startsAfter", path: ["startsBefore"] },
  ),
};

export const publicExperienceIdParamsSchema = {
  params: z.object({
    id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  }),
};
