import { z } from "zod";

export const favoriteDishParamsSchema = {
  params: z.object({
    dishId: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Dish ID contains invalid characters"),
  }).strict(),
};
