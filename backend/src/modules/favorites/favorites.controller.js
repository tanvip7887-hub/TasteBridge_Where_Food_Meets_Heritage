import prisma from "../../config/prisma.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { createFavoritesService } from "./favorites.service.js";

const service = createFavoritesService(prisma);

export const listFavorites = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Favorites retrieved successfully", await service.list(req.user.id));
  } catch (error) { next(error); }
};

export const addFavorite = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Dish added to favorites", await service.add(req.user.id, req.params.dishId));
  } catch (error) { next(error); }
};

export const removeFavorite = async (req, res, next) => {
  try {
    return sendSuccess(res, HTTP_STATUS.OK, "Dish removed from favorites", await service.remove(req.user.id, req.params.dishId));
  } catch (error) { next(error); }
};
