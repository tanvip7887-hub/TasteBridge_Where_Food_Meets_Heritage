import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const schema = await readFile(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../../prisma/migrations/20261018120000_add_dine_payment_persistence/migration.sql', import.meta.url),
  'utf8',
);

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected Prisma model ${name}`);
  return match[1];
}

test('Option A booking states are additive and retain legacy booking states', () => {
  const status = schema.match(/enum BookingStatus \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(status);
  for (const value of ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'ACCEPTED', 'REJECTED']) {
    assert.match(status, new RegExp(`\\b${value}\\b`));
  }
  assert.ok(status.indexOf('EXPIRED') < status.indexOf('ACCEPTED'));
  assert.ok(status.indexOf('ACCEPTED') < status.indexOf('REJECTED'));
  assert.match(migration, /ALTER TYPE "BookingStatus" ADD VALUE 'ACCEPTED';/);
  assert.match(migration, /ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';/);
});

test('Dine payment attempts snapshot amounts and deadlines with bounded idempotent attempts', () => {
  const booking = modelBlock('ExperienceBooking');
  const attempt = modelBlock('ExperiencePaymentAttempt');
  assert.match(booking, /acceptedAt\s+DateTime\?/);
  assert.match(booking, /rejectedAt\s+DateTime\?/);
  assert.match(booking, /paymentExpiresAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/);
  assert.match(migration, /"paymentExpiresAt" TIMESTAMPTZ\(3\)/);
  assert.match(attempt, /experienceBookingId\s+String/);
  assert.match(attempt, /attemptNumber\s+Int/);
  assert.match(attempt, /idempotencyKey\s+String/);
  assert.match(attempt, /amount\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(attempt, /currency\s+String\s+@default\("INR"\)/);
  assert.match(attempt, /expiresAt\s+DateTime\s+@db\.Timestamptz\(3\)/);
  assert.match(attempt, /verificationMode\s+ExperiencePaymentVerification\?/);
  assert.match(attempt, /@@unique\(\[experienceBookingId, attemptNumber\]\)/);
  assert.match(attempt, /@@unique\(\[experienceBookingId, idempotencyKey\]\)/);
  assert.match(migration, /CHECK \("attemptNumber" BETWEEN 1 AND 3\)/);
  assert.match(migration, /ExperiencePaymentAttempt_experienceBookingId_attemptNumber_key/);
  assert.match(migration, /ExperiencePaymentAttempt_experienceBookingId_idempotencyKey_key/);
  assert.match(migration, /ExperiencePaymentAttempt_status_expiresAt_idx/);
  assert.match(migration, /ExperiencePaymentAttempt_verification_source_check/);
});

test('Dine payment events support provider-event deduplication and distinguish simulated verification', () => {
  const event = modelBlock('ExperiencePaymentEvent');
  assert.match(event, /providerEventKey\s+String\?/);
  assert.match(event, /@@unique\(\[provider, providerEventKey\]\)/);
  assert.match(schema, /enum ExperiencePaymentVerification \{\s*SIMULATED\s+PROVIDER_VERIFIED/s);
  assert.match(schema, /enum ExperiencePaymentProvider \{\s*SIMULATED\s+RAZORPAY/s);
  assert.match(migration, /CREATE UNIQUE INDEX "ExperiencePaymentEvent_provider_providerEventKey_key"/);
  assert.match(migration, /"providerEventKey" TEXT/);
});

test('Dine refunds are independently durable, idempotent, retryable, and confirmation-based', () => {
  const refund = modelBlock('ExperienceRefund');
  assert.match(refund, /paymentAttemptId\s+String\s+@unique/);
  assert.match(refund, /idempotencyKey\s+String\s+@unique/);
  assert.match(refund, /amount\s+Decimal\s+@db\.Decimal\(14, 2\)/);
  assert.match(refund, /attemptCount\s+Int\s+@default\(0\)/);
  assert.match(refund, /nextAttemptAt\s+DateTime\?/);
  assert.match(refund, /lastAttemptAt\s+DateTime\?/);
  assert.match(refund, /succeededAt\s+DateTime\?/);
  assert.match(refund, /verificationMode\s+ExperiencePaymentVerification\?/);
  assert.match(migration, /ExperienceRefund_success_audit_check/);
  assert.match(migration, /CHECK \(\("status" = 'SUCCEEDED'\) = \("succeededAt" IS NOT NULL AND "verificationMode" IS NOT NULL\)\)/);
  assert.match(migration, /ExperienceRefund_verification_source_check/);
  assert.match(migration, /ExperienceRefund_status_nextAttemptAt_idx/);
});

test('migration does not alter or replace food checkout payment persistence', () => {
  assert.match(modelBlock('PaymentAttempt'), /checkoutId\s+String/);
  assert.match(modelBlock('PaymentAttempt'), /checkout\s+Checkout/);
  assert.doesNotMatch(migration, /(?:ALTER|DROP|TRUNCATE)\s+(?:TABLE|TYPE)\s+"(?:PaymentAttempt|PaymentAttemptEvent|Checkout)"/i);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:PaymentAttempt|PaymentAttemptEvent)"/);
});
