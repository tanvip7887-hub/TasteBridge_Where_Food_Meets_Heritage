import multer from "multer";
import { AppError } from "./AppError.js";
import { HTTP_STATUS } from "../constants/index.js";

export const SOCIAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SOCIAL_VIDEO_MAX_BYTES = 25 * 1024 * 1024;
export const SOCIAL_VIDEO_MAX_DURATION_SECONDS = 60;

const videoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const videoFileFilter = (_req, file, callback) => {
  if (!videoMimeTypes.has(file.mimetype)) {
    return callback(new AppError("Choose an MP4, QuickTime, or WebM video.", HTTP_STATUS.BAD_REQUEST));
  }
  return callback(null, true);
};

export const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: { fileSize: SOCIAL_VIDEO_MAX_BYTES, files: 1 },
});

export const hasValidSocialVideoSignature = (mimeType, buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === "video/webm") {
    return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (mimeType === "video/mp4" || mimeType === "video/quicktime") {
    return buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  return false;
};

export const validateSocialVideoContent = (req, _res, next) => {
  if (!req.file) return next(new AppError("Choose a video to upload.", HTTP_STATUS.BAD_REQUEST));
  if (req.file.size > SOCIAL_VIDEO_MAX_BYTES || !hasValidSocialVideoSignature(req.file.mimetype, req.file.buffer)) {
    return next(new AppError("The video contents do not match a supported video format or exceed the size limit.", HTTP_STATUS.BAD_REQUEST));
  }
  return next();
};
