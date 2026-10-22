import nodemailer from "nodemailer";
import env from "../config/env.js";
import { logger } from "../utils/logger.js";

// Helper to check if SMTP configuration is provided
export const isSmtpConfigured = () => {
  return !!(
    env.SMTP_HOST &&
    env.SMTP_USER &&
    env.SMTP_PASSWORD
  );
};

// Create Nodemailer Transporter
export const buildSmtpTransportOptions = (config = env) => {
  const host = config.SMTP_HOST;
  const port = config.SMTP_PORT;
  const isGmailSubmission = host?.toLowerCase() === "smtp.gmail.com" && Number(port) === 587;

  return {
    host,
    port,
    // Gmail on port 587 negotiates TLS with STARTTLS, rather than implicit TLS.
    secure: isGmailSubmission ? false : config.SMTP_SECURE || Number(port) === 465,
    ...(isGmailSubmission ? { requireTLS: true } : {}),
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASSWORD,
    },
  };
};

export const createTransporter = () => {
  if (!isSmtpConfigured()) {
    return null;
  }

  return nodemailer.createTransport(buildSmtpTransportOptions());
};

// Verify SMTP connection (without sending test email)
export const verifySmtpConnection = async () => {
  if (!isSmtpConfigured()) {
    logger.warn(
      "[SMTP] SMTP configuration is unconfigured or incomplete in environment variables (SMTP_HOST, SMTP_USER, SMTP_PASSWORD required)."
    );
    return { success: false, reason: "SMTP credentials missing in configuration." };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    logger.info("[SMTP] SMTP connection verified successfully.");
    return { success: true };
  } catch (error) {
    logger.error(`[SMTP] SMTP connection failed: ${error.message}`);
    return { success: false, reason: error.message };
  }
};

// Send Verification OTP Email
export const sendVerificationEmail = async ({
  to,
  name,
  otp,
  expiresInMinutes = 10,
}) => {
  if (!isSmtpConfigured()) {
    const errMsg = "SMTP configuration is missing. Cannot deliver email.";
    logger.error(`[Email Service] ${errMsg}`);
    throw new Error(errMsg);
  }

  const transporter = createTransporter();
  const from = env.SMTP_FROM;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0; }
          .container { max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { background: #dc2626; color: #ffffff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-style: italic; }
          .content { padding: 32px 24px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px; }
          .otp-box { background: #f3f4f6; border-radius: 8px; border: 1px dashed #d1d5db; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #dc2626; margin: 0; }
          .warning { font-size: 13px; color: #6b7280; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
          .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>TasteBridge</h1>
            <p>Where Food Meets Heritage</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${name || "Food Explorer"},</div>
            <p>Your verification code for TasteBridge is:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>

            <p>This OTP expires in <strong>${expiresInMinutes} minutes</strong>.</p>
            
            <div class="warning">
              If you did not request this verification, you can safely ignore this email.
            </div>
          </div>
          <div class="footer">
            TasteBridge &bull; Where Food Meets Heritage
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `TasteBridge\nWhere Food Meets Heritage\n\nYour verification code:\n${otp}\n\nThis OTP expires in ${expiresInMinutes} minutes.\n\nIf you did not request this verification, you can safely ignore this email.\n\nTasteBridge\nWhere Food Meets Heritage`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "TasteBridge — Your Verification Code",
      text: textContent,
      html: htmlContent,
    });

    logger.info(`[Email Service] Verification email sent to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`[Email Service] Failed to send email to ${to}: ${error.message}`);
    throw error;
  }
};

// Send Password Reset Email
export const sendPasswordResetEmail = async ({
  to,
  name,
  resetUrl,
  expiresInMinutes = 15,
}) => {
  if (!isSmtpConfigured()) {
    const errMsg = "SMTP configuration is missing. Cannot deliver email.";
    logger.error(`[Email Service] ${errMsg}`);
    throw new Error(errMsg);
  }

  const transporter = createTransporter();
  const from = env.SMTP_FROM;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0; }
          .container { max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { background: #dc2626; color: #ffffff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-style: italic; }
          .content { padding: 32px 24px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px; }
          .btn-container { text-align: center; margin: 28px 0; }
          .btn { display: inline-block; background-color: #dc2626; color: #ffffff !important; font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 2px 6px rgba(220,38,38,0.25); }
          .warning { font-size: 13px; color: #6b7280; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
          .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>TasteBridge</h1>
            <p>Where Food Meets Heritage</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${name || "TasteBridge Member"},</div>
            <p><strong>Reset your password</strong></p>
            <p>Someone requested a password reset for your TasteBridge account. If this was you, click the button below to set a new password:</p>
            
            <div class="btn-container">
              <a href="${resetUrl}" class="btn" target="_blank">Yes, it's me</a>
            </div>

            <p>This password reset link will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
            
            <div class="warning">
              If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            TasteBridge &bull; Where Food Meets Heritage
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `TasteBridge\nWhere Food Meets Heritage\n\nReset your password\n\nSomeone requested a password reset for your TasteBridge account.\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link will expire in ${expiresInMinutes} minutes.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nTasteBridge`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "TasteBridge — Reset Your Password",
      text: textContent,
      html: htmlContent,
    });

    logger.info(`[Email Service] Password reset email sent to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`[Email Service] Failed to send password reset email to ${to}: ${error.message}`);
    throw error;
  }
};

// Send Password Reset OTP Email
export const sendPasswordResetOtpEmail = async ({
  to,
  name,
  otp,
  expiresInMinutes = 10,
}) => {
  if (!isSmtpConfigured()) {
    const errMsg = "SMTP configuration is missing. Cannot deliver email.";
    logger.error(`[Email Service] ${errMsg}`);
    throw new Error(errMsg);
  }

  const transporter = createTransporter();
  const from = env.SMTP_FROM;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 0; }
          .container { max-width: 560px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { background: #dc2626; color: #ffffff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.5px; }
          .header p { margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; font-style: italic; }
          .content { padding: 32px 24px; color: #374151; line-height: 1.6; }
          .greeting { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 12px; }
          .otp-box { background: #f3f4f6; border-radius: 8px; border: 1px dashed #d1d5db; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #dc2626; margin: 0; }
          .warning { font-size: 13px; color: #6b7280; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; }
          .footer { background: #f9fafb; padding: 16px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>TasteBridge</h1>
            <p>Where Food Meets Heritage</p>
          </div>
          <div class="content">
            <div class="greeting">Hello ${name || "Food Explorer"},</div>
            <p>Your password reset code for TasteBridge is:</p>
            
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
            </div>

            <p>This password reset code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
            
            <div class="warning">
              If you did not request a password reset, you can safely ignore this email. Your account remains secure.
            </div>
          </div>
          <div class="footer">
            TasteBridge &bull; Where Food Meets Heritage
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `TasteBridge\nWhere Food Meets Heritage\n\nYour password reset code:\n${otp}\n\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nTasteBridge`;

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject: "TasteBridge — Password Reset Verification Code",
      text: textContent,
      html: htmlContent,
    });

    logger.info(`[Email Service] Password reset OTP email sent to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`[Email Service] Failed to send password reset OTP email to ${to}: ${error.message}`);
    throw error;
  }
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

export const sendDeliveryCompletionOtpEmail = async ({ to, name, orderNumber, otp, expiresInMinutes = 10 }, options = {}) => {
  const smtpConfigured = options.smtpConfigured || isSmtpConfigured;
  if (!smtpConfigured()) throw new Error("SMTP configuration is missing. Cannot deliver email.");
  const safeName = escapeHtml(name || "TasteBridge customer");
  const safeOrderNumber = escapeHtml(orderNumber || "your order");
  const transporter = options.transporter || createTransporter();
  const info = await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "TasteBridge — Delivery verification code",
    text: `Hello ${name || "TasteBridge customer"},\n\nYour delivery verification code for order ${orderNumber || "your order"} is ${otp}. Share this code with your delivery agent only when your order has arrived. The code expires in ${expiresInMinutes} minutes. If you did not receive this delivery, do not share the code.\n\nTasteBridge`,
    html: `<!doctype html><html><body style="margin:0;background:#f9fafb;font-family:Arial,sans-serif;color:#374151"><main style="max-width:560px;margin:30px auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px"><h1 style="margin:0;color:#d2552b">TasteBridge</h1><p style="margin-top:4px;color:#6b7280">Where Food Meets Heritage</p><p>Hello ${safeName},</p><p>Use this code to confirm delivery of <strong>${safeOrderNumber}</strong>. Share it with your delivery agent only after your order has arrived.</p><p style="padding:20px;text-align:center;border:1px dashed #d1d5db;border-radius:8px;background:#f3f4f6;font-size:32px;font-weight:800;letter-spacing:8px;color:#d2552b">${escapeHtml(otp)}</p><p>This code expires in ${expiresInMinutes} minutes. If you have not received your order, do not share the code.</p></main></body></html>`,
  });
  // Do not include the registered recipient or SMTP message metadata in logs.
  logger.info("[Email Service] Delivery verification email accepted by SMTP.");
  return { success: true, messageId: info.messageId };
};

// Modular email dispatcher for all transactional emails
export const sendEmailJob = async (jobData) => {
  if (jobData.type === "EMAIL_OTP" || jobData.type === "VERIFICATION_OTP") {
    return await sendVerificationEmail(jobData);
  }
  if (jobData.type === "PASSWORD_RESET_OTP") {
    return await sendPasswordResetOtpEmail(jobData);
  }
  if (jobData.type === "PASSWORD_RESET") {
    return await sendPasswordResetEmail(jobData);
  }
  if (jobData.type === "DELIVERY_COMPLETION_OTP") {
    return await sendDeliveryCompletionOtpEmail(jobData);
  }
  logger.warn(`[Email Service] Unrecognized email job type: ${jobData.type}. Falling back to sendVerificationEmail.`);
  return await sendVerificationEmail(jobData);
};

export default {
  isSmtpConfigured,
  verifySmtpConnection,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetOtpEmail,
  sendDeliveryCompletionOtpEmail,
  sendEmailJob,
};
