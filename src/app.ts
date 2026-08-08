import type { AppConfig } from "./types.js";
import { NETWORK_PASSPHRASES } from "./config.js";
import { Database } from "./db.js";
import { DeliveryWorker } from "./delivery.js";
import { Ingestor } from "./ingest.js";
import { log } from "./log.js";
import { Metrics } from "./metrics.js";
import { StellarRpcClient } from "./rpc.js";
import { createAdminServer } from "./server.js";
import { assertSafeDestination } from "./webhook.js";

export async function doctor(config: AppConfig): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = {};
  const db = new Database(config.databaseUrl);
  const rpc = new StellarRpcClient(config.rpcUrl);
  try {
    await db.ping();
    checks.database = "ok";
    const passphrase = await rpc.getNetworkPassphrase();
    checks.network = passphrase === NETWORK_PASSPHRASES[config.network] ? "ok" : "mismatch";
    checks.latestLedger = await rpc.getLatestLedger();
    await assertSafeDestination(config.subscription.webhookUrl, config.delivery.allowPrivateDestinations);
    checks.webhookDestination = "ok";
    const secret = process.env[config.subscription.webhookSecretEnv];
    checks.webhookSecret = secret && secret.length >= 32 ? "ok" : "missing_or_short";
    return checks;
  } finally {
    await db.close();
  }
}

export async function serve(config: AppConfig): Promise<void> {
  const db = new Database(config.databaseUrl);
  const metrics = new Metrics();
  const rpc = new StellarRpcClient(config.rpcUrl);
  await db.migrate();
  const passphrase = await rpc.getNetworkPassphrase();
  if (passphrase !== NETWORK_PASSPHRASES[config.network]) {
    await db.close();
    throw new Error(`RPC network passphrase does not match configured ${config.network} network`);
  }
  await assertSafeDestination(config.subscription.webhookUrl, config.delivery.allowPrivateDestinations);
  const secret = process.env[config.subscription.webhookSecretEnv];
  if (!secret || secret.length < 32) {
    await db.close();
    throw new Error(`${config.subscription.webhookSecretEnv} must contain at least 32 characters`);
  }
  const latest = await rpc.getLatestLedger();
  const subscriptionId = await db.configure(config, passphrase, latest);
  const ingestor = new Ingestor(config, db, rpc, metrics, subscriptionId, passphrase);
  const delivery = new DeliveryWorker(config, db, metrics);
  await db.recoverStaleDeliveries();
  const admin = await createAdminServer(config, db, metrics);
  await admin.listen({ host: config.admin.host, port: config.admin.port });

  const pollTimer = setInterval(() => void ingestor.pollOnce(), config.poll.intervalMs);
  const deliveryTimer = setInterval(() => void delivery.tick(), 250);
  pollTimer.unref();
  deliveryTimer.unref();
  void ingestor.pollOnce();
  void delivery.tick();
  log("info", "app", "Ledgerwake started", {
    network: config.network,
    admin: `${config.admin.host}:${config.admin.port}`,
    subscriptionId
  });

  const shutdown = async (signal: string): Promise<void> => {
    log("info", "app", "Graceful shutdown requested", { signal });
    clearInterval(pollTimer);
    clearInterval(deliveryTimer);
    await admin.close();
    await db.close();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));
  process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
}
