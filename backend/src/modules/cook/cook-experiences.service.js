import { createHash } from "node:crypto";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import { getCookSellingReadiness } from "../../utils/cookReadiness.js";
import { cloudinaryService } from "../../services/cloudinary.service.js";
import {
  expireDueBookingsForExperience,
  expireDueBookingsForSlot,
  isRetryableDineTransactionError,
  runSerializableWithRetry,
} from "../events/dine-booking-expiry.service.js";

const notFound = () => new AppError("Experience not found.", HTTP_STATUS.NOT_FOUND);
const conflict = (message) => new AppError(message, HTTP_STATUS.CONFLICT);
const badRequest = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST);
const activeBookingStatuses = ["PENDING", "ACCEPTED", "CONFIRMED"];
const runCookSerializable = (database, operation) => runSerializableWithRetry(database, operation).catch((error) => {
  if (isRetryableDineTransactionError(error)) {
    throw conflict("Experience or booking availability changed concurrently. Refresh and retry.");
  }
  throw error;
});
const experienceInclude = {
  menuItems: { orderBy: { sortOrder: "asc" }, include: { dish: { select: { id: true, name: true, image: true, cuisine: true } } } },
  slots: { orderBy: [{ startsAt: "asc" }, { id: "asc" }] },
};

const experienceData = (input) => {
  const { menuDishIds: _menuDishIds, ...data } = input;
  if (data.publicArea !== undefined) data.location = data.publicArea;
  return data;
};

const DEFAULT_BOOKING_CUTOFF_HOURS = 6;
const publishFingerprint = (input, startsAt, workshopImageHash) => createHash("sha256").update(JSON.stringify({
  type: input.type,
  title: input.title,
  theme: input.theme,
  description: input.description,
  ...(input.type === "WORKSHOP" ? {
    teachingContent: input.teachingContent,
    learningOutcomes: input.learningOutcomes,
    materialsToBring: input.materialsToBring ?? null,
    workshopImageHash,
  } : { cuisine: input.cuisine, isVegetarian: input.isVegetarian }),
  dietaryNotes: input.dietaryNotes ?? null,
  menuNotes: input.menuNotes,
  pricePerPerson: input.pricePerPerson,
  maxGuests: input.maxGuests,
  capacity: input.capacity,
      durationMinutes: input.durationMinutes,
  location: input.location,
  startsAt: startsAt.toISOString(),
})).digest("hex");
const publishKeyWhere = (cookId, key) => ({ cookId_publishIdempotencyKey: { cookId, publishIdempotencyKey: key } });
const assertPublishFingerprint = (experience, fingerprint) => {
  if (experience.publishRequestFingerprint !== fingerprint) {
    throw conflict("This publish request key was already used for different event details.");
  }
  return experience;
};

const assertOwnedMenuDishes = async (tx, cookId, dishIds) => {
  if (!dishIds?.length) return;
  const dishes = await tx.dish.findMany({ where: { id: { in: dishIds }, cookId }, select: { id: true } });
  if (dishes.length !== dishIds.length) throw badRequest("Every menu dish must belong to this Cook.");
};

const activeBookingCount = (tx, where) => tx.experienceBooking.count({
  where: { ...where, status: { in: activeBookingStatuses } },
});

export const createCookExperiencesService = (
  database,
  { storage = cloudinaryService, now = () => new Date(), readiness = getCookSellingReadiness } = {},
) => ({
  async list(cookId) {
    const items = await database.experience.findMany({
      where: { cookId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], include: experienceInclude,
    });
    return { items };
  },

  async createDraft(cookId, input) {
    const menuDishIds = input.menuDishIds || [];
    return database.$transaction(async (tx) => {
      await assertOwnedMenuDishes(tx, cookId, menuDishIds);
      const created = await tx.experience.create({
        data: {
          cookId,
          ...experienceData(input),
          status: "DRAFT",
        },
        include: experienceInclude,
      });
      if (menuDishIds.length) {
        await tx.experienceMenuItem.createMany({
          data: menuDishIds.map((dishId, sortOrder) => ({ experienceId: created.id, dishId, sortOrder })),
        });
      }
      return menuDishIds.length
        ? tx.experience.findFirst({ where: { id: created.id, cookId }, include: experienceInclude })
        : created;
    }, { isolationLevel: "Serializable" });
  },

  async publishNew(cookId, input, workshopImage) {
    const startsAt = new Date(input.startsAt);
    const at = now();
    let workshopImageHash = null;
    let uploadedImage = null;
    if (input.type === "WORKSHOP") {
      if (!workshopImage?.buffer) throw badRequest("Upload a workshop image before submitting it for review.");
      workshopImageHash = createHash("sha256").update(workshopImage.buffer).digest("hex");
    }
    const fingerprint = publishFingerprint(input, startsAt, workshopImageHash);
    const previous = await database.experience.findUnique({
      where: publishKeyWhere(cookId, input.idempotencyKey), include: experienceInclude,
    });
    if (previous) return assertPublishFingerprint(previous, fingerprint);

    if (input.type === "WORKSHOP") {
      uploadedImage = await storage.uploadPublicMarketplaceImage({
        fileBuffer: workshopImage.buffer,
        fileName: workshopImage.originalname,
        folder: `tastebridge/workshops/${cookId}`,
        tags: ["experience", "workshop"],
      });
    }
    const discardUnusedUpload = async (result) => {
      if (!uploadedImage?.publicId || result?.image === uploadedImage.secureUrl) return;
      try { await storage.deleteCloudinaryAsset(uploadedImage.publicId, "image", "upload"); } catch { /* Preserve the main result/error. */ }
    };
    try {
      const result = await runCookSerializable(database, async (tx) => {
      const previous = await tx.experience.findUnique({ where: publishKeyWhere(cookId, input.idempotencyKey), include: experienceInclude });
      if (previous) return assertPublishFingerprint(previous, fingerprint);
      const cook = await tx.cookProfile.findUnique({ where: { id: cookId }, include: { user: true } });
      if (!cook) throw notFound();
      const cookReadiness = readiness(cook, at);
      if (!cookReadiness.readyToSell) {
        throw conflict(`Cook is not ready to publish experiences: ${cookReadiness.pendingRequirements.map(({ label }) => label).join(", ")}.`);
      }
      // Dine uses the verified Cook profile photo; Workshops use their own
      // uploaded course image so customers can identify the actual class.
      if (input.type === "HOME_DINING" && !cook.profileImage) throw badRequest("Add a kitchen profile photo before publishing an event.");

      const settings = await tx.platformSettings.findUnique({ where: { id: "default" } });
      const cutoffHours = settings?.experienceBookingCutoffHours ?? DEFAULT_BOOKING_CUTOFF_HOURS;
      const earliestBookable = new Date(at.getTime() + cutoffHours * 60 * 60 * 1000);
      if (!(startsAt instanceof Date) || !Number.isFinite(startsAt.getTime()) || startsAt <= earliestBookable) {
        throw badRequest(`Choose an event start at least ${cutoffHours} hours in the future.`);
      }
      const publicArea = [cook.locality, cook.city].filter((part) => typeof part === "string" && part.trim()).join(", ");
      if (!publicArea) throw conflict("Complete your Cook profile location before publishing an event.");

      const created = await tx.experience.create({
        data: {
          cookId,
          type: input.type,
          title: input.title,
          theme: input.theme,
          description: input.description,
          teachingContent: input.type === "WORKSHOP" ? input.teachingContent : null,
          learningOutcomes: input.type === "WORKSHOP" ? input.learningOutcomes : null,
          materialsToBring: input.type === "WORKSHOP" ? input.materialsToBring ?? null : null,
          cuisine: input.type === "WORKSHOP" ? null : input.cuisine,
          isVegetarian: input.type === "WORKSHOP" ? false : input.isVegetarian,
          dietaryNotes: input.dietaryNotes ?? null,
          menuNotes: input.type === "WORKSHOP" ? null : input.menuNotes,
          pricePerPerson: input.pricePerPerson,
          maxGuests: input.maxGuests,
          durationMinutes: input.durationMinutes,
          publicArea,
          location: publicArea,
          privateAddress: input.location,
          addressSource: "CUSTOM",
          image: input.type === "WORKSHOP" ? uploadedImage.secureUrl : cook.profileImage,
          photos: [input.type === "WORKSHOP" ? uploadedImage.secureUrl : cook.profileImage],
          publishIdempotencyKey: input.idempotencyKey,
          publishRequestFingerprint: fingerprint,
          status: "DRAFT",
        },
        select: { id: true },
      });
      const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60 * 1000);
      await tx.experienceSlot.create({
        data: {
          experienceId: created.id,
          startsAt,
          endsAt,
          capacity: input.capacity,
          availableSeats: input.capacity,
          status: "OPEN",
        },
      });
      return tx.experience.update({
        where: { id: created.id },
        data: { status: input.type === "WORKSHOP" ? "PENDING" : "PUBLISHED" },
        include: experienceInclude,
      });
      });
      await discardUnusedUpload(result);
      return result;
    } catch (error) {
      // A concurrent retry may win the composite unique constraint. Read its
      // committed result after the failed transaction and return it only when
      // its complete server-computed request fingerprint matches.
      if (error?.code === "P2002") {
        const previous = await database.experience.findUnique({
          where: publishKeyWhere(cookId, input.idempotencyKey),
          include: experienceInclude,
        });
        if (previous) {
          await discardUnusedUpload(previous);
          const result = assertPublishFingerprint(previous, fingerprint);
          return result;
        }
      }
      await discardUnusedUpload(null);
      throw error;
    }
  },

  async updateDraft(cookId, experienceId, input) {
    return runCookSerializable(database, async (tx) => {
      // Match the booking path's Experience -> booking -> slot lock order.
      const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
      if (!locked.length) throw notFound();
      await expireDueBookingsForExperience(tx, experienceId, now());
      const current = await tx.experience.findFirst({ where: { id: experienceId, cookId }, include: experienceInclude });
      if (!current) throw notFound();
      if (input.type && input.type !== current.type) throw conflict("An experience type cannot be changed after creation.");
      if (current.type === "WORKSHOP" && current.status === "PUBLISHED") {
        throw conflict("Pause the workshop before editing it. Updated details must be resubmitted for Admin review.");
      }
      const changes = experienceData(input);
      const hasActiveBookings = await activeBookingCount(tx, { experienceId });
      if (input.maxGuests !== undefined) {
        const activeBookingGuests = await tx.experienceBooking.aggregate({
          where: { experienceId, status: { in: activeBookingStatuses } },
          _max: { numberOfGuests: true },
        });
        if ((activeBookingGuests._max.numberOfGuests || 0) > input.maxGuests) {
          throw conflict("Maximum guests per booking cannot be reduced below an active booking's guest count.");
        }
      }
      const protectedFields = ["pricePerPerson", "publicArea", "privateAddress", "addressSource", "location", "menuDishIds", "menuNotes"];
      if (hasActiveBookings && protectedFields.some((field) => input[field] !== undefined)) {
        throw conflict("Price, location, and menu cannot be changed while active bookings exist.");
      }
      if (input.menuDishIds !== undefined) {
        await assertOwnedMenuDishes(tx, cookId, input.menuDishIds);
        await tx.experienceMenuItem.deleteMany({ where: { experienceId } });
        if (input.menuDishIds.length) {
          await tx.experienceMenuItem.createMany({
            data: input.menuDishIds.map((dishId, sortOrder) => ({ experienceId, dishId, sortOrder })),
          });
        }
      }
      return tx.experience.update({ where: { id: experienceId }, data: changes, include: experienceInclude });
    });
  },

  async publish(cookId, experienceId) {
    return runCookSerializable(database, async (tx) => {
      const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
      if (!locked.length) throw notFound();
      await expireDueBookingsForExperience(tx, experienceId, now());
      const experience = await tx.experience.findFirst({ where: { id: experienceId, cookId }, include: experienceInclude });
      if (!experience) throw notFound();
      if (experience.status === "PUBLISHED") return experience;
      if (experience.type === "WORKSHOP" && experience.status === "PENDING") return experience;
      const resubmittingRejectedWorkshop = experience.type === "WORKSHOP" && experience.status === "REJECTED";
      if (!["DRAFT", "PAUSED"].includes(experience.status) && !resubmittingRejectedWorkshop) {
        throw conflict("Only a draft or paused experience can be published.");
      }
      const cook = await tx.cookProfile.findUnique({ where: { id: cookId }, include: { user: true } });
      const cookReadiness = readiness(cook, now());
      if (!cookReadiness.readyToSell) {
        throw conflict(`Cook is not ready to publish experiences: ${cookReadiness.pendingRequirements.map(({ label }) => label).join(", ")}.`);
      }
      const requiredMissing = [];
      if (!experience.title?.trim()) requiredMissing.push("title");
      if (!experience.theme?.trim()) requiredMissing.push("theme");
      if (!experience.description?.trim()) requiredMissing.push("description");
      if (experience.type === "WORKSHOP") {
        if (!experience.teachingContent?.trim()) requiredMissing.push("teaching content");
        if (!experience.learningOutcomes?.trim()) requiredMissing.push("learning outcomes");
      } else if (!experience.cuisine?.trim()) requiredMissing.push("cuisine");
      if (!(Number.isFinite(experience.pricePerPerson) && experience.pricePerPerson > 0)) requiredMissing.push("price per person");
      if (!experience.publicArea?.trim()) requiredMissing.push("public area");
      if (!experience.privateAddress?.trim() || !experience.addressSource) requiredMissing.push("private address source and address");
      if (!experience.photos?.length && !experience.image) requiredMissing.push("at least one uploaded photo");
      if (experience.type !== "WORKSHOP" && !experience.menuItems?.length && !experience.menuNotes?.trim()) requiredMissing.push("menu details");
      if (experience.type === "WORKSHOP" && !experience.image && !experience.photos?.length) requiredMissing.push("workshop image");
      if (requiredMissing.length) throw badRequest(`Complete required experience details: ${requiredMissing.join(", ")}.`);
      const futureSlot = await tx.experienceSlot.findFirst({
        where: { experienceId, status: "OPEN", startsAt: { gt: now() }, availableSeats: { gt: 0 } },
        select: { id: true },
      });
      if (!futureSlot) throw badRequest("Add at least one future open slot with available seats before publishing.");
      return tx.experience.update({
        where: { id: experienceId },
        data: experience.type === "WORKSHOP"
          ? { status: "PENDING", reviewRejectionReason: null }
          : { status: "PUBLISHED" },
        include: experienceInclude,
      });
    });
  },

  async pause(cookId, experienceId) {
    const experience = await database.experience.findFirst({ where: { id: experienceId, cookId } });
    if (!experience) throw notFound();
    if (experience.status === "PAUSED") return experience;
    if (experience.status !== "PUBLISHED") throw conflict("Only a published experience can be paused.");
    return database.experience.update({ where: { id: experienceId }, data: { status: "PAUSED" }, include: experienceInclude });
  },

  async uploadPhoto(cookId, experienceId, file) {
    if (!file?.buffer) throw badRequest("Select an image to upload.");
    const experience = await database.experience.findFirst({ where: { id: experienceId, cookId }, select: { id: true, image: true } });
    if (!experience) throw notFound();
    const uploaded = await storage.uploadPublicMarketplaceImage({
      fileBuffer: file.buffer,
      fileName: file.originalname,
      folder: `tastebridge/experiences/${cookId}`,
      tags: ["experience", experienceId],
    });
    try {
      return await database.experience.update({
        where: { id: experienceId },
        data: { photos: { push: uploaded.secureUrl }, ...(experience.image ? {} : { image: uploaded.secureUrl }) },
        select: { id: true, photos: true, image: true },
      });
    } catch (error) {
      // Preserve the uploaded asset for inspection rather than deleting external
      // content automatically after a persistence failure.
      throw error;
    }
  },

  async replaceWorkshopPhoto(cookId, experienceId, file) {
    if (!file?.buffer) throw badRequest("Select an image to upload.");
    const owned = await database.experience.findFirst({
      where: { id: experienceId, cookId },
      select: { id: true, type: true, status: true },
    });
    if (!owned) throw notFound();
    if (owned.type !== "WORKSHOP") throw badRequest("This image action is only available for workshops.");
    if (owned.status === "PUBLISHED") throw conflict("Pause the published workshop before changing its image.");

    const uploaded = await storage.uploadPublicMarketplaceImage({
      fileBuffer: file.buffer, fileName: file.originalname,
      folder: `tastebridge/workshops/${cookId}`, tags: ["experience", "workshop", experienceId],
    });
    try {
      return await runCookSerializable(database, async (tx) => {
        const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
        if (!locked.length) throw notFound();
        const current = await tx.experience.findFirst({ where: { id: experienceId, cookId }, select: { id: true, type: true, status: true } });
        if (!current) throw notFound();
        if (current.type !== "WORKSHOP") throw badRequest("This image action is only available for workshops.");
        if (current.status === "PUBLISHED") throw conflict("Pause the published workshop before changing its image.");
        return tx.experience.update({ where: { id: experienceId }, data: { image: uploaded.secureUrl, photos: [uploaded.secureUrl] }, select: { id: true, image: true, photos: true } });
      });
    } catch (error) {
      try { await storage.deleteCloudinaryAsset(uploaded.publicId, "image", "upload"); } catch { /* Preserve persistence failure. */ }
      throw error;
    }
  },

  async removeWorkshopPhoto(cookId, experienceId) {
    return runCookSerializable(database, async (tx) => {
      const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
      if (!locked.length) throw notFound();
      const current = await tx.experience.findFirst({ where: { id: experienceId, cookId } });
      if (!current) throw notFound();
      if (current.type !== "WORKSHOP") throw badRequest("This image action is only available for workshops.");
      if (current.status === "PUBLISHED") throw conflict("Pause the published workshop before removing its image.");
      return tx.experience.update({ where: { id: experienceId }, data: { image: null, photos: [] }, include: experienceInclude });
    });
  },

  async listSlots(cookId, experienceId) {
    const owned = await database.experience.findFirst({ where: { id: experienceId, cookId }, select: { id: true } });
    if (!owned) throw notFound();
    return { items: await database.experienceSlot.findMany({ where: { experienceId }, orderBy: [{ startsAt: "asc" }, { id: "asc" }] }) };
  },

  async createSlot(cookId, experienceId, input) {
    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (!(start > now()) || !(end > start)) throw badRequest("Slot must have a future start time and end after its start.");
    const owned = await database.experience.findFirst({ where: { id: experienceId, cookId }, select: { id: true } });
    if (!owned) throw notFound();
    return database.experienceSlot.create({
      data: { experienceId, startsAt: start, endsAt: end, capacity: input.capacity, availableSeats: input.capacity },
    });
  },

  async updateSlot(cookId, experienceId, slotId, input) {
    return runCookSerializable(database, async (tx) => {
      // Exclude new booking creation while expiry and the held-seat count are
      // reconciled; booking creation takes FOR SHARE on this same Experience.
      const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
      if (!locked.length) throw notFound();
      const ownedSlot = await tx.experienceSlot.findFirst({ where: { id: slotId, experienceId, experience: { cookId } } });
      if (!ownedSlot) throw notFound();
      await expireDueBookingsForSlot(tx, slotId, now());
      const slot = await tx.experienceSlot.findFirst({ where: { id: slotId, experienceId, experience: { cookId } } });
      if (!slot) throw notFound();
      if (slot.status === "CANCELLED") throw conflict("Cancelled slots cannot be edited.");
      const held = await tx.experienceBooking.aggregate({
        where: { slotId, status: { in: activeBookingStatuses } }, _sum: { numberOfGuests: true },
      });
      const heldSeats = held._sum.numberOfGuests || 0;
      const startsAt = input.startsAt ? new Date(input.startsAt) : slot.startsAt;
      const endsAt = input.endsAt ? new Date(input.endsAt) : slot.endsAt;
      const capacity = input.capacity ?? slot.capacity;
      if (!(startsAt > now()) || !(endsAt > startsAt)) throw badRequest("Slot must have a future start time and end after its start.");
      if (heldSeats && (startsAt.getTime() !== slot.startsAt.getTime() || endsAt.getTime() !== slot.endsAt.getTime())) {
        throw conflict("A slot with active bookings cannot be rescheduled.");
      }
      if (capacity < heldSeats) throw conflict("Capacity cannot be reduced below the seats held by active bookings.");
      const changed = await tx.experienceSlot.updateMany({
        where: {
          id: slotId,
          capacity: slot.capacity,
          availableSeats: slot.availableSeats,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          status: slot.status,
        },
        data: { startsAt, endsAt, capacity, availableSeats: capacity - heldSeats, ...(input.status ? { status: input.status } : {}) },
      });
      if (changed.count !== 1) throw conflict("The slot changed while it was being edited. Refresh and try again.");
      return tx.experienceSlot.findUnique({ where: { id: slotId } });
    });
  },

  async cancelSlot(cookId, experienceId, slotId) {
    return runCookSerializable(database, async (tx) => {
      const locked = await tx.$queryRaw`SELECT "id" FROM "Experience" WHERE "id" = ${experienceId} AND "cookId" = ${cookId} FOR UPDATE`;
      if (!locked.length) throw notFound();
      const ownedSlot = await tx.experienceSlot.findFirst({ where: { id: slotId, experienceId, experience: { cookId } } });
      if (!ownedSlot) throw notFound();
      await expireDueBookingsForSlot(tx, slotId, now());
      const slot = await tx.experienceSlot.findFirst({ where: { id: slotId, experienceId, experience: { cookId } } });
      if (!slot) throw notFound();
      if (slot.status === "CANCELLED") return slot;
      const activeBookings = await tx.experienceBooking.count({ where: { slotId, status: { in: activeBookingStatuses } } });
      if (activeBookings) throw conflict("A slot with active bookings cannot be cancelled.");
      return tx.experienceSlot.update({ where: { id: slotId }, data: { status: "CANCELLED", availableSeats: 0 } });
    });
  },
});
