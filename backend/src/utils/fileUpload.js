import multer from "multer";
import path from "path";
import { AppError } from "./AppError.js";
import { HTTP_STATUS } from "../constants/index.js";

// Legacy uploads directory path constant (retained for backward compatibility)
export const UPLOAD_DIRECTORY = path.resolve(process.cwd(), "uploads", "documents");

// Memory storage for streaming directly to Cloudinary
const memoryStorage = multer.memoryStorage();

// Document filter: only PDF, JPEG, JPG, PNG allowed for verification
const documentFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        "Invalid file type. Only PDF, JPG, JPEG, and PNG documents are accepted.",
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

// Image filter for future marketplace images (dishes, profile images)
const imageFileFilter = (req, file, cb) => {
  const allowedImageMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedImageMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        "Invalid image type. Only JPEG, JPG, PNG, and WebP images are accepted.",
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

export const hasValidFileSignature = (mimeType, buffer) => {
  if (!Buffer.isBuffer(buffer)) return false;

  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/webp") {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
};

export const validateUploadedFileContent = (req, res, next) => {
  const files = [
    ...(req.file ? [req.file] : []),
    ...Object.values(req.files || {}).flat(),
  ];

  const invalidFile = files.find((file) => !hasValidFileSignature(file.mimetype, file.buffer));
  if (invalidFile) {
    return next(
      new AppError(
        "Uploaded file contents do not match the declared file type.",
        HTTP_STATUS.BAD_REQUEST
      )
    );
  }
  return next();
};

// Document upload multer middleware (5MB limit, memory buffer)
export const documentUpload = multer({
  storage: memoryStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// General marketplace image upload multer middleware (5MB limit, memory buffer)
export const imageUpload = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

