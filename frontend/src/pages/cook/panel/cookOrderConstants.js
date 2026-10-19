export const COOK_ORDER_STATUS_OPTIONS = [
  {
    id: "pending",
    label: "Pending / New Orders",
    shortLabel: "Pending",
    statuses: ["PENDING"],
    badgeColor: "bg-amber-500",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    id: "preparing",
    label: "Confirmed / Preparing",
    shortLabel: "Preparing",
    statuses: ["CONFIRMED", "PREPARING"],
    badgeColor: "bg-blue-500",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    id: "ready",
    label: "Ready for Pickup",
    shortLabel: "Ready for Pickup",
    statuses: ["READY_FOR_PICKUP"],
    badgeColor: "bg-emerald-500",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  {
    id: "completed",
    label: "Completed",
    shortLabel: "Completed",
    statuses: ["DELIVERED", "OUT_FOR_DELIVERY"],
    badgeColor: "bg-purple-500",
    badgeBg: "bg-purple-100 text-purple-800 border-purple-200",
  },
  {
    id: "cancelled",
    label: "Cancelled",
    shortLabel: "Cancelled",
    statuses: ["CANCELLED"],
    badgeColor: "bg-red-500",
    badgeBg: "bg-red-100 text-red-800 border-red-200",
  },
];

export const getStatusGroup = (statusId) =>
  COOK_ORDER_STATUS_OPTIONS.find((group) => group.id === statusId) || COOK_ORDER_STATUS_OPTIONS[0];

export const calculateOrderCounts = (orders = []) => {
  const counts = {
    pending: 0,
    preparing: 0,
    ready: 0,
    completed: 0,
    cancelled: 0,
    total: orders.length,
  };
  for (const order of orders) {
    if (order.status === "PENDING") {
      counts.pending += 1;
    } else if (order.status === "CONFIRMED" || order.status === "PREPARING") {
      counts.preparing += 1;
    } else if (order.status === "READY_FOR_PICKUP") {
      counts.ready += 1;
    } else if (order.status === "DELIVERED" || order.status === "OUT_FOR_DELIVERY") {
      counts.completed += 1;
    } else if (order.status === "CANCELLED") {
      counts.cancelled += 1;
    }
  }
  return counts;
};
