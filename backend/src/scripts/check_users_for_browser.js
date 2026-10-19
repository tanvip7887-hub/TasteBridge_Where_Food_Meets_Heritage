import prisma from "./src/config/prisma.js";

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });
  console.log("Users in database:");
  for (const u of users) {
    console.log(`- ID: ${u.id}, Role: ${u.role}, Status: ${u.status}, Email: ${u.email}`);
  }
  await prisma.$disconnect();
}

checkUsers().catch(console.error);
