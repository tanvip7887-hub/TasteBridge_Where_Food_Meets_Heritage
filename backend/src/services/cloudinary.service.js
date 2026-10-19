import { v2 as cloudinary } from "cloudinary";
import crypto from "crypto";
import env from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../constants/index.js";

// Initialize Cloudinary SDK
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const cloudinaryService = {
  /**
   * Check if Cloudinary credentials are fully configured
   */
  isConfigured() {
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
    );
  },

  /**
   * Health ping to verify Cloudinary connectivity
   */
  async ping() {
    if (!this.isConfigured()) {
      return { status: "unconfigured" };
    }
    return await cloudinary.api.ping();
  },

  /**
   * Upload private verification document (Aadhaar, FSSAI license, Address proof)
   * Stored in Cloudinary with access_mode / type: "authenticated"
   * to guarantee zero public URL exposure.
   */
  async uploadPrivateDocument({ fileBuffer, fileName, userId, documentType, mimeType }) {
    if (!this.isConfigured()) {
      throw new AppError(
        "Cloudinary storage is not configured. Please set Cloudinary credentials in environment.",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    if (!fileBuffer) {
      throw new AppError("No file buffer provided for upload.", HTTP_STATUS.BAD_REQUEST);
    }

    const isPdf =
      mimeType === "application/pdf" ||
      fileName.toLowerCase().endsWith(".pdf");

    // PDFs use "raw" resource type for reliable binary storage; images use "image"
    const resourceType = isPdf ? "raw" : "image";
    const cleanDocType = (documentType || "document").toLowerCase();
    const randomHex = crypto.randomBytes(6).toString("hex");
    const timestamp = Date.now();
    const publicId = `doc_${cleanDocType}_${timestamp}_${randomHex}${isPdf ? ".pdf" : ""}`;

    const uploadOptions = {
      folder: `tastebridge/verification_documents/${userId || "general"}`,
      type: "authenticated",
      resource_type: resourceType,
      public_id: publicId,
      overwrite: true,
      tags: ["tastebridge", "verification_document", cleanDocType],
      context: `alt=${fileName || "document"}|userId=${userId || ""}|documentType=${documentType || ""}`,
    };

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            return reject(
              new AppError(
                `Failed to upload document to Cloudinary: ${error.message}`,
                HTTP_STATUS.BAD_GATEWAY
              )
            );
          }
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            resourceType: result.resource_type,
            format: result.format || (isPdf ? "pdf" : "jpg"),
            bytes: result.bytes,
            version: result.version,
          });
        }
      );
      uploadStream.end(fileBuffer);
    });
  },

  /**
   * Generate short-lived signed download URL for private authenticated documents
   * Defaults to 15 minutes (900 seconds) expiration
   */
  generatePrivateDocumentDownloadUrl(publicId, resourceType = "image", format = "pdf", expiresInSeconds = 900) {
    if (!this.isConfigured()) {
      throw new AppError("Cloudinary storage is not configured.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.utils.private_download_url(publicId, format, {
      resource_type: resourceType,
      type: "authenticated",
      expires_at: expiresAt,
    });
  },

  /**
   * Reusable service to upload public marketplace images (dishes, cook profiles, category banners)
   */
  async uploadPublicMarketplaceImage({ fileBuffer, fileName, folder = "tastebridge/marketplace", tags = [] }) {
    if (!this.isConfigured()) {
      throw new AppError(
        "Cloudinary storage is not configured.",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    if (!fileBuffer) {
      throw new AppError("No image buffer provided for upload.", HTTP_STATUS.BAD_REQUEST);
    }

    const randomHex = crypto.randomBytes(6).toString("hex");
    const timestamp = Date.now();
    const publicId = `img_${timestamp}_${randomHex}`;

    const uploadOptions = {
      folder,
      type: "upload",
      resource_type: "image",
      public_id: publicId,
      overwrite: true,
      tags: ["tastebridge", "marketplace", ...tags],
    };

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            return reject(
              new AppError(
                `Failed to upload image to Cloudinary: ${error.message}`,
                HTTP_STATUS.BAD_GATEWAY
              )
            );
          }
          resolve({
            publicId: result.public_id,
            secureUrl: result.secure_url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );
      uploadStream.end(fileBuffer);
    });
  },

  /** Upload a validated public social video and return provider-derived metadata. */
  async uploadPublicSocialVideo({ fileBuffer, folder, tags = [] }) {
    if (!this.isConfigured()) {
      throw new AppError("Cloudinary storage is not configured.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
    if (!Buffer.isBuffer(fileBuffer) || !folder?.startsWith("tastebridge/social/")) {
      throw new AppError("A valid social video upload is required.", HTTP_STATUS.BAD_REQUEST);
    }

    const publicId = `video_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({
        folder,
        type: "upload",
        resource_type: "video",
        public_id: publicId,
        overwrite: false,
        tags: ["tastebridge", "social", ...tags],
      }, (error, result) => {
        if (error) {
          return reject(new AppError("Failed to upload video to Cloudinary.", HTTP_STATUS.BAD_GATEWAY));
        }
        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
          format: result.format,
          bytes: result.bytes,
          duration: result.duration,
          resourceType: result.resource_type,
        });
      });
      uploadStream.end(fileBuffer);
    });
  },

  /**
   * Delete asset from Cloudinary (works for both authenticated and upload assets)
   */
  async deleteCloudinaryAsset(publicId, resourceType = "image", type = "upload") {
    if (!this.isConfigured() || !publicId) {
      return { result: "skipped" };
    }

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type,
    });
  },
};

export default cloudinaryService;
