import amqp from "amqplib";
import env from "./env.js";
import { logger } from "../utils/logger.js";
import { isSmtpConfigured, sendVerificationEmail, sendPasswordResetEmail, sendPasswordResetOtpEmail } from "../services/email.service.js";

export const QUEUES = {
  EMAIL: env.RABBITMQ_EMAIL_QUEUE || "tastebridge.email",
};

let connection = null;
let channel = null;

// Connect to RabbitMQ and initialize channel & queues
export const connectRabbitMQ = async () => {
  if (channel && connection) {
    return { connection, channel };
  }

  const rabbitUrl = env.RABBITMQ_URL || "amqp://localhost:5672";

  try {
    logger.info(`[RabbitMQ] Connecting to RabbitMQ at ${rabbitUrl}...`);
    connection = await amqp.connect(rabbitUrl);

    connection.on("error", (err) => {
      logger.error(`[RabbitMQ] Connection error: ${err.message}`);
      connection = null;
      channel = null;
    });

    connection.on("close", () => {
      logger.warn("[RabbitMQ] Connection closed.");
      connection = null;
      channel = null;
    });

    channel = await connection.createChannel();

    // Assert durable queue for emails
    await channel.assertQueue(QUEUES.EMAIL, {
      durable: true,
    });

    logger.info(`[RabbitMQ] Connected successfully. Queue '${QUEUES.EMAIL}' asserted.`);
    return { connection, channel };
  } catch (error) {
    logger.error(`[RabbitMQ] Failed to connect to RabbitMQ: ${error.message}`);
    connection = null;
    channel = null;
    return null;
  }
};

// Get active channel or try connecting
export const getChannel = async () => {
  if (!channel) {
    const res = await connectRabbitMQ();
    return res ? res.channel : null;
  }
  return channel;
};

// Helper to dispatch email directly via SMTP
const sendDirectSmtp = async (jobData) => {
  if (jobData.type === "PASSWORD_RESET_OTP") {
    return await sendPasswordResetOtpEmail(jobData);
  }
  if (jobData.type === "PASSWORD_RESET") {
    return await sendPasswordResetEmail(jobData);
  }
  return await sendVerificationEmail(jobData);
};

// Publish job to email queue (or direct SMTP if RabbitMQ is offline or no worker is consuming)
export const publishEmailJob = async (jobData) => {
  const activeChannel = await getChannel();

  if (!activeChannel) {
    if (isSmtpConfigured()) {
      logger.warn(
        `[RabbitMQ Offline] RabbitMQ is unavailable. Falling back to direct SMTP email delivery for: ${jobData.to}`
      );
      return await sendDirectSmtp(jobData);
    } else {
      const errorMsg =
        "RabbitMQ is offline and SMTP credentials are missing in backend/.env. Please start RabbitMQ or configure SMTP_USER & SMTP_PASSWORD.";
      logger.error(`[Email Queue] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // Check if there are active worker consumers listening on the queue
  let hasConsumers = false;
  try {
    const queueInfo = await activeChannel.checkQueue(QUEUES.EMAIL);
    hasConsumers = queueInfo.consumerCount > 0;
  } catch (e) {
    hasConsumers = false;
  }

  // If no worker process is currently consuming the queue, deliver directly via SMTP so email is not delayed
  if (!hasConsumers && isSmtpConfigured()) {
    logger.info(
      `[Direct Delivery] Queue '${QUEUES.EMAIL}' has no active workers. Delivering email directly via SMTP to: ${jobData.to}`
    );
    return await sendDirectSmtp(jobData);
  }

  try {
    const payloadBuffer = Buffer.from(JSON.stringify(jobData));
    const published = activeChannel.sendToQueue(
      QUEUES.EMAIL,
      payloadBuffer,
      {
        persistent: true, // Persist job to disk
      }
    );

    if (published) {
      logger.info(
        `[RabbitMQ] Email job successfully published to queue '${QUEUES.EMAIL}' for recipient: ${jobData.to}`
      );
      return true;
    } else {
      throw new Error("Channel write buffer full. Failed to publish message.");
    }
  } catch (error) {
    logger.error(`[RabbitMQ] Error publishing email job: ${error.message}`);
    throw error;
  }
};

// Close connection
export const closeRabbitMQ = async () => {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    logger.info("[RabbitMQ] Connection closed cleanly.");
  } catch (error) {
    logger.error(`[RabbitMQ] Error closing connection: ${error.message}`);
  } finally {
    channel = null;
    connection = null;
  }
};

export default {
  QUEUES,
  connectRabbitMQ,
  getChannel,
  publishEmailJob,
  closeRabbitMQ,
};
