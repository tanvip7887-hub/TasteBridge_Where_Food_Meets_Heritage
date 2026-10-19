import prisma from "./config/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true },
  });
  console.log("Users in DB:");
  console.log(users);
}

main().catch(console.error).finally(() => prisma.$disconnect());
