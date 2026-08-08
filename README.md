# Ledgerwake

**Every event leaves a wake.**

Ledgerwake is an open-source, self-hosted event delivery runtime for Stellar applications. It ingests a deliberately selected set of Stellar RPC events, commits events and cursor progress atomically to PostgreSQL, and delivers signed webhooks with retries, dead-letter state, and replay.

> Alpha status: `v0.1.0-alpha.1` is a working security-oriented vertical slice. It is suitable for testnet evaluation, not yet a claim of audited production readiness.

## Why it exists

Stellar RPC keeps only a bounded recent history and expects applications to ingest the data they need. A fragile polling script can permanently lose events after downtime or execute business actions twice. Ledgerwake makes those failure states explicit.

Its central invariant is:

> The cursor advances only in the same PostgreSQL transaction that stores canonical events, subscription matches, and webhook deliveries.

If RPC history has expired, Ledgerwake marks the subscription `GAP_DETECTED` and stops rather than silently jumping forward.

## Implemented in this alpha

- Stellar `getNetwork`, `getLatestLedger`, and cursor-paginated `getEvents`
- Testnet/Public Network identity verification
- RPC filter validation against documented limits
- Canonical event deduplication
- Atomic cursor, event, and delivery persistence
- Raw XDR preservation and best-effort SDK normalization
- HMAC-SHA256 webhook signatures
- DNS-at-connect-time SSRF checks with private/reserved ranges blocked by default
- Bounded timeouts, response sizes, concurrency, retry attempts, and exponential full jitter
- Persistent delivery states: `PENDING`, `IN_FLIGHT`, `DELIVERED`, `RETRY_WAIT`, `DEAD`
- Replay for dead or delivered webhooks
- Health, readiness, status, delivery, and Prometheus endpoints
- `wake` CLI
- PostgreSQL migrations and Docker Compose
- Unit tests and optional PostgreSQL integration test

## Non-goals

Ledgerwake is not a block explorer, general historical indexer, wallet, transaction signer, hosted SaaS, or replacement for Stellar RPC, Hubble, Galexie, Horizon, or managed indexers. It never accepts private keys or submits transactions.

## Quick start

Requirements: Node.js 24.18+, npm 11+, Docker.

```bash
npm ci
docker compose up -d postgres
cp ledgerwake.example.json ledgerwake.json
```

Edit `ledgerwake.json`:

1. Replace the contract ID and filter.
2. Choose a webhook URL.
3. Keep the local database URL aligned with `compose.yaml`:

```text
postgres://ledgerwake:ledgerwake-local-only@localhost:5432/ledgerwake
```

Set a strong webhook secret without placing it in configuration:

```bash
export LEDGERWAKE_WEBHOOK_SECRET='replace-with-at-least-32-random-characters'
```

Then:

```bash
npm run build
node dist/cli.js config validate --config ledgerwake.json
node dist/cli.js db migrate --config ledgerwake.json
node dist/cli.js doctor --config ledgerwake.json --output json
node dist/cli.js serve --config ledgerwake.json
```

Inspect it:

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/readyz
curl http://127.0.0.1:8787/v1/status
curl http://127.0.0.1:8787/metrics
```

## Verify webhook signatures

Ledgerwake sends:

- `X-Ledgerwake-Delivery`
- `X-Ledgerwake-Timestamp`
- `X-Ledgerwake-Signature: v1=<hex>`

The signed bytes are:

```text
<timestamp>.<exact raw request body>
```

Receivers must verify the raw body before parsing JSON, use constant-time comparison, reject timestamps outside a short tolerance, and deduplicate the delivery ID. See [docs/WEBHOOKS.md](docs/WEBHOOKS.md).

## CLI

```text
wake config validate
wake db migrate
wake doctor
wake serve
wake status
wake delivery list
wake delivery replay <id>
```

Every inspection command supports `--output json`.

## Development

```bash
npm run check
npm test
npm run build
npm audit --audit-level=high
```

Run the PostgreSQL integration test:

```bash
docker compose up -d postgres
TEST_DATABASE_URL='postgres://ledgerwake:ledgerwake-local-only@localhost:5432/ledgerwake' npm test
```

## Security and limitations

Read [SECURITY.md](SECURITY.md), [THREAT_MODEL.md](THREAT_MODEL.md), and [docs/LIMITATIONS.md](docs/LIMITATIONS.md) before deploying. In particular, this alpha has not received an independent security audit, supports one configured subscription/destination per process, and does not verify RPC responses across multiple providers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues must describe a real user/operator problem, explicit scope, acceptance tests, security implications, and documentation impact.

## License

Apache-2.0.
