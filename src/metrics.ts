import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export class Metrics {
  readonly registry = new Registry();
  readonly eventsIngested = new Counter({
    name: "ledgerwake_events_ingested_total",
    help: "Canonical Stellar events inserted",
    registers: [this.registry]
  });
  readonly rpcRequests = new Counter({
    name: "ledgerwake_rpc_cycles_total",
    help: "Ingestion polling cycles",
    labelNames: ["result"] as const,
    registers: [this.registry]
  });
  readonly ingestionLag = new Gauge({
    name: "ledgerwake_ingestion_lag_ledgers",
    help: "Difference between latest observed and scanned ledger",
    registers: [this.registry]
  });
  readonly deliveryAttempts = new Counter({
    name: "ledgerwake_delivery_attempts_total",
    help: "Webhook delivery attempts",
    labelNames: ["result"] as const,
    registers: [this.registry]
  });
  readonly deliveryLatency = new Histogram({
    name: "ledgerwake_delivery_latency_seconds",
    help: "Webhook delivery latency",
    registers: [this.registry]
  });
  readonly gaps = new Gauge({
    name: "ledgerwake_gap_detected",
    help: "One when the configured subscription has an unverified history gap",
    registers: [this.registry]
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "ledgerwake_process_" });
  }
}
