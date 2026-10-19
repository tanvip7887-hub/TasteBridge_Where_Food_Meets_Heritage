import prisma from "./config/prisma.js";
import { createCustomerEventsService } from "./modules/events/customer-events.service.js";

async function main() {
  const bookings = await prisma.experienceBooking.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      slot: true,
      paymentAttempts: true,
      experience: true,
    },
  });
  console.log("=== LATEST 5 BOOKINGS IN DB ===");
  for (const b of bookings) {
    console.log({
      id: b.id,
      customerId: b.customerId,
      status: b.status,
      bookingDate: b.bookingDate,
      totalAmount: b.totalAmount,
      totalAmountSnapshot: b.totalAmountSnapshot,
      slotId: b.slotId,
      slot: b.slot ? { id: b.slot.id, status: b.slot.status, startsAt: b.slot.startsAt, availableSeats: b.slot.availableSeats } : null,
      paymentAttempts: b.paymentAttempts.map((p) => ({
        id: p.id,
        status: p.status,
        provider: p.provider,
        verificationMode: p.verificationMode,
        amount: p.amount,
        currency: p.currency,
      })),
      cancellationStatus: b.cancellationStatus,
    });
  }

  if (bookings.length > 0) {
    const service = createCustomerEventsService(prisma);
    const result = await service.listMyBookings(bookings[0].customerId);
    console.log("=== listMyBookings for first customer ===");
    console.log(JSON.stringify(result.items.map(i => ({ id: i.id, status: i.status, cancellation: i.cancellation, bookingDate: i.bookingDate })), null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
