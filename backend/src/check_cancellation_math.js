import { createCustomerEventsService } from "./modules/events/customer-events.service.js";
import prisma from "./config/prisma.js";

async function main() {
  // Let's check booking cmve2cut70008u0tmtzlau43c
  const b = await prisma.experienceBooking.findUnique({
    where: { id: "cmve2cut70008u0tmtzlau43c" },
    include: { slot: true, paymentAttempts: true },
  });

  const now = new Date();
  const slotStartsAt = b.slot.startsAt;
  const hoursUntilEvent = (slotStartsAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  console.log("Current time:", now.toISOString());
  console.log("Booking slot startsAt:", slotStartsAt.toISOString());
  console.log("Hours until event:", hoursUntilEvent.toFixed(1));
  console.log("Is hours >= 48?:", hoursUntilEvent >= 48);

  const service = createCustomerEventsService(prisma);
  const myBookings = await service.listMyBookings(b.customerId);
  const item = myBookings.items.find((i) => i.id === b.id);
  console.log("cancellation object from listMyBookings:", item.cancellation);
}

main().catch(console.error).finally(() => prisma.$disconnect());
