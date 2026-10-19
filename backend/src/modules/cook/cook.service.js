import prisma from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { effectiveFssaiStatus, statusForFssaiDetails } from "../../utils/fssai.js";
import { getCookSellingReadiness } from "../../utils/cookReadiness.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import { getDishCustomerVisibility, isCookEligibleToSell } from "../../utils/marketplaceSecurity.js";
import { currencyNumber, normalizeCurrency, toPaise } from "../../utils/money.js";

const serializeCookDish = (dish) => ({ ...dish, price: currencyNumber(dish.price) });

export const markAllCookNotificationsReadForUser = async (database, userId) => {
  const result = await database.cookNotification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { updatedCount: result.count, unreadCount: 0 };
};

export const persistDishAndStoryUpdate = (database, { dishId, expectedStatus, updates, storyWrite }) =>
  database.$transaction(async (tx) => {
    if (expectedStatus) {
      const changed = await tx.dish.updateMany({
        where: { id: dishId, status: expectedStatus },
        data: Object.keys(updates).length ? updates : { updatedAt: new Date() },
      });
      if (changed.count !== 1) {
        throw new AppError("Dish status changed while you were editing. Refresh and try again.", HTTP_STATUS.CONFLICT);
      }
    }

    if (storyWrite?.type === "update") {
      await tx.dishStory.update({
        where: { id: storyWrite.id },
        data: storyWrite.data,
      });
    } else if (storyWrite?.type === "create") {
      await tx.dishStory.create({
        data: { dishId, ...storyWrite.data },
      });
    }

    return expectedStatus
      ? tx.dish.findUnique({ where: { id: dishId }, include: { category: true, story: true } })
      : tx.dish.update({ where: { id: dishId }, data: updates, include: { category: true, story: true } });
  });

export const assertCookMayPublishDish = (dish) => {
  const message = dish?.status === "PENDING_APPROVAL"
    ? "This dish is awaiting Admin approval and cannot be published by the Cook."
    : "Only an Admin can approve and publish a dish.";
  throw new AppError(message, HTTP_STATUS.FORBIDDEN);
};

export const assertCookMayCreateDishWithStatus = (status) => {
  if (status === "PUBLISHED") {
    throw new AppError("New dishes must be submitted for Admin approval before they can be published.", HTTP_STATUS.FORBIDDEN);
  }
};

const contentFields = [
  "name", "description", "cuisine", "categoryId", "price", "isVegetarian",
  "ingredients", "instructions", "prepTimeMinutes", "dietaryTags",
];

const sameDishValue = (field, next, current) => {
  if (field === "price") {
    try { return toPaise(next) === toPaise(current); } catch { return false; }
  }
  if (Array.isArray(next) || Array.isArray(current)) {
    return JSON.stringify(next) === JSON.stringify(current);
  }
  return next === current;
};

export const assertPublishedDishContentUnchanged = (dish, updates = {}, storyWrite = null) => {
  if (dish?.status !== "PUBLISHED") return;
  const changedContent = contentFields.some((field) =>
    Object.hasOwn(updates, field) && !sameDishValue(field, updates[field], dish[field])
  );
  const changedStory = storyWrite && (
    storyWrite.type === "create" ||
    Object.entries(storyWrite.data).some(([field, value]) => !sameDishValue(field, value, dish.story?.[field]))
  );
  if (changedContent || changedStory) {
    throw new AppError(
      "This Admin-approved dish cannot be changed directly. Its approved version remains available; contact Admin to request a reviewed update.",
      HTTP_STATUS.CONFLICT
    );
  }
};

export const persistFssaiDocumentSubmission = (database, { userId, cookProfileId, documentData }) =>
  database.$transaction(async (tx) => {
    await tx.verificationDocument.updateMany({
      where: { userId, documentType: "FSSAI_LICENSE", verificationStatus: "PENDING" },
      data: { verificationStatus: "NEEDS_REVISION", rejectionReason: "Replaced by a newer FSSAI document submission." },
    });
    const document = await tx.verificationDocument.create({ data: documentData });
    await tx.cookProfile.update({
      where: { id: cookProfileId },
      data: { fssaiStatus: "SUBMITTED", fssaiExpiryDate: null, isApprovedToSell: false, fssaiRejectionReason: null },
    });
    return document;
  });

// Helper to parse arrays from JSON strings or comma-separated lists
const parseArrayField = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Split comma separated
      return val.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [String(val)];
};

export const cookService = {
  /**
   * Get current applicant's cook profile and verification documents
   */
  async getCookApplication(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
    }

    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            verificationDocuments: {
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });

    const formattedApplication = cookProfile
      ? {
          ...cookProfile,
          fssaiStatus: effectiveFssaiStatus(cookProfile.fssaiStatus, cookProfile.fssaiExpiryDate),
          user: {
            ...cookProfile.user,
            verificationDocuments: (cookProfile.user?.verificationDocuments || []).map((d) => ({
              ...d,
              downloadUrl: `/api/v1/cooks/documents/${d.id}`,
            })),
          },
        }
      : null;

    return {
      userRole: user.role,
      hasApplication: Boolean(cookProfile),
      application: formattedApplication,
    };
  },

  /**
   * Submit or resubmit cook application with verification documents
   */
  async submitCookApplication(userId, applicationData, files = {}) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        cookProfile: true,
        verificationDocuments: true,
      },
    });

    if (!user) {
      throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
    }

    // Role check: If already approved COOK, prevent duplicate application
    if (user.cookProfile?.verificationStatus === "APPROVED") {
      throw new AppError(
        "You are already an approved cook on TasteBridge.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Duplicate check: If existing application is already PENDING review, prevent duplicate submission
    if (user.cookProfile && user.cookProfile.verificationStatus === "PENDING") {
      throw new AppError(
        "Your cook application is already under review by the TasteBridge curation team.",
        HTTP_STATUS.CONFLICT
      );
    }

    // Verify required government identity proof file
    const identityFile = files?.identityProof?.[0];
    const existingIdentityDoc = user.verificationDocuments.find(
      (d) => d.documentType === "IDENTITY_PROOF"
    );

    if (!identityFile && !existingIdentityDoc) {
      throw new AppError(
        "A government-issued identity proof document (Aadhaar, PAN, Voter ID, or Passport) is required.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Enforce Food Safety Agreement
    if (!applicationData.foodSafetyConsent) {
      throw new AppError(
        "You must agree to the Food Safety & Hygiene Agreement before submitting your application.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Update user's name or phone if provided
    const userUpdates = {};
    if (applicationData.fullName && applicationData.fullName.trim() !== user.name) {
      userUpdates.name = applicationData.fullName.trim();
    }
    if (applicationData.phone && applicationData.phone.trim() !== (user.phone || "")) {
      userUpdates.phone = applicationData.phone.trim();
    }
    if (Object.keys(userUpdates).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: userUpdates,
      });
    }

    // Format array values
    const cuisines = parseArrayField(applicationData.cuisines);
    const dietaryPreferences = parseArrayField(applicationData.dietaryPreferences);
    const availableDays = parseArrayField(applicationData.availableDays);
    const availableMealSlots = parseArrayField(applicationData.availableMealSlots);

    const submittedFssaiValue = applicationData.fssaiNumber ? applicationData.fssaiNumber.trim() : null;
    const fssaiNumber = applicationData.fssaiStatusType === "HAVE_REGISTRATION" ? submittedFssaiValue : null;
    const fssaiApplicationReference = applicationData.fssaiStatusType === "APPLIED_ON_FOSCOS"
      ? (applicationData.fssaiApplicationReference?.trim() || submittedFssaiValue)
      : null;
    const fssaiFile = files?.fssaiProof?.[0];

    // Build CookProfile data
    const cookProfilePayload = {
      businessName: applicationData.businessName.trim(),
      bio: applicationData.bio.trim(),
      specialization: applicationData.specialization.trim(),
      experienceYears: applicationData.experienceYears,
      cuisines,
      signatureDishes: applicationData.signatureDishes ? applicationData.signatureDishes.trim() : null,
      dietaryPreferences,
      city: applicationData.city.trim(),
      locality: applicationData.locality.trim(),
      serviceArea: applicationData.serviceArea ? applicationData.serviceArea.trim() : null,
      cookingCapacity: applicationData.cookingCapacity,
      availableDays,
      availableMealSlots,
      prepTimeNotice: applicationData.prepTimeNotice,
      isHomeKitchenDeclared: true,
      fssaiNumber,
      fssaiApplicationReference,
      fssaiStatusType: applicationData.fssaiStatusType || null,
      fssaiStatus: statusForFssaiDetails(applicationData.fssaiStatusType),
      fssaiRejectionReason: null,
      isApprovedToSell: false, // Selling is always blocked until FSSAI compliance is verified
      foodSafetyConsent: true,
      foodSafetyConsentAt: new Date(),
      foodSafetyAgreementVersion: applicationData.foodSafetyAgreementVersion || "v1.0",
      verificationStatus: "PENDING",
      revisionReason: null, // Clear any previous revision notes
      rejectionReason: null,
    };

    // Upsert CookProfile
    const cookProfile = await prisma.cookProfile.upsert({
      where: { userId },
      update: cookProfilePayload,
      create: {
        userId,
        ...cookProfilePayload,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            verificationDocuments: true,
          },
        },
      },
    });

    // Save Identity Proof document if newly uploaded
    if (identityFile) {
      // Find old pending identity document to clean up old asset
      const oldDoc = await prisma.verificationDocument.findFirst({
        where: { userId, documentType: "IDENTITY_PROOF", verificationStatus: "PENDING" },
      });
      if (oldDoc?.cloudinaryPublicId) {
        await cloudinaryService.deleteCloudinaryAsset(
          oldDoc.cloudinaryPublicId,
          oldDoc.resourceType || "raw",
          "authenticated"
        ).catch(() => {});
      }
      await prisma.verificationDocument.deleteMany({
        where: { userId, documentType: "IDENTITY_PROOF", verificationStatus: "PENDING" },
      });

      // Upload to Cloudinary private storage
      const uploadRes = await cloudinaryService.uploadPrivateDocument({
        fileBuffer: identityFile.buffer,
        fileName: identityFile.originalname,
        userId,
        documentType: "IDENTITY_PROOF",
        mimeType: identityFile.mimetype,
      });

      await prisma.verificationDocument.create({
        data: {
          userId,
          documentType: "IDENTITY_PROOF",
          documentUrl: uploadRes.secureUrl,
          cloudinaryPublicId: uploadRes.publicId,
          resourceType: uploadRes.resourceType,
          storageProvider: "CLOUDINARY",
          documentNumber: applicationData.identityDocumentNumber || null,
          fileName: identityFile.originalname,
          fileSize: identityFile.size,
          mimeType: identityFile.mimetype,
          verificationStatus: "PENDING",
        },
      });
    }

    // Save FSSAI document if uploaded
    if (fssaiFile) {
      const uploadRes = await cloudinaryService.uploadPrivateDocument({
        fileBuffer: fssaiFile.buffer,
        fileName: fssaiFile.originalname,
        userId,
        documentType: "FSSAI_LICENSE",
        mimeType: fssaiFile.mimetype,
      });

      try {
        await persistFssaiDocumentSubmission(prisma, {
          userId,
          cookProfileId: cookProfile.id,
          documentData: {
            userId,
            documentType: "FSSAI_LICENSE",
            documentUrl: uploadRes.secureUrl,
            cloudinaryPublicId: uploadRes.publicId,
            resourceType: uploadRes.resourceType,
            storageProvider: "CLOUDINARY",
            documentNumber: fssaiNumber,
            fileName: fssaiFile.originalname,
            fileSize: fssaiFile.size,
            mimeType: fssaiFile.mimetype,
            verificationStatus: "PENDING",
          },
        });
      } catch (error) {
        await cloudinaryService.deleteCloudinaryAsset(uploadRes.publicId, uploadRes.resourceType, "authenticated").catch(() => {});
        throw error;
      }
    }

    // Save Address Proof document if uploaded
    const addressFile = files?.addressProof?.[0];
    if (addressFile) {
      const oldAddress = await prisma.verificationDocument.findFirst({
        where: { userId, documentType: "ADDRESS_PROOF", verificationStatus: "PENDING" },
      });
      if (oldAddress?.cloudinaryPublicId) {
        await cloudinaryService.deleteCloudinaryAsset(
          oldAddress.cloudinaryPublicId,
          oldAddress.resourceType || "raw",
          "authenticated"
        ).catch(() => {});
      }
      await prisma.verificationDocument.deleteMany({
        where: { userId, documentType: "ADDRESS_PROOF", verificationStatus: "PENDING" },
      });

      const uploadRes = await cloudinaryService.uploadPrivateDocument({
        fileBuffer: addressFile.buffer,
        fileName: addressFile.originalname,
        userId,
        documentType: "ADDRESS_PROOF",
        mimeType: addressFile.mimetype,
      });

      await prisma.verificationDocument.create({
        data: {
          userId,
          documentType: "ADDRESS_PROOF",
          documentUrl: uploadRes.secureUrl,
          cloudinaryPublicId: uploadRes.publicId,
          resourceType: uploadRes.resourceType,
          storageProvider: "CLOUDINARY",
          fileName: addressFile.originalname,
          fileSize: addressFile.size,
          mimeType: addressFile.mimetype,
          verificationStatus: "PENDING",
        },
      });
    }

    // Create Platform Notification for Admins
    try {
      await prisma.platformNotification.create({
        data: {
          type: "VERIFICATION_ALERT",
          title: "New Cook Application Submitted",
          message: `${cookProfile.businessName} (${userUpdates.name || user.name}) submitted a new home kitchen verification application.`,
          metadata: {
            userId,
            cookProfileId: cookProfile.id,
            city: cookProfile.city,
            cuisines: cookProfile.cuisines,
          },
        },
      });
    } catch (e) {
      // Non-blocking notification creation
    }

    return await this.getCookApplication(userId);
  },

  /**
   * Secure document verification and retrieval
   */
  async getDocumentById(docId, requestingUser) {
    const doc = await prisma.verificationDocument.findUnique({
      where: { id: docId },
    });

    if (!doc) {
      throw new AppError("Document not found", HTTP_STATUS.NOT_FOUND);
    }

    // Security check: Only document owner or an authorized ADMIN can access
    const isOwner = doc.userId === requestingUser.id;
    const isAdmin = requestingUser.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      throw new AppError(
        "Unauthorized. You do not have permission to access this document.",
        HTTP_STATUS.FORBIDDEN
      );
    }

    return doc;
  },

  /**
   * Get authenticated cook's kitchen profile
   */
  async getKitchenProfile(userId) {
    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    if (!cookProfile) {
      throw new AppError("Cook kitchen profile not found.", HTTP_STATUS.NOT_FOUND);
    }

    return { ...cookProfile, fssaiStatus: effectiveFssaiStatus(cookProfile.fssaiStatus, cookProfile.fssaiExpiryDate) };
  },

  async submitFssaiDocument(userId, file) {
    if (!file?.buffer) {
      throw new AppError("Please select an FSSAI document to upload.", HTTP_STATUS.BAD_REQUEST);
    }
    const cookProfile = await prisma.cookProfile.findUnique({ where: { userId } });
    if (!cookProfile) throw new AppError("Cook profile not found.", HTTP_STATUS.NOT_FOUND);

    const upload = await cloudinaryService.uploadPrivateDocument({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      userId,
      documentType: "FSSAI_LICENSE",
      mimeType: file.mimetype,
    });
    try {
      return await persistFssaiDocumentSubmission(prisma, {
        userId,
        cookProfileId: cookProfile.id,
        documentData: {
            userId,
            documentType: "FSSAI_LICENSE",
            documentUrl: upload.secureUrl,
            cloudinaryPublicId: upload.publicId,
            resourceType: upload.resourceType,
            storageProvider: "CLOUDINARY",
            documentNumber: cookProfile.fssaiNumber,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            verificationStatus: "PENDING",
        },
      });
    } catch (error) {
      await cloudinaryService.deleteCloudinaryAsset(upload.publicId, upload.resourceType, "authenticated").catch(() => {});
      throw error;
    }
  },

  async getCookNotifications(userId) {
    const [notifications, unreadCount] = await Promise.all([
      prisma.cookNotification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.cookNotification.count({ where: { userId, isRead: false } }),
    ]);
    return { notifications, unreadCount };
  },

  async markCookNotificationRead(userId, id) {
    const result = await prisma.cookNotification.updateMany({ where: { id, userId }, data: { isRead: true } });
    if (!result.count) throw new AppError("Notification not found.", HTTP_STATUS.NOT_FOUND);
    return { id, isRead: true };
  },

  async markAllCookNotificationsRead(userId) {
    return markAllCookNotificationsReadForUser(prisma, userId);
  },

  /**
   * Update authenticated cook's kitchen profile
   * Enforces strict field protection (cook cannot modify verificationStatus or approval)
   */
  async updateKitchenProfile(userId, updateData) {
    const existing = await prisma.cookProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      throw new AppError("Cook kitchen profile not found.", HTTP_STATUS.NOT_FOUND);
    }

    const payload = {};

    const fssaiFields = ["fssaiNumber", "fssaiApplicationReference", "fssaiStatusType"];
    const fssaiChanged = fssaiFields.some((field) =>
      updateData[field] !== undefined && updateData[field] !== existing[field]
    );
    if (updateData.fssaiNumber !== undefined) payload.fssaiNumber = updateData.fssaiNumber || null;
    if (updateData.fssaiApplicationReference !== undefined) {
      payload.fssaiApplicationReference = updateData.fssaiApplicationReference || null;
    }
    if (updateData.fssaiStatusType !== undefined) payload.fssaiStatusType = updateData.fssaiStatusType || null;
    if (updateData.fssaiStatusType === "HAVE_REGISTRATION") payload.fssaiApplicationReference = null;
    if (updateData.fssaiStatusType === "APPLIED_ON_FOSCOS") payload.fssaiNumber = null;
    if (updateData.fssaiStatusType === "NOT_YET_REGISTERED") {
      payload.fssaiNumber = null;
      payload.fssaiApplicationReference = null;
    }
    if (fssaiChanged) {
      const type = updateData.fssaiStatusType ?? existing.fssaiStatusType;
      Object.assign(payload, {
        fssaiStatus: statusForFssaiDetails(type),
        fssaiExpiryDate: null,
        fssaiRejectionReason: null,
        isApprovedToSell: false,
      });
    }

    if (updateData.businessName !== undefined && updateData.businessName.trim()) {
      payload.businessName = updateData.businessName.trim();
    }
    if (updateData.bio !== undefined) {
      payload.bio = updateData.bio ? updateData.bio.trim() : null;
    }
    if (updateData.whoTaughtCooking !== undefined) {
      payload.whoTaughtCooking = updateData.whoTaughtCooking ? updateData.whoTaughtCooking.trim() : null;
    }
    if (updateData.experienceYears !== undefined) {
      payload.experienceYears = updateData.experienceYears ? String(updateData.experienceYears).trim() : null;
    }
    if (updateData.specialization !== undefined) {
      payload.specialization = updateData.specialization ? updateData.specialization.trim() : null;
    }
    if (updateData.signatureDishes !== undefined) {
      payload.signatureDishes = updateData.signatureDishes ? updateData.signatureDishes.trim() : null;
    }
    if (updateData.city !== undefined) {
      payload.city = updateData.city ? updateData.city.trim() : null;
    }
    if (updateData.locality !== undefined) {
      payload.locality = updateData.locality ? updateData.locality.trim() : null;
    }
    if (updateData.serviceArea !== undefined) {
      payload.serviceArea = updateData.serviceArea ? updateData.serviceArea.trim() : null;
    }
    if (updateData.isOpen !== undefined) {
      payload.isOpen = Boolean(updateData.isOpen);
    }
    if (updateData.cuisines !== undefined) {
      payload.cuisines = parseArrayField(updateData.cuisines);
    }
    if (updateData.dietaryPreferences !== undefined) {
      payload.dietaryPreferences = parseArrayField(updateData.dietaryPreferences);
    }

    const updateProfile = (database) => database.cookProfile.update({
      where: { userId },
      data: payload,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
      },
    });
    const updated = fssaiChanged
      ? await prisma.$transaction(async (tx) => {
          await tx.verificationDocument.updateMany({
            where: { userId, documentType: "FSSAI_LICENSE", verificationStatus: "PENDING" },
            data: { verificationStatus: "NEEDS_REVISION", rejectionReason: "FSSAI details changed. Upload the current certificate for review." },
          });
          return updateProfile(tx);
        })
      : await updateProfile(prisma);

    return { ...updated, fssaiStatus: effectiveFssaiStatus(updated.fssaiStatus, updated.fssaiExpiryDate) };
  },

  /**
   * Upload or update kitchen profile photo via Cloudinary
   */
  async updateKitchenPhoto(userId, file) {
    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
    });

    if (!cookProfile) {
      throw new AppError("Cook profile not found.", HTTP_STATUS.NOT_FOUND);
    }

    if (!file || !file.buffer) {
      throw new AppError("Please provide an image file to upload.", HTTP_STATUS.BAD_REQUEST);
    }

    if (!cloudinaryService.isConfigured()) {
      throw new AppError(
        "Cloudinary storage is not configured. Please check server environment.",
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }

    // Upload new photo to Cloudinary public marketplace folder
    const uploadRes = await cloudinaryService.uploadPublicMarketplaceImage({
      fileBuffer: file.buffer,
      fileName: file.originalname || "kitchen_profile.jpg",
      folder: `tastebridge/kitchens/${cookProfile.id}`,
      tags: ["kitchen_profile", "cook_avatar"],
    });

    // Delete old photo asset from Cloudinary if existed
    if (cookProfile.profileImagePublicId) {
      await cloudinaryService.deleteCloudinaryAsset(
        cookProfile.profileImagePublicId,
        "image",
        "upload"
      ).catch(() => {});
    }

    // Update in database
    const updated = await prisma.cookProfile.update({
      where: { id: cookProfile.id },
      data: {
        profileImage: uploadRes.secureUrl,
        profileImagePublicId: uploadRes.publicId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return updated;
  },

  /**
   * Get cook dashboard metrics and recent activity backed by real PostgreSQL records
   */
  async getCookDashboard(userId) {
    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        businessName: true,
        bio: true,
        experienceYears: true,
        specialization: true,
        profileImage: true,
        isOpen: true,
        verificationStatus: true,
        fssaiStatus: true,
        fssaiStatusType: true,
        fssaiExpiryDate: true,
        fssaiRejectionReason: true,
        isApprovedToSell: true,
        isHomeKitchenDeclared: true,
        foodSafetyConsent: true,
        city: true,
        locality: true,
        cookingCapacity: true,
        prepTimeNotice: true,
        cuisines: true,
        dietaryPreferences: true,
        availableDays: true,
        availableMealSlots: true,
        user: { select: { role: true, status: true } },
      },
    });

    if (!cookProfile) {
      throw new AppError("Cook profile not found.", HTTP_STATUS.NOT_FOUND);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      todayOrdersCount,
      pendingRequestsCount,
      upcomingExperiencesCount,
      earningsAggregate,
      deliveredOrdersCount,
      recentOrders,
      experiences,
    ] = await Promise.all([
      // 1. Today's orders count for this cook
      prisma.order.count({
        where: {
          cookId: cookProfile.id,
          createdAt: { gte: startOfDay },
        },
      }),

      // 2. Pending orders awaiting cook action
      prisma.order.count({
        where: {
          cookId: cookProfile.id,
          status: "PENDING",
        },
      }),

      // 3. Upcoming active experiences
      prisma.experience.count({
        where: {
          cookId: cookProfile.id,
          status: "APPROVED",
        },
      }),

      // 4. Real earnings sum from completed orders
      prisma.order.aggregate({
        where: {
          cookId: cookProfile.id,
          status: "DELIVERED",
          paymentStatus: "PAID",
        },
        _sum: {
          cookEarning: true,
        },
      }),

      // 5. Total delivered orders count
      prisma.order.count({
        where: {
          cookId: cookProfile.id,
          status: "DELIVERED",
          paymentStatus: "PAID",
        },
      }),

      // 6. Recent real orders
      prisma.order.findMany({
        where: {
          cookId: cookProfile.id,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
            },
          },
          items: true,
        },
      }),

      // 7. Recent real dining experiences
      prisma.experience.findMany({
        where: {
          cookId: cookProfile.id,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          bookings: {
            orderBy: { bookingDate: "desc" },
            take: 5,
          },
        },
      }),
    ]);

    const totalEarnings = currencyNumber(earningsAggregate._sum?.cookEarning || 0);
    const hasEarningsRecords = deliveredOrdersCount > 0;
    const readiness = getCookSellingReadiness(cookProfile);
    const kitchen = {
      id: cookProfile.id,
      businessName: cookProfile.businessName,
      profileImage: cookProfile.profileImage,
      isOpen: cookProfile.isOpen,
      verificationStatus: cookProfile.verificationStatus,
      fssaiStatus: effectiveFssaiStatus(cookProfile.fssaiStatus, cookProfile.fssaiExpiryDate),
      fssaiStatusType: cookProfile.fssaiStatusType,
      fssaiExpiryDate: cookProfile.fssaiExpiryDate,
      fssaiRejectionReason: cookProfile.fssaiRejectionReason,
      isApprovedToSell: cookProfile.isApprovedToSell,
      city: cookProfile.city,
      locality: cookProfile.locality,
      cuisines: cookProfile.cuisines,
      user: { status: cookProfile.user.status },
    };

    return {
      kitchen,
      readiness,
      summary: {
        todayOrders: todayOrdersCount,
        pendingRequests: pendingRequestsCount,
        upcomingExperiences: upcomingExperiencesCount,
        earnings: {
          isAvailable: hasEarningsRecords,
          amount: totalEarnings,
          formattedAmount: `₹${totalEarnings.toFixed(2)}`,
          statusNote: hasEarningsRecords
            ? "Fulfilled orders earnings"
            : "Not available yet",
        },
      },
      recentOrders,
      experiences,
    };
  },

  // =========================================================================
  // DISH & STORY MANAGEMENT (AUTHENTICATED COOK)
  // =========================================================================

  /**
   * Helper to ensure cookProfile exists for the user
   */
  async _getCookProfileOrThrow(userId) {
    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!cookProfile) {
      throw new AppError("Cook profile not found. Please complete cook registration.", HTTP_STATUS.FORBIDDEN);
    }
    return cookProfile;
  },

  /**
   * Helper to verify dish ownership
   */
  async _getDishAndVerifyOwnership(userId, dishId) {
    const cookProfile = await this._getCookProfileOrThrow(userId);
    const dish = await prisma.dish.findUnique({
      where: { id: dishId },
      include: {
        category: true,
        story: true,
      },
    });

    if (!dish) {
      throw new AppError("Dish not found.", HTTP_STATUS.NOT_FOUND);
    }

    if (dish.cookId !== cookProfile.id) {
      throw new AppError("Access denied. You do not own this dish.", HTTP_STATUS.FORBIDDEN);
    }

    return { dish, cookProfile };
  },

  /**
   * List authenticated cook's dishes with optional search and filters
   */
  async getCookDishes(userId, query = {}) {
    const cookProfile = await prisma.cookProfile.findUnique({
      where: { userId },
      include: { user: { select: { role: true, status: true } } },
    });
    if (!cookProfile) {
      throw new AppError("Cook profile not found. Please complete cook registration.", HTTP_STATUS.FORBIDDEN);
    }

    const where = {
      cookId: cookProfile.id,
    };

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { cuisine: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.isAvailable !== undefined) {
      where.isAvailable = query.isAvailable === "true" || query.isAvailable === true;
    }

    if (query.isVegetarian !== undefined) {
      where.isVegetarian = query.isVegetarian === "true" || query.isVegetarian === true;
    }

    const [dishes, total] = await Promise.all([
      prisma.dish.findMany({
        where,
        include: {
          category: true,
          story: true,
          _count: {
            select: {
              reviews: true,
              orderItems: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.dish.count({ where }),
    ]);

    return {
      dishes: dishes.map((dish) => ({
        ...serializeCookDish(dish),
        customerVisibility: getDishCustomerVisibility(dish, cookProfile, cookProfile.user?.status),
      })),
      total,
    };
  },

  /**
   * Get single dish details owned by authenticated cook
   */
  async getCookDishById(userId, dishId) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);
    return serializeCookDish(dish);
  },

  /**
   * Create a new dish for authenticated cook (default DRAFT)
   * Enforces story requirements if submitted as PUBLISHED
   */
  async createCookDish(userId, data, file = null) {
    const cookProfile = await this._getCookProfileOrThrow(userId);
    const requestedStatus = data.status || "DRAFT";
    assertCookMayCreateDishWithStatus(requestedStatus);
    if (requestedStatus === "PENDING_APPROVAL") {
      this._assertCookCanSell(cookProfile);
    }

    // Validate category exists if provided
    if (data.categoryId) {
      const category = await prisma.foodCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new AppError("Selected food category was not found.", HTTP_STATUS.BAD_REQUEST);
      }
    }

    // Extract story info
    const whoTaught = (data.story?.whoTaught || data.whoTaught || "").trim();
    const occasion = (data.story?.occasion || data.occasion || "").trim();
    const culturalSignificance = (data.story?.culturalSignificance || data.culturalSignificance || "").trim();
    const storyText = (data.story?.storyText || data.storyText || "").trim();
    const visibility = data.story?.visibility || data.storyVisibility || "PUBLIC";
    const mediaUrl = data.story?.mediaUrl || data.mediaUrl || null;

    const hasStory = Boolean(whoTaught && storyText);

    // Validate before the external upload so rejected publishing requests do not leave assets.
    let imageUrl = data.image || null;
    let imagePublicId = null;
    if (file) {
      const uploadRes = await cloudinaryService.uploadPublicMarketplaceImage({
        fileBuffer: file.buffer,
        fileName: file.originalname,
        folder: "tastebridge/dishes",
        tags: ["dish", cookProfile.businessName],
      });
      imageUrl = uploadRes.secureUrl;
      imagePublicId = uploadRes.publicId;
    }

    let dish;
    try {
      dish = await prisma.dish.create({
      data: {
        cookId: cookProfile.id,
        name: data.name.trim(),
        description: data.description ? data.description.trim() : null,
        cuisine: data.cuisine.trim(),
        price: normalizeCurrency(data.price),
        categoryId: data.categoryId || null,
        isVegetarian: data.isVegetarian !== false && data.isVegetarian !== "false",
        ingredients: parseArrayField(data.ingredients),
        instructions: data.instructions ? data.instructions.trim() : null,
        prepTimeMinutes: data.prepTimeMinutes ? Number(data.prepTimeMinutes) : 30,
        dietaryTags: parseArrayField(data.dietaryTags),
        availableQuantity: data.availableQuantity !== undefined ? Number(data.availableQuantity) : 10,
        lowStockThreshold: data.lowStockThreshold !== undefined ? Number(data.lowStockThreshold) : 3,
        isAvailable: data.isAvailable !== false && data.isAvailable !== "false",
        status: requestedStatus,
        image: imageUrl,
        imagePublicId,
        story: hasStory
          ? {
              create: {
                whoTaught,
                occasion: occasion || null,
                culturalSignificance: culturalSignificance || null,
                storyText,
                visibility,
                mediaUrl,
              },
            }
          : undefined,
      },
      include: {
        category: true,
        story: true,
      },
      });
    } catch (error) {
      if (imagePublicId) {
        try {
          await cloudinaryService.deleteCloudinaryAsset(imagePublicId, "image", "upload");
        } catch (cleanupError) {
          console.error("Failed to clean up a dish image after database creation failed.", cleanupError);
        }
      }
      throw error;
    }

    return serializeCookDish(dish);
  },

  /**
   * Edit cook's dish details
   */
  async updateCookDish(userId, dishId, data) {
    const { dish, cookProfile } = await this._getDishAndVerifyOwnership(userId, dishId);

    if (data.categoryId) {
      const category = await prisma.foodCategory.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new AppError("Selected food category was not found.", HTTP_STATUS.BAD_REQUEST);
      }
    }

    const updates = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description ? data.description.trim() : null;
    if (data.cuisine !== undefined) updates.cuisine = data.cuisine.trim();
    if (data.price !== undefined) updates.price = normalizeCurrency(data.price);
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId || null;
    if (data.isVegetarian !== undefined) updates.isVegetarian = Boolean(data.isVegetarian);
    if (data.ingredients !== undefined) updates.ingredients = parseArrayField(data.ingredients);
    if (data.instructions !== undefined) updates.instructions = data.instructions ? data.instructions.trim() : null;
    if (data.prepTimeMinutes !== undefined) updates.prepTimeMinutes = Number(data.prepTimeMinutes);
    if (data.dietaryTags !== undefined) updates.dietaryTags = parseArrayField(data.dietaryTags);
    if (data.availableQuantity !== undefined) updates.availableQuantity = Number(data.availableQuantity);
    if (data.lowStockThreshold !== undefined) updates.lowStockThreshold = Number(data.lowStockThreshold);
    if (data.isAvailable !== undefined) updates.isAvailable = Boolean(data.isAvailable);
    if (data.image !== undefined) updates.image = data.image;

    // Check story updates
    const whoTaught = data.story?.whoTaught ?? data.whoTaught;
    const occasion = data.story?.occasion ?? data.occasion;
    const culturalSignificance = data.story?.culturalSignificance ?? data.culturalSignificance;
    const storyText = data.story?.storyText ?? data.storyText;
    const visibility = data.story?.visibility ?? data.storyVisibility;
    const mediaUrl = data.story?.mediaUrl ?? data.mediaUrl;

    const hasIncomingStoryUpdates =
      whoTaught !== undefined ||
      occasion !== undefined ||
      culturalSignificance !== undefined ||
      storyText !== undefined ||
      visibility !== undefined ||
      mediaUrl !== undefined;

    if (data.status === "PUBLISHED") {
      assertCookMayPublishDish(dish);
    } else if (data.status === "PENDING_APPROVAL") {
      if (dish.status === "PUBLISHED") {
        throw new AppError("An approved dish cannot be withdrawn into review. Contact Admin to request a reviewed update.", HTTP_STATUS.CONFLICT);
      }
      this._assertCookCanSell(cookProfile);
      updates.status = "PENDING_APPROVAL";
    } else if (data.status !== undefined) {
      if (dish.status === "PUBLISHED") {
        throw new AppError("Use the Unpublish action to change an approved dish's listing status.", HTTP_STATUS.CONFLICT);
      }
      updates.status = data.status;
    }

    // Persist the story and dish together when the request changes both.
    let storyWrite = null;
    if (hasIncomingStoryUpdates) {
      if (dish.story) {
        storyWrite = {
          type: "update",
          id: dish.story.id,
          data: {
            ...(whoTaught !== undefined && { whoTaught: whoTaught.trim() }),
            ...(occasion !== undefined && { occasion: occasion ? occasion.trim() : null }),
            ...(culturalSignificance !== undefined && { culturalSignificance: culturalSignificance ? culturalSignificance.trim() : null }),
            ...(storyText !== undefined && { storyText: storyText.trim() }),
            ...(visibility !== undefined && { visibility }),
            ...(mediaUrl !== undefined && { mediaUrl }),
          },
        };
      } else if (whoTaught && storyText) {
        storyWrite = {
          type: "create",
          data: {
            whoTaught: whoTaught.trim(),
            occasion: occasion ? occasion.trim() : null,
            culturalSignificance: culturalSignificance ? culturalSignificance.trim() : null,
            storyText: storyText.trim(),
            visibility: visibility || "PUBLIC",
            mediaUrl: mediaUrl || null,
          },
        };
      }
    }

    assertPublishedDishContentUnchanged(dish, updates, storyWrite);

    if (!Object.keys(updates).length && !storyWrite) {
      throw new AppError("Provide at least one dish change.", HTTP_STATUS.BAD_REQUEST);
    }
    return serializeCookDish(await persistDishAndStoryUpdate(prisma, {
      dishId: dish.id,
      expectedStatus: dish.status,
      updates,
      storyWrite,
    }));
  },

  /**
   * Upload / replace photo for a dish
   */
  async uploadCookDishPhoto(userId, dishId, file) {
    const { dish, cookProfile } = await this._getDishAndVerifyOwnership(userId, dishId);

    if (dish.status === "PUBLISHED") {
      throw new AppError("An approved dish photo cannot be changed directly. Contact Admin to request a reviewed update.", HTTP_STATUS.CONFLICT);
    }

    if (!file) {
      throw new AppError("No photo file uploaded.", HTTP_STATUS.BAD_REQUEST);
    }

    const uploadRes = await cloudinaryService.uploadPublicMarketplaceImage({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      folder: "tastebridge/dishes",
      tags: ["dish", dish.name, cookProfile.businessName],
    });

    const changed = await prisma.dish.updateMany({
      where: { id: dish.id, status: dish.status },
      data: { image: uploadRes.secureUrl, imagePublicId: uploadRes.publicId },
    });
    if (changed.count !== 1) {
      await cloudinaryService.deleteCloudinaryAsset(uploadRes.publicId, "image", "upload").catch(() => {});
      throw new AppError("Dish status changed while the photo was uploading. Refresh and try again.", HTTP_STATUS.CONFLICT);
    }
    const updated = await prisma.dish.findUnique({
      where: { id: dish.id },
      include: { category: true, story: true },
    });

    return serializeCookDish(updated);
  },

  /**
   * Publish a dish with story verification
   */
  async publishCookDish(userId, dishId) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);
    assertCookMayPublishDish(dish);
    return serializeCookDish(dish);
  },

  /**
   * Unpublish dish
   */
  async unpublishCookDish(userId, dishId) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);

    if (dish.status !== "PUBLISHED") {
      throw new AppError("Only a published dish can be unpublished.", HTTP_STATUS.CONFLICT);
    }

    const updated = await prisma.dish.update({
      where: { id: dish.id },
      data: {
        status: "UNPUBLISHED",
      },
      include: {
        category: true,
        story: true,
      },
    });

    return serializeCookDish(updated);
  },

  /**
   * Toggle dish ordering availability
   */
  async updateCookDishAvailability(userId, dishId, isAvailable) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);

    const updated = await prisma.dish.update({
      where: { id: dish.id },
      data: {
        isAvailable: Boolean(isAvailable),
      },
      include: {
        category: true,
        story: true,
      },
    });

    return serializeCookDish(updated);
  },

  /**
   * Update dish stock and low stock threshold
   */
  async updateCookDishStock(userId, dishId, { availableQuantity, lowStockThreshold }) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);

    const data = {
      availableQuantity: Number(availableQuantity),
    };
    if (lowStockThreshold !== undefined) {
      data.lowStockThreshold = Number(lowStockThreshold);
    }

    const updated = await prisma.dish.update({
      where: { id: dish.id },
      data,
      include: {
        category: true,
        story: true,
      },
    });

    return serializeCookDish(updated);
  },

  /**
   * Delete draft or unpublished dish
   */
  async deleteCookDish(userId, dishId) {
    const { dish } = await this._getDishAndVerifyOwnership(userId, dishId);

    // Check if dish has existing order items
    const orderCount = await prisma.orderItem.count({
      where: { dishId: dish.id },
    });

    if (orderCount > 0) {
      // Archive / unpublish instead of deleting to preserve order history
      await prisma.dish.update({
        where: { id: dish.id },
        data: { status: "UNPUBLISHED", isAvailable: false },
      });
      return { message: "Dish has historical customer orders. It has been unpublished and archived." };
    }

    await prisma.dish.delete({
      where: { id: dish.id },
    });

    return { message: "Dish removed successfully." };
  },

  _assertCookCanSell(cookProfile) {
    if (!isCookEligibleToSell(cookProfile)) {
      throw new AppError(
        "Your cook profile and food-safety approval must both be approved before publishing dishes.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  },

  /**
   * Helper to evaluate whether a dish can be ordered by a customer
   * Criteria: status must be PUBLISHED, isAvailable must be true, and availableQuantity > 0
   */
  isDishOrderable(dish) {
    if (!dish) return false;
    return (
      dish.status === "PUBLISHED" &&
      dish.isAvailable === true &&
      Number(dish.availableQuantity) > 0
    );
  },
};

export default cookService;
