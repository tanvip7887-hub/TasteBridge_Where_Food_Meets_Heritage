import { createCustomerEventsService } from "./modules/events/customer-events.service.js";
import prisma from "./config/prisma.js";

async function test() {
  const service = createCustomerEventsService(prisma);
  const bookings = await service.listMyBookings("cmv2qjx0300010gtmgtzv13u0");
  console.log("Bookings for cmv2qjx0300010gtmgtzv13u0:");
  console.log(JSON.stringify(bookings, null, 2));
}

test().catch(console.error).finally(() => prisma.$disconnect());
