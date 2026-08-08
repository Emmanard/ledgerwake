import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig, redactConfig } from "../src/config.js";

const valid = {
  rpcUrl: "https://soroban-testnet.stellar.org",
  network: "testnet",
  databaseUrl: "postgres://user:password@localhost/db",
  admin: { host: "127.0.0.1", port: 8787 },
  poll: { intervalMs: 5000, pageSize: 100 },
  delivery: { concurrency: 4, timeoutMs: 10000, maxAttempts: 10, allowPrivateDestinations: false },
  subscription: {
    name: "test",
    startLedger: "latest",
    filters: [{ type: "contract", contractIds: ["CA_TEST"] }],
    webhookUrl: "https://example.com/hook?secret=nope",
    webhookSecretEnv: "LEDGERWAKE_WEBHOOK_SECRET"
  }
};

test("accepts a bounded valid configuration and redacts sensitive URLs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledgerwake-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, JSON.stringify(valid));
  const config = await loadConfig(path);
  const redacted = redactConfig(config);
  assert.equal(config.poll.pageSize, 100);
  assert.equal(redacted.databaseUrl, "[REDACTED]");
  assert.equal((redacted.subscription as { webhookUrl: string }).webhookUrl, "https://example.com/hook");
});

test("rejects oversized RPC filter plans", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledgerwake-config-"));
  const path = join(dir, "config.json");
  const invalid = structuredClone(valid);
  invalid.subscription.filters = Array.from({ length: 6 }, () => ({ type: "contract", contractIds: ["C"] }));
  await writeFile(path, JSON.stringify(invalid));
  await assert.rejects(loadConfig(path), /Invalid configuration/);
});

test("rejects plaintext public RPC endpoints", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledgerwake-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, JSON.stringify({ ...valid, rpcUrl: "http://rpc.example.com" }));
  await assert.rejects(loadConfig(path), /rpcUrl must use HTTPS/);
});

test("rejects credentials and unsupported webhook protocols", async () => {
  const withCredentials = await temporaryConfig({
    ...valid,
    subscription: { ...valid.subscription, webhookUrl: "https://user:pass@example.com/hook" }
  });
  await assert.rejects(loadConfig(withCredentials), /must not contain credentials/);

  const ftp = await temporaryConfig({
    ...valid,
    delivery: { ...valid.delivery, allowPrivateDestinations: true },
    subscription: { ...valid.subscription, webhookUrl: "ftp://example.com/hook" }
  });
  await assert.rejects(loadConfig(ftp), /must use HTTPS/);
});

async function temporaryConfig(value: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ledgerwake-config-"));
  const path = join(dir, "config.json");
  await writeFile(path, JSON.stringify(value));
  return path;
}
