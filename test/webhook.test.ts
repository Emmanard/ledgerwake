import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateAddress, isRetryableStatus, signPayload, verifyPayload } from "../src/webhook.js";
import { nextRetry } from "../src/delivery.js";

test("webhook signatures authenticate exact timestamp and body bytes", () => {
  const secret = "a".repeat(32);
  const signature = signPayload(secret, "1700000000", '{"ok":true}');
  assert.equal(verifyPayload(secret, "1700000000", '{"ok":true}', signature), true);
  assert.equal(verifyPayload(secret, "1700000001", '{"ok":true}', signature), false);
  assert.equal(verifyPayload(secret, "1700000000", '{"ok":false}', signature), false);
});

test("SSRF address classification blocks common private and metadata ranges", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "fe80::1"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("1.1.1.1"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("SSRF address classification blocks reserved and translation ranges", () => {
  for (const address of [
    "100.64.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "240.0.0.1",
    "::ffff:8.8.8.8",
    "100::1",
    "2001:db8::1"
  ]) assert.equal(isPrivateAddress(address), true, address);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("retry policy distinguishes transient and permanent status codes", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(400), false);
  assert.equal(isRetryableStatus(404), false);
});

test("full-jitter retry remains within the exponential bound", () => {
  const now = 1_700_000_000_000;
  assert.equal(nextRetry(1, now, () => 0).getTime(), now);
  assert.equal(nextRetry(3, now, () => 0.999).getTime() < now + 4000, true);
  assert.equal(nextRetry(30, now, () => 1).getTime(), now + 3_600_000);
});
