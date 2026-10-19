import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createReviewsService } from "./reviews.service.js";

const service = createReviewsService(prisma);

export const listPendingReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Eligible reviews retrieved", await service.listPending(req.user.id, req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const listMyReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Your reviews retrieved", await service.listMine(req.user.id, req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const createCustomerReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.CREATED, "Thank you. Your review helps other customers.", await service.create(req.user.id, req.body)); }
  catch (error) { return next(error); }
};
export const updateCustomerReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Review updated", await service.update(req.user.id, req.params.id, req.body)); }
  catch (error) { return next(error); }
};
export const listDishReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Dish reviews retrieved", await service.publicDishReviews(req.params.id, req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const listCookPublicReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Cook reviews retrieved", await service.publicCookReviews(req.params.id, req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const getPublicCookProfile = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Cook profile retrieved", await service.publicCookProfile(req.params.id)); }
  catch (error) { return next(error); }
};
export const listCookReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Your reviews retrieved", await service.listForCook(req.user.cookProfile.id, req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const replyToReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Reply saved", await service.reply(req.user.cookProfile.id, req.params.id, req.body.reply)); }
  catch (error) { return next(error); }
};
export const reportReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.CREATED, "Review reported for moderation", await service.report(req.user.cookProfile.id, req.params.id, req.body.reason)); }
  catch (error) { return next(error); }
};
export const listReportedReviews = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Reported reviews retrieved", await service.listReported(req.validatedQuery)); }
  catch (error) { return next(error); }
};
export const moderateReportedReview = async (req, res, next) => {
  try { return sendSuccess(res, HTTP_STATUS.OK, "Review moderation saved", await service.moderate(req.user.id, req.params.id, req.body)); }
  catch (error) { return next(error); }
};
