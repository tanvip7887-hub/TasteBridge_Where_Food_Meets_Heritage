import { z } from "zod";

const requiredText = (max, label) => z.string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, `${label} is required.`).max(max, `${label} is too long.`));

const optionalText = (max, label) => z.string()
  .transform((value) => value.trim())
  .pipe(z.string().max(max, `${label} is too long.`))
  .nullable()
  .optional()
  .transform((value) => value || null);

const phone = z.string()
  .transform((value) => value.trim().replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{10,14}$/, "Enter a valid phone number with 10–14 digits."));

const pincode = z.string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit Indian PIN code."));

const addressFields = {
  label: optionalText(40, "Address label"),
  recipientName: requiredText(120, "Recipient name"),
  phone,
  addressLine1: requiredText(200, "Address line 1"),
  addressLine2: optionalText(200, "Address line 2"),
  locality: requiredText(120, "Locality"),
  city: requiredText(100, "City"),
  state: requiredText(100, "State"),
  pincode,
  landmark: optionalText(200, "Landmark"),
  isDefault: z.boolean().optional(),
};

const addressIdParams = z.object({
  id: z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export const createAddressSchema = {
  body: z.object(addressFields).strict(),
};

export const updateAddressSchema = {
  params: addressIdParams,
  body: z.object(addressFields).partial().strict().refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one address field to update.",
  }),
};

export const addressIdSchema = { params: addressIdParams };
