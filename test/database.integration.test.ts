import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Database } from "../src/db.js";
import type { AppConfig, RpcEvent } from "../src/types.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("event, delivery, and cursor commit atomically and deduplicate", { skip: !databaseUrl }, async () => {
  const db = new Database(databaseUrl!);
  try {
    await db.migrate();
    const name = `integration-${randomUUID()}`;
    const config: AppConfig = {
      rpcUrl: "http://localhost:8000",
      network: "testnet",
      databaseUrl: databaseUrl!,
      admin: { host: "127.0.0.1", port: 8787 },
      poll: { intervalMs: 1000, pageSize: 100 },
      delivery: { concurrency: 1, timeoutMs: 1000, maxAttempts: 3, allowPrivateDestinations: true },
      subscription: {
        name,
        startLedger: 100,
        filters: [{ type: "contract" }],
        webhookUrl: "http://127.0.0.1:9999/hook",
        webhookSecretEnv: "TEST_SECRET"
      }
    };
    const passphrase = "Test SDF Network ; September 2015";
    const id = await db.configure(config, passphrase, 110);
    const event: RpcEvent = { id: `event-${randomUUID()}`, ledger: 100, type: "contract", topic: [], value: "AAAAAQ==", pagingToken: "pt-1" };
    assert.equal(await db.commitEventPage({ subscriptionId: id, passphrase, events: [{ event, normalized: null }], cursor: "cursor-1", scannedThroughLedger: 100, latestLedger: 110 }), 1);
    assert.equal(await db.commitEventPage({ subscriptionId: id, passphrase, events: [{ event, normalized: null }], cursor: "cursor-2", scannedThroughLedger: 100, latestLedger: 110 }), 0);
    const subscription = await db.getSubscription(id);
    assert.equal(subscription.lastCursor, "cursor-2");
    const counts = await db.pool.query("SELECT count(*)::integer AS count FROM events WHERE stellar_event_id = $1", [event.id]);
    assert.equal(counts.rows[0].count, 1);

    await assert.rejects(db.commitEventPage({
      subscriptionId: id,
      passphrase,
      events: [{ event: { ...event, id: `bad-${randomUUID()}`, ledger: Number.NaN }, normalized: null }],
      cursor: "cursor-that-must-rollback",
      scannedThroughLedger: 101,
      latestLedger: 110
    }));
    assert.equal((await db.getSubscription(id)).lastCursor, "cursor-2");
  } finally {
    await db.close();
  }
});
