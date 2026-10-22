import path from "path";
import fs from "fs";
import { deliveryAgentService } from "./delivery-agent.service.js";
import { UPLOAD_DIRECTORY } from "../../utils/fileUpload.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { AppError } from "../../utils/AppError.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { getPrivateDocumentFormat } from "../../utils/privateDocumentFormat.js";

/**
 * GET /api/v1/delivery-agents/application
 * Get authenticated user's delivery agent application status and details
 */
export const getMyDeliveryAgentApplication = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.getDeliveryAgentApplication(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery agent application details retrieved", data);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/delivery-agents/panel
 * The route's requireApprovedDeliveryAgent middleware authorizes panel entry.
 */
export const getDeliveryAgentPanelAccess = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.getPanelDashboard(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery agent dashboard retrieved", data);
  } catch (err) {
    next(err);
  }
};

export const updateDeliveryAgentAvailability = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.updateAvailability(req.user.id, req.body.isAvailable);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery-agent availability updated", data);
  } catch (err) {
    next(err);
  }
};

const deliveryWorkHandler = (serviceMethod, message, status = HTTP_STATUS.OK) => async (req, res, next) => {
  try {
    const data = await deliveryAgentService[serviceMethod](req.user.id, req.params.orderId);
    return sendSuccess(res, status, message, data);
  } catch (err) {
    next(err);
  }
};

export const listAvailableDeliveries = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.listAvailableDeliveries(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Available deliveries retrieved", data);
  } catch (err) { next(err); }
};

export const claimDelivery = deliveryWorkHandler("claimDelivery", "Delivery claimed successfully", HTTP_STATUS.OK);
export const listCurrentDeliveries = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.listCurrentDeliveries(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Current deliveries retrieved", data);
  } catch (err) { next(err); }
};
export const markDeliveryPickedUp = deliveryWorkHandler("markDeliveryPickedUp", "Delivery marked as out for delivery");
export const requestDeliveryCompletionOtp = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.requestDeliveryCompletionOtp(req.user.id, req.params.orderId);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery verification email requested", data);
  } catch (err) { next(err); }
};
export const getDeliveryCompletionOtpStatus = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.getDeliveryCompletionOtpStatus(req.user.id, req.params.orderId);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery verification email status retrieved", data);
  } catch (err) { next(err); }
};
export const markDeliveryCompleted = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.markDeliveryCompleted(req.user.id, req.params.orderId, req.body.otp);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery marked as delivered", data);
  } catch (err) { next(err); }
};
export const confirmCodCollection = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.confirmCodCollection(req.user.id, req.params.id);
    return sendSuccess(res, HTTP_STATUS.OK, "COD collection recorded", data);
  } catch (err) { next(err); }
};
export const listDeliveryHistory = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.listDeliveryHistory(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Delivery history retrieved", data);
  } catch (err) { next(err); }
};
export const getDeliveryEarnings = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.getDeliveryEarnings(req.user.id);
    return sendSuccess(res, HTTP_STATUS.OK, "Accrued delivery fees retrieved", data);
  } catch (err) { next(err); }
};

export const submitDeliveryAgentPayoutDetails = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.submitPayoutDetails(
      req.user.id,
      req.body.upiId,
      req.body.accountHolderName,
    );
    return sendSuccess(res, HTTP_STATUS.CREATED, "Payout details submitted. They are awaiting admin approval.", data);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/delivery-agents/application
 * Submit or resubmit delivery agent registration with multipart documents
 */
export const submitDeliveryAgentApplication = async (req, res, next) => {
  try {
    const data = await deliveryAgentService.submitDeliveryAgentApplication(
      req.user.id,
      req.body,
      req.files
    );
    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      "Delivery partner registration submitted successfully. Our operations team will review your application.",
      data
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/delivery-agents/documents/:id
 * Securely stream a private verification document to owner or admin
 */
export const getSecureDocument = async (req, res, next) => {
  try {
    const doc = await deliveryAgentService.getDocumentById(req.params.id, req.user);

    // 1. Cloudinary Private Document Streaming
    if (doc.cloudinaryPublicId) {
      const format = getPrivateDocumentFormat(doc);
      if (!format) {
        throw new AppError("This verification document format cannot be previewed.", HTTP_STATUS.UNPROCESSABLE_ENTITY);
      }
      const resourceType = doc.resourceType || (format === "pdf" ? "raw" : "image");

      const downloadUrl = cloudinaryService.generatePrivateDocumentDownloadUrl(
        doc.cloudinaryPublicId,
        resourceType,
        format,
        900 // 15 minute token validity
      );

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new AppError("Failed to retrieve document from cloud storage.", HTTP_STATUS.BAD_GATEWAY);
      }

      let mimeType = doc.mimeType;
      if (!mimeType) {
        const ext = (doc.fileName || "").toLowerCase().split(".").pop();
        if (ext === "pdf") mimeType = "application/pdf";
        else if (ext === "png") mimeType = "image/png";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "webp") mimeType = "image/webp";
      }

      if (mimeType) {
        res.setHeader("Content-Type", mimeType);
      }
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.fileName || "document")}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }

    // 2. Legacy Local File Fallback (Ensures backward compatibility)
    let filePath = path.isAbsolute(doc.documentUrl)
      ? doc.documentUrl
      : path.resolve(UPLOAD_DIRECTORY, path.basename(doc.documentUrl));

    if (!fs.existsSync(filePath)) {
      filePath = path.resolve(process.cwd(), doc.documentUrl);
    }

    if (!fs.existsSync(filePath)) {
      throw new AppError("The requested document file could not be found.", HTTP_STATUS.NOT_FOUND);
    }

    return res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};
