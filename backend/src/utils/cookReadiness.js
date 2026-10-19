import { effectiveFssaiStatus } from "./fssai.js";

export const COOK_PROFILE_TEXT_MINIMUMS = Object.freeze({
  businessName: 2,
  bio: 15,
  experienceYears: 1,
  specialization: 2,
  city: 2,
  locality: 2,
  cookingCapacity: 1,
  prepTimeNotice: 1,
});

/**
 * Match ECMAScript String.trim() at both the API and database boundary. The
 * SQL query below uses the corresponding fixed Unicode whitespace set.
 */
export const trimCookProfileText = (value) =>
  typeof value === "string" ? value.trim() : value;

export const cookProfileTextLength = (value) => Array.from(value).length;

const hasText = (value, minimumLength = 1) =>
  typeof value === "string" && cookProfileTextLength(trimCookProfileText(value)) >= minimumLength;

const hasSelections = (value) =>
  (Array.isArray(value) && value.length > 0) || hasText(value);

const profileFields = [
  ["businessName", "Kitchen name", COOK_PROFILE_TEXT_MINIMUMS.businessName],
  ["bio", "Cooking introduction", COOK_PROFILE_TEXT_MINIMUMS.bio],
  ["experienceYears", "Cooking experience", COOK_PROFILE_TEXT_MINIMUMS.experienceYears],
  ["specialization", "Culinary specialization", COOK_PROFILE_TEXT_MINIMUMS.specialization],
  ["city", "Operating city", COOK_PROFILE_TEXT_MINIMUMS.city],
  ["locality", "Locality or neighborhood", COOK_PROFILE_TEXT_MINIMUMS.locality],
  ["cookingCapacity", "Daily cooking capacity", COOK_PROFILE_TEXT_MINIMUMS.cookingCapacity],
  ["prepTimeNotice", "Preparation time notice", COOK_PROFILE_TEXT_MINIMUMS.prepTimeNotice],
];

const missingProfileDetails = (cook) => {
  const missing = profileFields
    .filter(([field, , minimumLength]) => !hasText(cook?.[field], minimumLength))
    .map(([, label]) => label);

  for (const [field, label] of [
    ["cuisines", "at least one regional cuisine"],
    ["dietaryPreferences", "at least one dietary preference"],
    ["availableDays", "at least one available day"],
    ["availableMealSlots", "at least one meal slot"],
  ]) {
    if (!hasSelections(cook?.[field])) missing.push(label);
  }

  if (cook?.isHomeKitchenDeclared !== true) missing.push("home-kitchen declaration");
  if (cook?.foodSafetyConsent !== true) missing.push("Food Safety & Hygiene Agreement");
  return missing;
};

const fssaiAction = (status) => {
  const actions = {
    NOT_SUBMITTED: "Submit your FSSAI details and upload the certificate.",
    IN_PROCESS: "Upload your certificate when your FSSAI registration is available.",
    SUBMITTED: "Your certificate is waiting for admin review.",
    REJECTED: "Review the decision note and submit a corrected certificate.",
    EXPIRED: "Upload a renewed certificate and request a new review.",
  };
  return actions[status] || "Submit a valid FSSAI certificate for review.";
};

/**
 * The authoritative, derived checklist for a cook's permission to sell.
 * `cook` is a CookProfile with its owning User selected; no client flags are used.
 */
export const getCookSellingReadiness = (cook, now = new Date()) => {
  const user = cook?.user;
  const accountComplete = user?.role === "COOK" && user?.status === "ACTIVE";
  const profileMissing = missingProfileDetails(cook);
  const profileComplete = Boolean(cook) && profileMissing.length === 0;
  const profileApproved = cook?.verificationStatus === "APPROVED";
  const fssaiStatus = effectiveFssaiStatus(cook?.fssaiStatus, cook?.fssaiExpiryDate, now);
  const fssaiApproved = fssaiStatus === "APPROVED" && Boolean(cook?.fssaiExpiryDate && new Date(cook.fssaiExpiryDate) > now);

  const checklist = [
    {
      id: "active-cook-account",
      label: "Active cook account",
      complete: accountComplete,
      message: accountComplete
        ? "Your active cook account is ready."
        : user?.status !== "ACTIVE"
          ? "Your account must be active before you can sell."
          : "This account does not have the cook role required to sell.",
      actionHref: null,
    },
    {
      id: "kitchen-profile",
      label: "Complete kitchen profile and food-safety commitments",
      complete: profileComplete,
      message: profileComplete
        ? "Your required kitchen details are complete."
        : `Complete: ${profileMissing.join(", ")}.`,
      actionHref: "/cook/profile",
    },
    {
      id: "cook-profile-approval",
      label: "Cook profile approved",
      complete: profileApproved,
      message: profileApproved
        ? "Your cook application is approved."
        : cook?.verificationStatus === "REJECTED"
          ? "Your cook application was rejected. Review the decision and resubmit if requested."
          : cook?.verificationStatus === "NEEDS_REVISION"
            ? "Your cook application needs changes before it can be approved."
            : "Your cook profile must be approved by TasteBridge.",
      actionHref: "/cook/profile",
    },
    {
      id: "fssai-certificate",
      label: "FSSAI certificate approved and unexpired",
      complete: fssaiApproved,
      status: fssaiStatus,
      message: fssaiApproved
        ? `Your FSSAI certificate is approved through ${new Date(cook.fssaiExpiryDate).toISOString().slice(0, 10)}.`
        : `${fssaiAction(fssaiStatus)}${fssaiStatus === "REJECTED" && cook?.fssaiRejectionReason ? ` Review note: ${cook.fssaiRejectionReason}` : ""}`,
      actionHref: "/cook/profile",
    },
    {
      id: "selling-approval",
      label: "Selling approval granted",
      complete: cook?.isApprovedToSell === true,
      message: cook?.isApprovedToSell === true
        ? "TasteBridge has granted selling approval."
        : "TasteBridge must grant selling approval after the required checks are complete.",
      actionHref: "/cook/profile",
    },
  ];
  const pendingRequirements = checklist
    .filter((item) => !item.complete)
    .map(({ id, label, message, actionHref }) => ({ id, label, message, actionHref }));

  return {
    readyToSell: pendingRequirements.length === 0,
    checklist,
    pendingRequirements,
  };
};

const requiredTextFields = Object.keys(COOK_PROFILE_TEXT_MINIMUMS);
// Keep these aligned with Prisma nullability: businessName is String, while
// the remaining required text fields are nullable String? columns.
const nullableRequiredTextFields = new Set([
  "bio",
  "experienceYears",
  "specialization",
  "city",
  "locality",
  "cookingCapacity",
  "prepTimeNotice",
]);
const requiredArrayFields = ["cuisines", "dietaryPreferences", "availableDays", "availableMealSlots"];

/**
 * Prisma cannot express string length in a `where` filter. Select only the
 * qualifying profile IDs in PostgreSQL so dish filtering and pagination stay
 * database-side. The fixed column names and parameterized thresholds are
 * derived from the same minimums used by the JS readiness and Zod validators.
 * PostgreSQL char_length and JavaScript Array.from both count Unicode code
 * points. btrim uses the ECMAScript trim whitespace set used by String.trim().
 */
export const findCookProfilesWithValidRequiredText = async (database) => {
  const rows = await database.$queryRaw`
    WITH trim_chars(chars) AS (
      SELECT chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
        || chr(160) || chr(5760)
        || chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196)
        || chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202)
        || chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
    )
    SELECT profile."id"
    FROM "CookProfile" AS profile
    CROSS JOIN trim_chars
    WHERE char_length(btrim(profile."businessName", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.businessName}
      AND char_length(btrim(profile."bio", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.bio}
      AND char_length(btrim(profile."experienceYears", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.experienceYears}
      AND char_length(btrim(profile."specialization", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.specialization}
      AND char_length(btrim(profile."city", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.city}
      AND char_length(btrim(profile."locality", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.locality}
      AND char_length(btrim(profile."cookingCapacity", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.cookingCapacity}
      AND char_length(btrim(profile."prepTimeNotice", trim_chars.chars)) >= ${COOK_PROFILE_TEXT_MINIMUMS.prepTimeNotice}
  `;
  return rows.map(({ id }) => id);
};

/** Prisma predicate for the same account, profile, approval, and FSSAI gates. */
export const cookSellingReadinessWhere = (now = new Date(), eligibleProfileIds = []) => ({
  id: { in: eligibleProfileIds },
  verificationStatus: "APPROVED",
  fssaiStatus: "APPROVED",
  fssaiExpiryDate: { gt: now },
  isApprovedToSell: true,
  isHomeKitchenDeclared: true,
  foodSafetyConsent: true,
  user: { is: { role: "COOK", status: "ACTIVE" } },
  AND: [
    ...requiredTextFields.flatMap((field) => [
      ...(nullableRequiredTextFields.has(field) ? [{ [field]: { not: null } }] : []),
      { [field]: { not: "" } },
    ]),
    ...requiredArrayFields.map((field) => ({ [field]: { isEmpty: false } })),
  ],
});
