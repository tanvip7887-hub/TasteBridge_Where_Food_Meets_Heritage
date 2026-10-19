export function requireSeedAdminPassword(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("SEED_ADMIN_PASSWORD must be configured before running the database seed.");
  }

  return value;
}

function assertExistingSeedAdmin(user) {
  if (user.role !== "ADMIN" || user.status !== "ACTIVE") {
    throw new Error(
      "The configured seed Admin email belongs to an account that is not an active Admin. No account was changed."
    );
  }
}

/** Create the seed Admin if absent; never mutate an existing account. */
export async function ensureSeedAdmin({ database, email, password, hashPassword }) {
  const configuredPassword = requireSeedAdminPassword(password);
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await database.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    assertExistingSeedAdmin(existing);
    return { user: existing, created: false };
  }

  const passwordHash = await hashPassword(configuredPassword, 10);
  try {
    const user = await database.user.create({
      data: {
        name: "TasteBridge Admin",
        email: normalizedEmail,
        phone: "+910000000000",
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    return { user, created: true };
  } catch (error) {
    // If another seed process created the same email concurrently, accept it
    // only when it is already an active Admin. Never update the winning row.
    if (error?.code !== "P2002") throw error;
    const racedUser = await database.user.findUnique({ where: { email: normalizedEmail } });
    if (!racedUser) throw error;
    assertExistingSeedAdmin(racedUser);
    return { user: racedUser, created: false };
  }
}
