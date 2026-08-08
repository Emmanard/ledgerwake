# Architecture

Ledgerwake is deliberately a single deployable service for the core MVP. The
runtime has two bounded worker loops and one local-first administration API.

```text
Stellar RPC -> ingestion loop -> PostgreSQL <- delivery loop -> HTTPS webhook
                                  |
                                  +-> admin API / CLI / Prometheus metrics
```

## Safety boundaries

- The ingestion transaction commits normalized events, pending deliveries, and
  the next cursor together. A crash cannot advance the cursor without the work.
- The canonical event identity is unique in PostgreSQL, making overlapping RPC
  pages and restarts idempotent.
- Delivery is at-least-once. A row is claimed with `FOR UPDATE SKIP LOCKED`, an
  attempt is recorded, and success or a bounded retry/dead transition follows.
- Webhook requests are signed over the exact timestamp and payload bytes.
- Destination DNS is resolved at connection time and every returned address is
  checked against private, loopback, link-local, multicast, and reserved ranges.
- The administration API binds to loopback by default. A non-loopback bind
  requires a bearer token and should sit behind authenticated TLS termination.

## Scale path

The MVP safely scales delivery workers horizontally because claims use row
locks. Ingestion remains one active poller per subscription. A production scale
release should add PostgreSQL advisory leadership, partition events by ledger,
introduce connection budgets, and benchmark before advertising throughput.

## Explicit non-goals

This release does not submit transactions, hold keys, guarantee exactly-once
HTTP side effects, provide a hosted control plane, or silently heal RPC history
gaps. These limits keep the initial trust boundary reviewable by two maintainers.
