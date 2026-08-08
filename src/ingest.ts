import { normalizeEvent } from "./codec.js";
import { Database } from "./db.js";
import { log } from "./log.js";
import { Metrics } from "./metrics.js";
import { RpcError, StellarRpcClient } from "./rpc.js";
import type { AppConfig } from "./types.js";

export class Ingestor {
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly db: Database,
    private readonly rpc: StellarRpcClient,
    private readonly metrics: Metrics,
    private readonly subscriptionId: string,
    private readonly passphrase: string
  ) {}

  async pollOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const subscription = await this.db.getSubscription(this.subscriptionId);
      if (["PAUSED", "GAP_DETECTED"].includes(subscription.status)) return;
      const latest = await this.rpc.getLatestLedger();
      const page = await this.rpc.getEvents({
        filters: this.config.subscription.filters,
        limit: this.config.poll.pageSize,
        ...(subscription.lastCursor
          ? { cursor: subscription.lastCursor }
          : { startLedger: (subscription.lastIngestedLedger ?? latest - 1) + 1 })
      });
      const finalCursor = page.cursor ?? page.events.at(-1)?.pagingToken;
      const scannedThrough = page.events.at(-1)?.ledger ?? page.latestLedger ?? latest;
      const inserted = await this.db.commitEventPage({
        subscriptionId: this.subscriptionId,
        passphrase: this.passphrase,
        events: page.events.map((event) => ({ event, normalized: normalizeEvent(event) })),
        ...(finalCursor ? { cursor: finalCursor } : {}),
        scannedThroughLedger: scannedThrough,
        latestLedger: latest
      });
      this.metrics.eventsIngested.inc(inserted);
      this.metrics.ingestionLag.set(Math.max(0, latest - scannedThrough));
      this.metrics.rpcRequests.inc({ result: "success" });
      this.metrics.gaps.set(0);
      if (inserted > 0) log("info", "ingest", "Committed Stellar event page", { inserted, scannedThrough });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      this.metrics.rpcRequests.inc({ result: "error" });
      if (isHistoryGap(error)) {
        await this.db.markSubscription(this.subscriptionId, "GAP_DETECTED", message);
        this.metrics.gaps.set(1);
        log("error", "ingest", "Event continuity cannot be proven; subscription stopped", { message });
      } else {
        log("warn", "ingest", "Polling cycle failed; cursor was not advanced", { message });
      }
    } finally {
      this.running = false;
    }
  }
}

function isHistoryGap(error: unknown): boolean {
  if (!(error instanceof RpcError)) return false;
  return /(startledger|start ledger|oldest ledger|retention|before.*ledger|history.*unavailable)/i.test(error.message);
}
