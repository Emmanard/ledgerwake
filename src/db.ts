import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import type { AppConfig, ClaimedDelivery, RpcEvent, StoredEvent, SubscriptionStatus } from "./types.js";

const { Pool } = pg;

export class Database {
  readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10, statement_timeout: 15_000 });
    this.pool.on("error", (error) => {
      process.stderr.write(`${JSON.stringify({ level: "error", component: "database", message: error.message })}\n`);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async migrate(): Promise<void> {
    const sql = await readFile(resolve(process.cwd(), "migrations/001_init.sql"), "utf8");
    await this.pool.query(sql);
  }

  async configure(config: AppConfig, passphrase: string, latestLedger: number): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const hash = networkHash(passphrase);
      const existing = await client.query<{ id: string; last_cursor: string | null }>(
        "SELECT id, last_cursor FROM subscriptions WHERE name = $1 FOR UPDATE",
        [config.subscription.name]
      );
      let subscriptionId: string;
      if (existing.rowCount) {
        subscriptionId = existing.rows[0]!.id;
        await client.query(
          `UPDATE subscriptions
             SET filters = $2::jsonb, network = $3, network_passphrase_hash = $4,
                 status = CASE WHEN status = 'PAUSED' THEN status ELSE 'STARTING' END,
                 error_message = NULL, updated_at = now()
           WHERE id = $1`,
          [subscriptionId, JSON.stringify(config.subscription.filters), config.network, hash]
        );
      } else {
        subscriptionId = randomUUID();
        const initialLedger = config.subscription.startLedger === "latest"
          ? latestLedger
          : config.subscription.startLedger - 1;
        await client.query(
          `INSERT INTO subscriptions
             (id, name, network, network_passphrase_hash, filters, status, last_ingested_ledger, last_seen_latest_ledger)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'STARTING', $6, $7)`,
          [subscriptionId, config.subscription.name, config.network, hash, JSON.stringify(config.subscription.filters), initialLedger, latestLedger]
        );
      }

      await client.query(
        `INSERT INTO destinations (id, subscription_id, url, secret_env)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (subscription_id)
         DO UPDATE SET url = EXCLUDED.url, secret_env = EXCLUDED.secret_env, updated_at = now()`,
        [randomUUID(), subscriptionId, config.subscription.webhookUrl, config.subscription.webhookSecretEnv]
      );
      await client.query("COMMIT");
      return subscriptionId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getSubscription(id: string): Promise<{
    id: string;
    status: SubscriptionStatus;
    lastCursor: string | null;
    lastIngestedLedger: number | null;
  }> {
    const result = await this.pool.query<{
      id: string;
      status: SubscriptionStatus;
      last_cursor: string | null;
      last_ingested_ledger: string | null;
    }>("SELECT id, status, last_cursor, last_ingested_ledger FROM subscriptions WHERE id = $1", [id]);
    const row = result.rows[0];
    if (!row) throw new Error(`Subscription ${id} not found`);
    return {
      id: row.id,
      status: row.status,
      lastCursor: row.last_cursor,
      lastIngestedLedger: row.last_ingested_ledger === null ? null : Number(row.last_ingested_ledger)
    };
  }

  async commitEventPage(input: {
    subscriptionId: string;
    passphrase: string;
    events: Array<{ event: RpcEvent; normalized: unknown | null }>;
    cursor?: string;
    scannedThroughLedger: number;
    latestLedger: number;
  }): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM subscriptions WHERE id = $1 FOR UPDATE", [input.subscriptionId]);
      let inserted = 0;
      for (const item of input.events) {
        const eventId = randomUUID();
        const eventResult = await client.query<{ id: string; inserted: boolean }>(
          `INSERT INTO events
             (id, network_passphrase_hash, stellar_event_id, ledger_sequence, ledger_closed_at,
              contract_id, event_type, topic_raw, value_raw, normalized, transaction_hash, paging_token)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12)
           ON CONFLICT (network_passphrase_hash, stellar_event_id)
           DO UPDATE SET stellar_event_id = EXCLUDED.stellar_event_id
           RETURNING id, (xmax = 0) AS inserted`,
          [
            eventId,
            networkHash(input.passphrase),
            item.event.id,
            item.event.ledger,
            item.event.ledgerClosedAt ?? null,
            item.event.contractId ?? null,
            item.event.type,
            JSON.stringify(item.event.topic),
            item.event.value,
            item.normalized === null ? null : JSON.stringify(toJsonSafe(item.normalized)),
            item.event.txHash ?? null,
            item.event.pagingToken
          ]
        );
        const canonicalId = eventResult.rows[0]!.id;
        if (eventResult.rows[0]!.inserted) inserted += 1;
        const mapping = await client.query(
          `INSERT INTO subscription_events (subscription_id, event_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`,
          [input.subscriptionId, canonicalId]
        );
        if (mapping.rowCount) {
          await client.query(
            `INSERT INTO deliveries (id, destination_id, event_id, state)
             SELECT $1, id, $2, 'PENDING' FROM destinations
             WHERE subscription_id = $3 AND enabled = true
             ON CONFLICT (destination_id, event_id) DO NOTHING`,
            [randomUUID(), canonicalId, input.subscriptionId]
          );
        }
      }
      await client.query(
        `UPDATE subscriptions
         SET last_cursor = COALESCE($2, last_cursor), last_ingested_ledger = $3,
             last_seen_latest_ledger = $4, status = 'ACTIVE', error_message = NULL, updated_at = now()
         WHERE id = $1`,
        [input.subscriptionId, input.cursor ?? null, input.scannedThroughLedger, input.latestLedger]
      );
      await client.query("COMMIT");
      return inserted;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markSubscription(id: string, status: SubscriptionStatus, message?: string): Promise<void> {
    await this.pool.query(
      "UPDATE subscriptions SET status = $2, error_message = $3, updated_at = now() WHERE id = $1",
      [id, status, message ?? null]
    );
  }

  async recoverStaleDeliveries(): Promise<number> {
    const result = await this.pool.query(
      `UPDATE deliveries SET state = 'RETRY_WAIT', next_attempt_at = now(), last_error_class = 'worker_interrupted'
       WHERE state = 'IN_FLIGHT' AND next_attempt_at < now() - interval '5 minutes'`
    );
    return result.rowCount ?? 0;
  }

  async claimDelivery(): Promise<ClaimedDelivery | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<DeliveryRow>(
        `SELECT d.id, d.attempt_count, dst.id AS destination_id, dst.url, dst.secret_env,
                s.id AS subscription_id, s.name AS subscription_name,
                e.id AS event_internal_id, e.stellar_event_id, e.ledger_sequence,
                e.ledger_closed_at, e.contract_id, e.event_type, e.topic_raw,
                e.value_raw, e.normalized, e.transaction_hash, e.paging_token
           FROM deliveries d
           JOIN destinations dst ON dst.id = d.destination_id
           JOIN subscriptions s ON s.id = dst.subscription_id
           JOIN events e ON e.id = d.event_id
          WHERE d.state IN ('PENDING', 'RETRY_WAIT') AND d.next_attempt_at <= now() AND dst.enabled = true
          ORDER BY d.next_attempt_at, d.created_at
          FOR UPDATE OF d SKIP LOCKED LIMIT 1`
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const attempt = row.attempt_count + 1;
      await client.query(
        "UPDATE deliveries SET state = 'IN_FLIGHT', attempt_count = $2, next_attempt_at = now() WHERE id = $1",
        [row.id, attempt]
      );
      await client.query("COMMIT");
      return rowToClaim(row, attempt);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finishDelivery(input: {
    delivery: ClaimedDelivery;
    startedAt: Date;
    finishedAt: Date;
    statusCode?: number;
    errorClass?: string;
    outcome: "DELIVERED" | "RETRY_WAIT" | "DEAD";
    nextAttemptAt?: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO delivery_attempts
           (id, delivery_id, attempt_number, started_at, finished_at, status_code, error_class, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          randomUUID(), input.delivery.id, input.delivery.attemptCount, input.startedAt, input.finishedAt,
          input.statusCode ?? null, input.errorClass ?? null,
          Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime())
        ]
      );
      await client.query(
        `UPDATE deliveries
           SET state = $2, next_attempt_at = COALESCE($3, next_attempt_at), last_status_code = $4,
               last_error_class = $5, delivered_at = CASE WHEN $2 = 'DELIVERED' THEN now() ELSE delivered_at END
         WHERE id = $1`,
        [input.delivery.id, input.outcome, input.nextAttemptAt ?? null, input.statusCode ?? null, input.errorClass ?? null]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async status(): Promise<Record<string, unknown>> {
    const subscriptions = await this.pool.query(
      `SELECT id, name, network, status, last_ingested_ledger, last_seen_latest_ledger,
              error_message, created_at, updated_at FROM subscriptions ORDER BY name`
    );
    const deliveries = await this.pool.query(
      "SELECT state, count(*)::integer AS count FROM deliveries GROUP BY state ORDER BY state"
    );
    return { subscriptions: subscriptions.rows, deliveries: deliveries.rows };
  }

  async listDeliveries(limit = 100): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT d.id, d.state, d.attempt_count, d.next_attempt_at, d.last_status_code,
              d.last_error_class, e.stellar_event_id, e.ledger_sequence
       FROM deliveries d JOIN events e ON e.id = d.event_id
       ORDER BY d.created_at DESC LIMIT $1`,
      [Math.min(Math.max(limit, 1), 500)]
    );
    return result.rows;
  }

  async replayDelivery(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE deliveries SET state = 'RETRY_WAIT', next_attempt_at = now(), last_error_class = NULL
       WHERE id = $1 AND state IN ('DEAD', 'DELIVERED')`,
      [id]
    );
    return Boolean(result.rowCount);
  }
}

interface DeliveryRow {
  id: string;
  attempt_count: number;
  destination_id: string;
  url: string;
  secret_env: string;
  subscription_id: string;
  subscription_name: string;
  event_internal_id: string;
  stellar_event_id: string;
  ledger_sequence: string;
  ledger_closed_at: Date | null;
  contract_id: string | null;
  event_type: string;
  topic_raw: string[];
  value_raw: string;
  normalized: unknown | null;
  transaction_hash: string | null;
  paging_token: string;
}

function rowToClaim(row: DeliveryRow, attemptCount: number): ClaimedDelivery {
  const event: StoredEvent = {
    internalId: row.event_internal_id,
    id: row.stellar_event_id,
    ledger: Number(row.ledger_sequence),
    type: row.event_type,
    topic: row.topic_raw,
    value: row.value_raw,
    pagingToken: row.paging_token,
    normalized: row.normalized,
    ...(row.ledger_closed_at ? { ledgerClosedAt: row.ledger_closed_at.toISOString() } : {}),
    ...(row.contract_id ? { contractId: row.contract_id } : {}),
    ...(row.transaction_hash ? { txHash: row.transaction_hash } : {})
  };
  return {
    id: row.id,
    attemptCount,
    destinationId: row.destination_id,
    url: row.url,
    secretEnv: row.secret_env,
    subscriptionId: row.subscription_id,
    subscriptionName: row.subscription_name,
    event
  };
}

export function networkHash(passphrase: string): string {
  return createHash("sha256").update(passphrase).digest("hex");
}

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonSafe(item)]));
  }
  return value;
}
