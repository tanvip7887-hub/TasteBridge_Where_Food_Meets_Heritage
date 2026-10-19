import "dotenv/config";
import bcrypt from "bcrypt";
import prisma, { pool } from "../src/config/prisma.js";
import { ensureSeedAdmin, requireSeedAdminPassword } from "./seed-admin.js";

async function main() {
  console.log("=================================================");
  console.log("   TASTEBRIDGE IDEMPOTENT INITIAL DATABASE SEED   ");
  console.log("=================================================");

  // Validate required bootstrap credentials before any database operation.
  const adminRawPassword = requireSeedAdminPassword(process.env.SEED_ADMIN_PASSWORD);
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@tastebridge.com").toLowerCase().trim();
  // Existing accounts are never updated by seeding. An existing non-Admin or
  // inactive account at this email is an operator error and aborts the seed.
  const { user: admin, created: adminCreated } = await ensureSeedAdmin({
    database: prisma,
    email: adminEmail,
    password: adminRawPassword,
    hashPassword: (password, rounds) => bcrypt.hash(password, rounds),
  });
  console.log(`✓ Admin account ${adminCreated ? "created" : "verified"}: ${admin.email}`);

  // 2. Seed or Preserve Platform Settings
  const settings = await prisma.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      platformFeePercent: 10.0,
      deliveryFeeBase: 30.0,
    },
  });
  console.log(`✓ Platform settings verified: Fee ${settings.platformFeePercent}%, Delivery ₹${settings.deliveryFeeBase}`);

  // 3. Seed or Ensure 13 Regional Food Categories
  const categoriesData = [
    {
      name: "Maharashtrian",
      slug: "maharashtrian",
      description: "Authentic coastal and inland flavours of Maharashtra",
      image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Punjabi",
      slug: "punjabi",
      description: "Rich, buttery curries and tandoori specialties from Punjab",
      image: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Gujarati",
      slug: "gujarati",
      description: "Delicate sweet and savory thalis from Gujarat",
      image: "https://images.unsplash.com/photo-1617692855027-33b14f061079?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Rajasthani",
      slug: "rajasthani",
      description: "Royal Rajasthani daal baati churma and spiced curries",
      image: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Bengali",
      slug: "bengali",
      description: "Mustard-infused fish, luchis, and traditional Bengali sweets",
      image: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "South Indian",
      slug: "south-indian",
      description: "Crispy dosas, fluffy idlis, and aromatic sambar",
      image: "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Kerala",
      slug: "kerala",
      description: "Coconut-rich curries, appam, and Malabar seafood",
      image: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Tamil",
      slug: "tamil",
      description: "Authentic Chettinad spices and traditional South Indian rice dishes",
      image: "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Andhra",
      slug: "andhra",
      description: "Fiery Andhra biryanis and spicy chutney thalis",
      image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Goan",
      slug: "goan",
      description: "Coastal coconut fish curry and Goan vindaloo",
      image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Kashmiri",
      slug: "kashmiri",
      description: "Fragrant saffron wazwan and Kashmiri rogan josh",
      image: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "Hyderabadi",
      slug: "hyderabadi",
      description: "Slow-cooked dum biryani and royal Nizami gravies",
      image: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=400&q=80",
    },
    {
      name: "North Indian",
      slug: "north-indian",
      description: "Classic North Indian gravies, paneer, and fresh naan",
      image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80",
    },
  ];

  for (const cat of categoriesData) {
    await prisma.foodCategory.upsert({
      where: { slug: cat.slug },
      update: {
        name: cat.name,
        description: cat.description,
        image: cat.image,
      },
      create: cat,
    });
  }
  console.log(`✓ Food categories verified/ensured: ${categoriesData.length}`);

  console.log("=================================================");
  console.log("TasteBridge initial database seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
