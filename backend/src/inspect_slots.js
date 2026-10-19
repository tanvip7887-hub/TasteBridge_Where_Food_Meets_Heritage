import prisma from "./config/prisma.js";

async function main() {
  const slots = await prisma.experienceSlot.findMany({
    orderBy: { startsAt: "asc" },
  });
  console.log("All experience slots in DB:");
  for (const s of slots) {
    console.log({
      id: s.id,
      experienceId: s.experienceId,
      startsAt: s.startsAt,
      status: s.status,
      availableSeats: s.availableSeats,
      capacity: s.capacity,
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
