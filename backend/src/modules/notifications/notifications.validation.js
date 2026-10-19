import { z } from "zod";

export const notificationListSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }).strict(),
};

export const notificationIdSchema = {
  params: z.object({
    id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Notification ID contains invalid characters"),
  }).strict(),
};
