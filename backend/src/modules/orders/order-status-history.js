import { AppError } from "../../utils/AppError.js";
import { HTTP_STATUS } from "../../constants/index.js";

export const recordOrderStatus = (transaction, { orderId, fromStatus = null, toStatus }) =>
  transaction.orderStatusHistory.create({
    data: { orderId, fromStatus, toStatus },
  });

// The enum addition is intentionally not assumed to be present in every database
// yet. Fail closed before attempting a write that an older database cannot store.
export const assertReadyForPickupAvailable = async (transaction) => {
  const rows = await transaction.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM pg_type AS enum_type
      JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
      JOIN pg_namespace AS enum_schema ON enum_schema.oid = enum_type.typnamespace
      WHERE enum_schema.nspname = 'public'
        AND enum_type.typname = 'OrderStatus'
        AND enum_value.enumlabel = 'READY_FOR_PICKUP'
    ) AS available
  `;
  if (rows?.[0]?.available !== true) {
    throw new AppError(
      "Ready for pickup is unavailable until the OrderStatus migration is applied.",
      HTTP_STATUS.SERVICE_UNAVAILABLE
    );
  }
};
