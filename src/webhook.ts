import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { ClaimedDelivery } from "./types.js";

export interface WebhookResult {
  statusCode: number;
  retryable: boolean;
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyPayload(secret: string, timestamp: string, body: string, supplied: string): boolean {
  const expected = signPayload(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhookEnvelope(delivery: ClaimedDelivery): Record<string, unknown> {
  return {
    specversion: "1.0",
    id: delivery.id,
    type: "stellar.contract.event",
    source: `ledgerwake://subscription/${delivery.subscriptionId}`,
    time: delivery.event.ledgerClosedAt ?? new Date().toISOString(),
    subject: delivery.event.id,
    data: {
      ledger: delivery.event.ledger,
      contractId: delivery.event.contractId ?? null,
      eventType: delivery.event.type,
      topics: delivery.event.topic,
      value: delivery.event.value,
      normalized: delivery.event.normalized,
      transactionHash: delivery.event.txHash ?? null
    }
  };
}

export async function assertSafeDestination(value: string, allowPrivate: boolean): Promise<void> {
  const url = new URL(value);
  if (url.username || url.password) throw new Error("Webhook URLs must not contain credentials");
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:")) {
    throw new Error("Webhook destination must use HTTPS");
  }
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Unsupported webhook protocol");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("Webhook hostname resolved to no addresses");
  if (!allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Webhook destination resolves to a private, loopback, link-local, or reserved address");
  }
}

export async function sendWebhook(input: {
  delivery: ClaimedDelivery;
  secret: string;
  timeoutMs: number;
  allowPrivate: boolean;
}): Promise<WebhookResult> {
  const url = new URL(input.delivery.url);
  const resolved = await lookup(url.hostname, { all: true, verbatim: true });
  if (!resolved.length) throw new Error("Webhook hostname resolved to no addresses");
  if (!input.allowPrivate && resolved.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("unsafe_destination");
  }
  const chosen = resolved[0]!;
  const body = JSON.stringify(webhookEnvelope(input.delivery));
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;

  return await new Promise<WebhookResult>((resolve, reject) => {
    const req = request(url, {
      method: "POST",
      timeout: input.timeoutMs,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "user-agent": "Ledgerwake/0.1.0-alpha.1",
        "x-ledgerwake-delivery": input.delivery.id,
        "x-ledgerwake-timestamp": timestamp,
        "x-ledgerwake-signature": signPayload(input.secret, timestamp, body)
      },
      lookup: (_hostname, _options, callback) => callback(null, chosen.address, chosen.family)
    }, (response) => {
      const statusCode = response.statusCode ?? 0;
      response.resume();
      response.once("end", () => resolve({ statusCode, retryable: isRetryableStatus(statusCode) }));
    });
    req.once("timeout", () => req.destroy(new Error("delivery_timeout")));
    req.once("error", reject);
    req.end(body);
  });
}

export function isRetryableStatus(status: number): boolean {
  return [408, 425, 429].includes(status) || status >= 500 || status === 0;
}

export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      a === 127 ||
      (a === 169 && b === 254) || (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0) || a! >= 224;
  }
  if (kind === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
      normalized.startsWith("fd") || /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:") || normalized.startsWith("100:") ||
      normalized.startsWith("2001:db8:");
  }
  return true;
}
