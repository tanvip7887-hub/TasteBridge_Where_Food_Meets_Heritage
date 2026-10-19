import prisma from "./config/prisma.js";

async function main() {
  const b = await prisma.experienceBooking.findUnique({
    where: { id: "cmve2cut70008u0tmtzlau43c" },
    include: { paymentAttempts: true, slot: true },
  });
  console.log("Booking cmve2cut70008u0tmtzlau43c:");
  console.log(b);
}

main().catch(console.error).finally(() => prisma.$disconnect());
