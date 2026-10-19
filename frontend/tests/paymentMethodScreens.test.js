import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEMO_FAILURE_CARD,
  DEMO_SUCCESS_CARD,
  formatCardNumber,
  formatExpiry,
  isDemoFailureCard,
  isValidExpiry,
  isValidLuhn,
  sanitizeDigits,
} from "../src/components/checkout/luhnValidation.js";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("luhnValidation correctly validates Luhn checksums and card numbers", () => {
  // Test valid demo cards
  assert.equal(isValidLuhn(DEMO_SUCCESS_CARD), true);
  assert.equal(isValidLuhn(DEMO_FAILURE_CARD), true);
  assert.equal(isValidLuhn("4111 1111 1111 1111"), true);
  assert.equal(isValidLuhn("5500 0000 0000 0004"), true);

  // Test invalid Luhn numbers
  assert.equal(isValidLuhn("4242 4242 4242 4241"), false);
  assert.equal(isValidLuhn("4000 0000 0000 0001"), false);
  assert.equal(isValidLuhn("1234 5678 9012 3456"), false);

  // Test invalid lengths
  assert.equal(isValidLuhn("1234"), false);
  assert.equal(isValidLuhn(""), false);
  assert.equal(isValidLuhn("123456789012345678901"), false);

  // Test sanitizeDigits
  assert.equal(sanitizeDigits("4242-4242-4242-4242"), "4242424242424242");
  assert.equal(sanitizeDigits("abc123xyz45"), "12345");

  // Test formatCardNumber
  assert.equal(formatCardNumber("4242424242424242"), "4242 4242 4242 4242");
  assert.equal(formatCardNumber("42424"), "4242 4");

  // Test formatExpiry
  assert.equal(formatExpiry("12"), "12");
  assert.equal(formatExpiry("1228"), "12/28");

  // Test isDemoFailureCard
  assert.equal(isDemoFailureCard(DEMO_FAILURE_CARD), true);
  assert.equal(isDemoFailureCard("4000000000000002"), true);
  assert.equal(isDemoFailureCard(DEMO_SUCCESS_CARD), false);
  assert.equal(isDemoFailureCard("4242424242424242"), false);
});

test("luhnValidation correctly validates future card expiry dates", () => {
  const refDate = new Date("2026-10-16T12:00:00Z");

  // Future valid dates
  assert.equal(isValidExpiry("12/28", refDate), true);
  assert.equal(isValidExpiry("10/26", refDate), true); // Current month is valid
  assert.equal(isValidExpiry("11/26", refDate), true);
  assert.equal(isValidExpiry("01/30", refDate), true);

  // Past dates
  assert.equal(isValidExpiry("09/26", refDate), false);
  assert.equal(isValidExpiry("12/25", refDate), false);
  assert.equal(isValidExpiry("01/20", refDate), false);

  // Invalid formats and months
  assert.equal(isValidExpiry("13/28", refDate), false);
  assert.equal(isValidExpiry("00/28", refDate), false);
  assert.equal(isValidExpiry("invalid", refDate), false);
  assert.equal(isValidExpiry("1228", refDate), false);

  // Far future (> 25 years)
  assert.equal(isValidExpiry("12/60", refDate), false);
});

test("UpiScreen provides UPI ID validation, example IDs, and safe QR payment guidance", async () => {
  const upiSource = await source("../src/components/checkout/UpiScreen.jsx");

  // Format validation regex
  assert.match(upiSource, /UPI_REGEX/);
  assert.match(upiSource, /@\[a-zA-Z\]\{2,64\}\$/);

  // Example IDs for all four supported apps
  assert.match(upiSource, /DEMO_SHORTCUTS/);
  for (const app of ["GPay", "PhonePe", "Paytm", "BHIM"]) {
    assert.match(upiSource, new RegExp(app));
  }

  // QR prefix and payload format
  assert.match(upiSource, /TASTEBRIDGE-DEMO:\$\{reference/);

  // 5-minute countdown (300 seconds)
  assert.match(upiSource, /countdown,\s*setCountdown\]\s*=\s*useState\(300\)/);
  assert.match(upiSource, /formatTime/);

  // Expiry state handling and regeneration
  assert.match(upiSource, /QR Code Expired/);
  assert.match(upiSource, /Generate New QR/);
  assert.match(upiSource, /handleGenerateNewQr/);
  assert.match(upiSource, /setCountdown\(300\)/);

  // Clearly labelled simulated scan action and QR safety guidance
  assert.match(upiSource, /Illustrative QR only/);
  assert.match(upiSource, /Do not scan it with a banking app/);
  assert.match(upiSource, /Example UPI IDs/);

  // Sensitive UPI data is never sent in confirmation calls (only outcome flags)
  assert.match(upiSource, /onConfirm\("SUCCESS"\)/);
  assert.doesNotMatch(upiSource, /onConfirm\([^)]*upiId/);
});

test("CardScreen enforces local-only state, formatting, Luhn validation, and safe failure routing", async () => {
  const cardSource = await source("../src/components/checkout/CardScreen.jsx");

  // Check for the 4 card input fields
  assert.match(cardSource, /Card number/);
  assert.match(cardSource, /Cardholder name/);
  assert.match(cardSource, /Expiry date/);
  assert.match(cardSource, /CVV/);

  // Check local state cleanup on unmount
  assert.match(cardSource, /return\s*\(\)\s*=>\s*\{\s*setCardNumber\(""\)/);
  assert.match(cardSource, /setCardholderName\(""\)/);
  assert.match(cardSource, /setExpiry\(""\)/);
  assert.match(cardSource, /setCvv\(""\)/);

  // Check Luhn and expiry validation integration
  assert.match(cardSource, /isValidLuhn/);
  assert.match(cardSource, /isValidExpiry/);
  assert.match(cardSource, /formatCardNumber/);
  assert.match(cardSource, /formatExpiry/);

  // Designated failure card routes safely to mock failure outcome without transmitting card data
  assert.match(cardSource, /if\s*\(isDemoFailureCard\(cardNumber\)\)\s*\{\s*onConfirm\("FAILURE"\)/);
  assert.match(cardSource, /else\s*\{\s*onConfirm\("SUCCESS"\)/);

  // Sensitive card fields never passed to onConfirm or persisted to storage
  assert.doesNotMatch(cardSource, /onConfirm\([^)]*(?:cardNumber|cvv|expiry)/);
  assert.doesNotMatch(cardSource, /sessionStorage/);
  assert.doesNotMatch(cardSource, /localStorage/);
  assert.doesNotMatch(cardSource, /name=["'](?:cardNumber|cvv|expiry)["']/i);
});

test("NetBankingScreen renders selectable bank tiles without fake sign-in controls", async () => {
  const bankSource = await source("../src/components/checkout/NetBankingScreen.jsx");

  // 6 selectable banks
  for (const bank of ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank"]) {
    assert.match(bankSource, new RegExp(bank));
  }

  // Responsive 2-column grid and radiogroup semantics
  assert.match(bankSource, /grid-cols-1 sm:grid-cols-2/);
  assert.match(bankSource, /role="radiogroup"/);
  assert.match(bankSource, /role="radio"/);
  assert.match(bankSource, /aria-checked=/);

  // The shared payment notice explains this is simulated; no login fields are present.
  assert.doesNotMatch(bankSource, /Net Banking Demo|mock net banking authorization/);
  assert.match(bankSource, /onConfirm\("SUCCESS"\)/);
  assert.doesNotMatch(bankSource, /type=["']password["']|<input/i);
});

test("WalletScreen renders 4 selectable wallet tiles in a responsive grid with safe simulation", async () => {
  const walletSource = await source("../src/components/checkout/WalletScreen.jsx");

  // 4 selectable wallets
  for (const wallet of ["Paytm Wallet", "PhonePe Wallet", "Amazon Pay", "MobiKwik"]) {
    assert.match(walletSource, new RegExp(wallet));
  }

  // Responsive 2-column grid and radiogroup semantics
  assert.match(walletSource, /grid-cols-1 sm:grid-cols-2/);
  assert.match(walletSource, /role="radiogroup"/);
  assert.match(walletSource, /role="radio"/);
  assert.match(walletSource, /aria-checked=/);

  // Example balances have been removed; the shared payment notice explains simulation.
  assert.doesNotMatch(walletSource, /Digital Wallet Demo|mockBalance|Available balance/);
  assert.match(walletSource, /onConfirm\("SUCCESS"\)/);
  assert.doesNotMatch(walletSource, /<input/i);
});

test("PaymentSuccess and PaymentFailed present clear result states, actions, and backend verification", async () => {
  const [successSource, failedSource] = await Promise.all([
    source("../src/components/checkout/PaymentSuccess.jsx"),
    source("../src/components/checkout/PaymentFailed.jsx"),
  ]);

  // PaymentSuccess
  assert.doesNotMatch(successSource, /Demo payment succeeded/);
  assert.match(successSource, /SUCCEEDED · PAID/);
  assert.match(successSource, /View confirmed orders/);
  assert.match(successSource, /orderCount/);
  assert.match(successSource, /reference/);

  // PaymentFailed
  assert.doesNotMatch(failedSource, /Mock payment failed|No order was fulfilled/);
  assert.match(failedSource, /Back to checkout/);
  assert.match(failedSource, /Try again/);
  assert.match(failedSource, /reference/);
});

test("CheckoutPage integrates all method screens, Escape navigation, processing lock, and preserves COD", async () => {
  const pageSource = await source("../src/pages/CheckoutPage.jsx");

  // Method components are imported and rendered
  assert.match(pageSource, /import\s*\{\s*UpiScreen\s*\}\s*from/);
  assert.match(pageSource, /import\s*\{\s*CardScreen\s*\}\s*from/);
  assert.match(pageSource, /import\s*\{\s*NetBankingScreen\s*\}\s*from/);
  assert.match(pageSource, /import\s*\{\s*WalletScreen\s*\}\s*from/);
  assert.match(pageSource, /import\s*\{\s*PaymentSuccess\s*\}\s*from/);
  assert.match(pageSource, /import\s*\{\s*PaymentFailed\s*\}\s*from/);

  assert.match(pageSource, /<UpiScreen/);
  assert.match(pageSource, /<CardScreen/);
  assert.match(pageSource, /<NetBankingScreen/);
  assert.match(pageSource, /<WalletScreen/);
  assert.match(pageSource, /<PaymentSuccess/);
  assert.match(pageSource, /<PaymentFailed/);

  // Escape key handler prevents closing during processing
  assert.match(pageSource, /event\.key === "Escape"/);
  assert.match(pageSource, /if\s*\(paymentBusy\)\s*\{\s*event\.preventDefault\(\);\s*return;\s*\}/);

  // Server-returned amount is displayed (never browser-invented)
  assert.match(pageSource, /formatPrice\(paymentAttempt\?\.amount \?\? totals\.totalAmount\)/);

  // COD behavior remains intact
  assert.match(pageSource, /paymentMethod === "COD"/);
  assert.match(pageSource, /Confirm COD order/);
  assert.match(pageSource, /orderApi\.placeOrder\(\{ addressId: selectedAddressId, paymentMethod, idempotencyKey: getRequestKey\(\) \}\)/);

  // No fake security claims
  assert.doesNotMatch(pageSource, /\b(?:256-bit|SSL|Secure & Encrypted)\b/i);

  // Visible disclaimer and no hidden test-only controls
  assert.match(pageSource, /Simulated checkout only/);
  assert.match(pageSource, /No payment provider is contacted/);
  assert.doesNotMatch(pageSource, /Direct simulation|Simulate Success|Simulate Failure/);
});
