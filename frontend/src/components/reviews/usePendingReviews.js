import { useCallback, useEffect, useState } from "react";
import reviewsApi from "../../api/reviewsApi.js";

const unwrap = (response) => response?.data?.data ?? response?.data ?? response;

export const usePendingReviews = (enabled = true) => {
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const response = await reviewsApi.pending({ page: 1, limit: 50 });
      const data = unwrap(response);
      setPendingItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      setError(err?.message || "Failed to load eligible reviews.");
      setPendingItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void refresh();
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  const getPendingFoodItem = useCallback(
    (orderItemId) => pendingItems.find((item) => item.reviewType === "FOOD" && item.orderItemId === orderItemId),
    [pendingItems]
  );

  const getPendingOrderItems = useCallback(
    (orderId, checkoutId) =>
      pendingItems.filter(
        (item) =>
          item.reviewType === "FOOD" &&
          (item.orderId === orderId || (checkoutId && item.checkoutId === checkoutId))
      ),
    [pendingItems]
  );

  const getPendingBookingItem = useCallback(
    (bookingId) => pendingItems.find((item) => item.reviewType === "EXPERIENCE" && item.bookingId === bookingId),
    [pendingItems]
  );

  const isFoodItemEligible = useCallback(
    (orderItemId) => Boolean(getPendingFoodItem(orderItemId)),
    [getPendingFoodItem]
  );

  const isOrderEligible = useCallback(
    (orderId, checkoutId) => getPendingOrderItems(orderId, checkoutId).length > 0,
    [getPendingOrderItems]
  );

  const isBookingEligible = useCallback(
    (bookingId) => Boolean(getPendingBookingItem(bookingId)),
    [getPendingBookingItem]
  );

  return {
    pendingItems,
    loading,
    error,
    refresh,
    getPendingFoodItem,
    getPendingOrderItems,
    getPendingBookingItem,
    isFoodItemEligible,
    isOrderEligible,
    isBookingEligible,
  };
};

export default usePendingReviews;
