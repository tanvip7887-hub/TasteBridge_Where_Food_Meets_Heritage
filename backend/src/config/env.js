import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env file relative to backend root directory
const envPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: envPath });

export const env = {
  PORT: process.env.PORT || 5000,
  CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173",
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  ORDER_CANCELLATION_WINDOW_MINUTES: Number.parseInt(process.env.ORDER_CANCELLATION_WINDOW_MINUTES || "5", 10),
  SOCIAL_COMMENT_RATE_LIMIT_PER_MINUTE: (() => {
    const configured = Number.parseInt(process.env.SOCIAL_COMMENT_RATE_LIMIT_PER_MINUTE || "10", 10);
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 100) : 10;
  })(),

  // Feature Flags
  EMAIL_ENABLED: process.env.EMAIL_ENABLED !== "false",
  RABBITMQ_ENABLED: process.env.RABBITMQ_ENABLED === "true",

  // SMTP Settings
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  SMTP_FROM:
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    '"TasteBridge" <no-reply@tastebridge.com>',

  // Cloudinary Settings
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",

  // RabbitMQ Settings
  RABBITMQ_URL: process.env.RABBITMQ_URL || "amqp://localhost:5672",
  RABBITMQ_EMAIL_QUEUE: process.env.RABBITMQ_EMAIL_QUEUE || "tastebridge.email",
};

export default env;
