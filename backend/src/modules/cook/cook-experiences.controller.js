import prisma from "../../config/prisma.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { createCookExperiencesService } from "./cook-experiences.service.js";

const service = createCookExperiencesService(prisma);
const run = (handler, status = HTTP_STATUS.OK, message = "Cook experiences updated successfully") => async (req, res, next) => {
  try {
    const data = await handler(req);
    return sendSuccess(res, status, message, data);
  } catch (error) { return next(error); }
};

export const listMyExperiences = run((req) => service.list(req.user.cookProfile.id));
export const createMyExperience = run((req) => service.createDraft(req.user.cookProfile.id, req.body), HTTP_STATUS.CREATED, "Experience draft created");
export const publishNewMyExperience = async (req, res, next) => {
  try {
    const data = await service.publishNew(req.user.cookProfile.id, req.body, req.file);
    const message = req.body.type === "WORKSHOP" ? "Workshop submitted for Admin review" : "Experience published";
    return sendSuccess(res, HTTP_STATUS.CREATED, message, data);
  } catch (error) { return next(error); }
};
export const updateMyExperience = run((req) => service.updateDraft(req.user.cookProfile.id, req.params.id, req.body));
export const publishMyExperience = run((req) => service.publish(req.user.cookProfile.id, req.params.id));
export const pauseMyExperience = run((req) => service.pause(req.user.cookProfile.id, req.params.id));
export const uploadMyExperiencePhoto = run((req) => service.uploadPhoto(req.user.cookProfile.id, req.params.id, req.file));
export const replaceMyWorkshopPhoto = run((req) => service.replaceWorkshopPhoto(req.user.cookProfile.id, req.params.id, req.file));
export const removeMyWorkshopPhoto = run((req) => service.removeWorkshopPhoto(req.user.cookProfile.id, req.params.id));
export const listMyExperienceSlots = run((req) => service.listSlots(req.user.cookProfile.id, req.params.id));
export const createMyExperienceSlot = run((req) => service.createSlot(req.user.cookProfile.id, req.params.id, req.body), HTTP_STATUS.CREATED, "Experience slot created");
export const updateMyExperienceSlot = run((req) => service.updateSlot(req.user.cookProfile.id, req.params.id, req.params.slotId, req.body));
export const cancelMyExperienceSlot = run((req) => service.cancelSlot(req.user.cookProfile.id, req.params.id, req.params.slotId));
