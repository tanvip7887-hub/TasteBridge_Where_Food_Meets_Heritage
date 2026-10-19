import express from "express";
import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { validate } from "../../middlewares/validate.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import {
  publicExperienceIdParamsSchema,
  publicExperienceListQuerySchema,
} from "./public-experiences.validation.js";
import {
  createPublicExperiencesService,
  publicExperienceNotFound,
} from "./public-experiences.service.js";

export const createPublicExperiencesRouter = (database = prisma, options) => {
  const router = express.Router();
  const service = createPublicExperiencesService(database, options);

  router.get("/", validate(publicExperienceListQuerySchema), async (req, res, next) => {
    try {
      const data = await service.list(req.validatedQuery);
      return sendSuccess(res, HTTP_STATUS.OK, "Public experiences retrieved successfully", data);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", validate(publicExperienceIdParamsSchema), async (req, res, next) => {
    try {
      const experience = await service.getById(req.params.id);
      if (!experience) throw publicExperienceNotFound();
      return sendSuccess(res, HTTP_STATUS.OK, "Public experience retrieved successfully", experience);
    } catch (error) {
      return next(error);
    }
  });

  return router;
};

export default createPublicExperiencesRouter();
