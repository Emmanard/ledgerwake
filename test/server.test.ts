import assert from "node:assert/strict";
import test from "node:test";
import { createAdminServer } from "../src/server.js";
import { Metrics } from "../src/metrics.js";
import type { AppConfig } from "../src/types.js";
import type { Database } from "../src/db.js";

function config(host: string, tokenEnv?: string): AppConfig {
  return {
    rpcUrl: "https://soroban-testnet.stellar.org",
    network: "testnet",
    databaseUrl: "postgres://ignored",
    admin: { host, port: 8787, ...(tokenEnv ? { tokenEnv } : {}) },
    poll: { intervalMs: 5_000, pageSize: 100 },
    delivery: {
      concurrency: 1,
      timeoutMs: 10_000,
      maxAttempts: 5,
      allowPrivateDestinations: false
    },
    subscription: {
      name: "test",
      startLedger: "latest",
      filters: [{ type: "contract", contractIds: ["CPLACEHOLDER"] }],
      webhookUrl: "https://example.com/hook",
      webhookSecretEnv: "TEST_WEBHOOK_SECRET"
    }
  };
}

const fakeDb = {
  ping: async () => undefined,
  status: async () => ({ ok: true }),
  listDeliveries: async () => [],
  replayDelivery: async () => false
} as unknown as Database;

test("remote administration requires a strong bearer token", async () => {
  await assert.rejects(
    createAdminServer(config("0.0.0.0", "MISSING_ADMIN_TOKEN"), fakeDb, new Metrics()),
    /requires admin\.tokenEnv/
  );
});

test("configured authentication protects readiness, metrics, and admin routes", async (context) => {
  const variable = "LEDGERWAKE_TEST_ADMIN_TOKEN";
  const token = "0123456789abcdef0123456789abcdef";
  process.env[variable] = token;
  context.after(() => delete process.env[variable]);
  const app = await createAdminServer(config("0.0.0.0", variable), fakeDb, new Metrics());
  context.after(async () => await app.close());

  assert.equal((await app.inject({ method: "GET", url: "/healthz" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/readyz" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/metrics" })).statusCode, 401);
  assert.equal((await app.inject({ method: "GET", url: "/v1/status" })).statusCode, 401);
  assert.equal(
    (await app.inject({
      method: "GET",
      url: "/v1/status",
      headers: { authorization: `Bearer ${token}` }
    })).statusCode,
    200
  );
});
