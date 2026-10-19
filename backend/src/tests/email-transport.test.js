import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSmtpTransportOptions } from "../services/email.service.js";

test("Gmail SMTP on port 587 uses STARTTLS with normal certificate verification", () => {
  const options = buildSmtpTransportOptions({
    SMTP_HOST: "smtp.gmail.com",
    SMTP_PORT: 587,
    SMTP_SECURE: true,
    SMTP_USER: "test-user@example.test",
    SMTP_PASSWORD: "test-password",
  });

  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal("tls" in options, false);
});

test("implicit TLS on port 465 remains enabled for other SMTP providers", () => {
  const options = buildSmtpTransportOptions({
    SMTP_HOST: "mail.example.test",
    SMTP_PORT: 465,
    SMTP_SECURE: false,
    SMTP_USER: "test-user@example.test",
    SMTP_PASSWORD: "test-password",
  });

  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, undefined);
  assert.equal("tls" in options, false);
});

test("registration response is enumeration-safe and does not claim inbox delivery", async () => {
  const controller = await readFile(new URL("../modules/auth/auth.controller.js", import.meta.url), "utf8");
  assert.match(controller, /If the supplied details are eligible for registration/);
  assert.match(controller, /may take a few minutes to arrive/);
  assert.match(controller, /Spam\/Junk folders/);
  assert.doesNotMatch(controller, /Email delivered to your inbox/);
});
