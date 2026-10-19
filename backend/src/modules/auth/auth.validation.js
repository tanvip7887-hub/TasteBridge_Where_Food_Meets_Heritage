import { z } from "zod";

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
    phone: z
      .string()
      .trim()
      .optional()
      .nullable(),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }),
};

export const verifyOtpSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Verification code must be exactly 6 digits"),
  }),
};

export const resendOtpSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  }),
};

export const switchPortalSchema = {
  body: z.object({
    portal: z.enum(["CUSTOMER", "COOK", "DELIVERY_AGENT", "ADMIN"]),
  }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
  }),
};

export const verifyResetOtpSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format"),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Verification code must be exactly 6 digits"),
  }),
};

export const resetPasswordSchema = {
  body: z
    .object({
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Invalid email format"),
      resetToken: z.string().trim().min(1, "Reset token is required"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      confirmPassword: z.string().min(1, "Password confirmation is required"),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }),
};
