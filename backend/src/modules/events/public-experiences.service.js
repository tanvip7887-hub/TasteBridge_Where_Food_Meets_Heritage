import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";
import {
  cookSellingReadinessWhere,
  findCookProfilesWithValidRequiredText,
} from "../../utils/cookReadiness.js";

const publicExperienceSelect = (now, query = {}) => ({
  id: true,
  type: true,
  title: true,
  theme: true,
  description: true,
  teachingContent: true,
  learningOutcomes: true,
  materialsToBring: true,
  cuisine: true,
  pricePerPerson: true,
  maxGuests: true,
  durationMinutes: true,
  isVegetarian: true,
  dietaryNotes: true,
  menuNotes: true,
  inclusions: true,
  houseRules: true,
  photos: true,
  image: true,
  publicArea: true,
  createdAt: true,
  menuItems: {
    orderBy: [{ sortOrder: "asc" }, { dishId: "asc" }],
    select: {
      note: true,
      dish: { select: { id: true, name: true, image: true, cuisine: true } },
    },
  },
  cook: {
    select: { id: true, businessName: true, profileImage: true },
  },
  slots: {
    where: {
      status: "OPEN",
      startsAt: {
        gt: now,
        ...(query.startsAfter ? { gte: query.startsAfter } : {}),
        ...(query.startsBefore ? { lt: query.startsBefore } : {}),
      },
      availableSeats: { gt: 0 },
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: { id: true, startsAt: true, endsAt: true, availableSeats: true },
  },
});

const nonEmpty = { not: "" };

const commonExperienceWhere = {
  title: nonEmpty,
  theme: nonEmpty,
  description: nonEmpty,
  pricePerPerson: { gt: 0 },
  publicArea: nonEmpty,
  privateAddress: nonEmpty,
  addressSource: { not: null },
  OR: [{ photos: { isEmpty: false } }, { image: { not: null } }],
};
const dineExperienceWhere = {
  ...commonExperienceWhere,
  cuisine: nonEmpty,
  AND: [{ OR: [{ menuItems: { some: {} } }, { menuNotes: nonEmpty }] }],
};
const workshopExperienceWhere = {
  ...commonExperienceWhere,
  teachingContent: nonEmpty,
  learningOutcomes: nonEmpty,
};
const requiredExperienceWhere = (type) => type === "HOME_DINING"
  ? { type: "HOME_DINING", ...dineExperienceWhere }
  : type === "WORKSHOP"
    ? { type: "WORKSHOP", ...workshopExperienceWhere }
    : { OR: [
      { type: "HOME_DINING", ...dineExperienceWhere },
      { type: "WORKSHOP", ...workshopExperienceWhere },
    ] };

const emptyResult = (page, limit) => ({
  items: [],
  pagination: { page, limit, total: 0, totalPages: 0 },
});

const makeWhere = (query, now, cookIds) => {
  const slotWhere = {
    status: "OPEN",
    startsAt: {
      gt: now,
      ...(query.startsAfter ? { gte: query.startsAfter } : {}),
      ...(query.startsBefore ? { lt: query.startsBefore } : {}),
    },
    availableSeats: { gt: 0 },
  };
  return {
    status: "PUBLISHED",
    ...requiredExperienceWhere(query.type),
    ...(query.cuisine ? { [query.type === "WORKSHOP" ? "theme" : "cuisine"]: { contains: query.cuisine, mode: "insensitive" } } : {}),
    ...(query.vegetarian !== undefined ? { isVegetarian: query.vegetarian } : {}),
    ...(query.dietary ? { dietaryNotes: { contains: query.dietary, mode: "insensitive" } } : {}),
    ...(query.location ? { publicArea: { contains: query.location, mode: "insensitive" } } : {}),
    cook: { is: cookSellingReadinessWhere(now, cookIds) },
    slots: { some: slotWhere },
  };
};

const serialize = (experience, now) => ({
  id: experience.id,
  type: experience.type,
  title: experience.title,
  theme: experience.theme,
  description: experience.description,
  teachingContent: experience.teachingContent,
  learningOutcomes: experience.learningOutcomes,
  materialsToBring: experience.materialsToBring,
  cuisine: experience.cuisine,
  pricePerPerson: experience.pricePerPerson,
  maxGuests: experience.maxGuests,
  durationMinutes: experience.durationMinutes,
  isVegetarian: experience.isVegetarian,
  dietaryNotes: experience.dietaryNotes,
  menuNotes: experience.menuNotes,
  inclusions: experience.inclusions,
  houseRules: experience.houseRules,
  photos: experience.photos,
  image: experience.image,
  publicArea: experience.publicArea,
  createdAt: experience.createdAt,
  menuItems: (experience.menuItems || []).map(({ note, dish }) => ({
    note,
    dish: dish ? { id: dish.id, name: dish.name, image: dish.image, cuisine: dish.cuisine } : null,
  })),
  cook: experience.cook
    ? { id: experience.cook.id, businessName: experience.cook.businessName, profileImage: experience.cook.profileImage }
    : null,
  // These figures reflect the persisted slot inventory at read time; discovery
  // does not hold or reserve seats. Checkout must revalidate availability.
  slots: (experience.slots || [])
    .filter((slot) => slot.status === undefined || slot.status === "OPEN")
    .filter((slot) => new Date(slot.startsAt) > now && slot.availableSeats > 0)
    .map(({ id, startsAt, endsAt, availableSeats }) => ({ id, startsAt, endsAt, availableSeats })),
});

const sortOrder = {
  newest: [{ createdAt: "desc" }, { id: "asc" }],
  price_asc: [{ pricePerPerson: "asc" }, { id: "asc" }],
  price_desc: [{ pricePerPerson: "desc" }, { id: "asc" }],
};

export const createPublicExperiencesService = (database, { now = () => new Date() } = {}) => ({
  async list(query) {
    const currentTime = now();
    const cookIds = await findCookProfilesWithValidRequiredText(database);
    if (!cookIds.length) return emptyResult(query.page, query.limit);

    const where = makeWhere(query, currentTime, cookIds);
    const [total, experiences] = await Promise.all([
      database.experience.count({ where }),
      database.experience.findMany({
        where,
        orderBy: sortOrder[query.sort],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: publicExperienceSelect(currentTime, query),
      }),
    ]);

    return {
      items: experiences.map((experience) => serialize(experience, currentTime)),
      pagination: { page: query.page, limit: query.limit, total, totalPages: total ? Math.ceil(total / query.limit) : 0 },
    };
  },

  async getById(id) {
    const currentTime = now();
    const cookIds = await findCookProfilesWithValidRequiredText(database);
    if (!cookIds.length) return null;
    const experience = await database.experience.findFirst({
      where: { id, ...makeWhere({}, currentTime, cookIds) },
      select: publicExperienceSelect(currentTime),
    });
    return experience ? serialize(experience, currentTime) : null;
  },
});

export const publicExperienceNotFound = () => new AppError("Experience not found.", HTTP_STATUS.NOT_FOUND);
