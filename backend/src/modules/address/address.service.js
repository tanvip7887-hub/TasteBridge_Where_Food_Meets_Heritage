import prisma from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

const addressOrder = [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "asc" }];

const lockCustomer = async (tx, userId) => {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
};

const getAddressBook = async (database, userId) => {
  const items = await database.address.findMany({ where: { userId }, orderBy: addressOrder });
  return { items, defaultAddress: items.find((address) => address.isDefault) || null };
};

const normalizeDefault = async (tx, userId, preferredId = null, excludedId = null) => {
  const addresses = await tx.address.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, isDefault: true },
  });
  const winnerId = preferredId || addresses.find((address) => address.isDefault)?.id ||
    addresses.find((address) => address.id !== excludedId)?.id || addresses[0]?.id;
  await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  if (winnerId) await tx.address.update({ where: { id: winnerId }, data: { isDefault: true } });
};

const notFound = () => new AppError("Address not found.", HTTP_STATUS.NOT_FOUND);

export const createAddressService = (database) => ({
  async list(userId) {
    return getAddressBook(database, userId);
  },

  async getDefault(userId) {
    const { defaultAddress } = await getAddressBook(database, userId);
    return defaultAddress;
  },

  async create(userId, data) {
    return database.$transaction(async (tx) => {
      await lockCustomer(tx, userId);
      const address = await tx.address.create({ data: { ...data, userId, isDefault: false } });
      await normalizeDefault(tx, userId, data.isDefault ? address.id : null);
      return getAddressBook(tx, userId);
    });
  },

  async update(userId, addressId, data) {
    return database.$transaction(async (tx) => {
      await lockCustomer(tx, userId);
      const address = await tx.address.findFirst({ where: { id: addressId, userId } });
      if (!address) throw notFound();
      await tx.address.update({ where: { id: addressId }, data });
      await normalizeDefault(
        tx,
        userId,
        data.isDefault === true ? addressId : null,
        data.isDefault === false && address.isDefault ? addressId : null
      );
      return getAddressBook(tx, userId);
    });
  },

  async setDefault(userId, addressId) {
    return database.$transaction(async (tx) => {
      await lockCustomer(tx, userId);
      const address = await tx.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
      if (!address) throw notFound();
      await normalizeDefault(tx, userId, addressId);
      return getAddressBook(tx, userId);
    });
  },

  async remove(userId, addressId) {
    return database.$transaction(async (tx) => {
      await lockCustomer(tx, userId);
      const address = await tx.address.findFirst({ where: { id: addressId, userId }, select: { id: true } });
      if (!address) throw notFound();
      await tx.address.delete({ where: { id: addressId } });
      await normalizeDefault(tx, userId);
      return getAddressBook(tx, userId);
    });
  },
});

export const addressService = createAddressService(prisma);
