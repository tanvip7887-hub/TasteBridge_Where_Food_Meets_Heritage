import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createPublicSocialContentService } from "./public-social-content.service.js";
import { createSocialReportingService } from "./social-reporting.service.js";

export const createPublicSocialContentController = (database) => {
  const service = createPublicSocialContentService(database);
  const reporting = createSocialReportingService(database);
  return {
    listStories: async (req, res, next) => {
      try { return sendSuccess(res, HTTP_STATUS.OK, "Active Stories retrieved.", await service.listStoryGroups(req.validatedQuery)); }
      catch (error) { return next(error); }
    },
    listPosts: async (req, res, next) => {
      try { return sendSuccess(res, HTTP_STATUS.OK, "Posts retrieved.", await service.listPosts(req.validatedQuery)); }
      catch (error) { return next(error); }
    },
    createReport: async (req, res, next) => {
      try { return sendSuccess(res, HTTP_STATUS.CREATED, "Report submitted for review.", await reporting.createReport(req.user, req.body)); }
      catch (error) { return next(error); }
    },
  };
};

const controller = createPublicSocialContentController(prisma);
export const listPublicSocialStories = controller.listStories;
export const listPublicSocialPosts = controller.listPosts;
export const createSocialContentReport = controller.createReport;
