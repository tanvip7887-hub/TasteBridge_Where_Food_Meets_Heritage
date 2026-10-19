export const groupBookings = (bookings, now = Date.now()) => {
  const groups = { upcoming: [], past: [], cancelled: [] };
  for (const booking of bookings) {
    if (booking.status === "CANCELLED") groups.cancelled.push(booking);
    else if (booking.status === "COMPLETED" || new Date(booking.bookingDate).getTime() < now) groups.past.push(booking);
    else groups.upcoming.push(booking);
  }
  groups.upcoming.sort((a, b) => new Date(a.bookingDate) - new Date(b.bookingDate));
  groups.past.sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate));
  groups.cancelled.sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate));
  return groups;
};
