import { z } from "zod";

export const DELIVERY_AGENT_UPI_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{1,255}@[A-Za-z0-9][A-Za-z0-9.-]{1,63}$/;

export const isValidDeliveryAgentUpiId = (value) => typeof value === "string"
  && DELIVERY_AGENT_UPI_ID_PATTERN.test(value.trim());
export const isValidDeliveryAgentPayoutDetails = (details) => Boolean(
  details
  && typeof details === "object"
  && isValidDeliveryAgentUpiId(details.upiId)
  && typeof details.accountHolderName === "string"
  && details.accountHolderName.trim().length >= 2
  && details.accountHolderName.trim().length <= 100,
);

export const deliveryAgentPayoutDetailsSchema = {
  body: z.object({
    // UPI is the only payout destination collected in this phase; never accept credentials.
    upiId: z.string().trim().min(3).max(320).regex(
      DELIVERY_AGENT_UPI_ID_PATTERN,
      "Enter a valid UPI ID.",
    ),
    accountHolderName: z.string().trim().min(2, "Enter the name associated with your UPI account.")
      .max(100, "Account holder name must be at most 100 characters."),
  }).strict(),
};

export const deliveryAgentAvailabilitySchema = {
  body: z.object({ isAvailable: z.boolean() }).strict(),
};

const deliveryOrderId = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const deliveryCompletionOrderParamsSchema = { params: z.object({ orderId: deliveryOrderId }) };
export const deliveryCompletionOtpSchema = {
  params: z.object({ orderId: deliveryOrderId }),
  body: z.object({ otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the customer's email.") }).strict(),
};

export const deliveryAgentApplicationSchema = {
  body: z
    .object({
      // A. Personal Information
      fullName: z
        .string({ required_error: "Full name is required" })
        .trim()
        .min(2, "Full name must be at least 2 characters")
        .max(100, "Full name must be at most 100 characters"),
      phone: z
        .string({ required_error: "Mobile number is required" })
        .trim()
        .regex(/^\+?[0-9]{10,14}$/, "Please provide a valid 10-14 digit mobile number"),
      dateOfBirth: z
        .string({ required_error: "Date of birth is required" })
        .trim()
        .min(1, "Date of birth is required"),
      gender: z.string().trim().optional().or(z.literal("")),

      // B. Address Information
      addressLine1: z
        .string({ required_error: "House/flat number and street name are required" })
        .trim()
        .min(3, "House number and street must be at least 3 characters")
        .max(200, "Address cannot exceed 200 characters"),
      locality: z
        .string({ required_error: "Area or locality is required" })
        .trim()
        .min(2, "Locality must be at least 2 characters")
        .max(100, "Locality cannot exceed 100 characters"),
      city: z
        .string({ required_error: "City is required" })
        .trim()
        .min(2, "City must be at least 2 characters")
        .max(100, "City cannot exceed 100 characters"),
      state: z
        .string({ required_error: "State is required" })
        .trim()
        .min(2, "State must be at least 2 characters")
        .max(100, "State cannot exceed 100 characters"),
      pincode: z
        .string({ required_error: "PIN code is required" })
        .trim()
        .regex(/^[1-9][0-9]{5}$/, "Please enter a valid 6-digit Indian PIN code"),

      // C. Delivery and Vehicle Information
      deliveryType: z.enum(["TWO_WHEELER", "BICYCLE", "WALKING"], {
        required_error: "Please select your preferred delivery mode",
      }),
      vehicleType: z.string().trim().optional().or(z.literal("")),
      vehicleNumber: z.string().trim().optional().or(z.literal("")),
      licenseNumber: z.string().trim().optional().or(z.literal("")),
      emergencyContactName: z
        .string({ required_error: "Emergency contact name is required" })
        .trim()
        .min(2, "Emergency contact name must be at least 2 characters")
        .max(100, "Emergency contact name cannot exceed 100 characters"),
      emergencyContactPhone: z
        .string({ required_error: "Emergency contact phone is required" })
        .trim()
        .regex(/^\+?[0-9]{10,14}$/, "Please provide a valid 10-14 digit emergency contact phone number"),

      // D. Document Identifiers
      identityDocumentType: z.string().trim().optional().default("Aadhaar Card"),
      identityDocumentNumber: z.string().trim().optional().or(z.literal("")),

      // E. Consent and Declarations
      accurateInfoDeclaration: z.preprocess((val) => {
        if (typeof val === "string") return val === "true" || val === "1";
        return Boolean(val);
      }, z.boolean().refine((val) => val === true, {
        message: "You must confirm that the information provided is accurate and true.",
      })),
      termsConsent: z.preprocess((val) => {
        if (typeof val === "string") return val === "true" || val === "1";
        return Boolean(val);
      }, z.boolean().refine((val) => val === true, {
        message: "You must agree to the delivery partner terms and privacy policy.",
      })),
    })
    .superRefine((data, context) => {
      // Age validation: Must be at least 18 years old
      if (data.dateOfBirth) {
        const birthDate = new Date(data.dateOfBirth);
        if (isNaN(birthDate.getTime())) {
          context.addIssue({
            code: "custom",
            path: ["dateOfBirth"],
            message: "Please provide a valid date of birth (YYYY-MM-DD)",
          });
        } else {
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          if (age < 18) {
            context.addIssue({
              code: "custom",
              path: ["dateOfBirth"],
              message: "Delivery partners must be at least 18 years of age",
            });
          }
        }
      }

      // Conditional vehicle & license requirements: only if TWO_WHEELER
      if (data.deliveryType === "TWO_WHEELER") {
        if (!data.vehicleType || !data.vehicleType.trim()) {
          context.addIssue({
            code: "custom",
            path: ["vehicleType"],
            message: "Vehicle type (Motorcycle, Scooter, EV) is required for two-wheeler delivery",
          });
        }
        if (!data.vehicleNumber || !data.vehicleNumber.trim()) {
          context.addIssue({
            code: "custom",
            path: ["vehicleNumber"],
            message: "Vehicle registration number (RC) is required for two-wheeler delivery",
          });
        }
        if (!data.licenseNumber || !data.licenseNumber.trim()) {
          context.addIssue({
            code: "custom",
            path: ["licenseNumber"],
            message: "Driving license number is required for motorized two-wheeler delivery",
          });
        }
      }
    }),
};
