# Ledgerwake: Core MVP and Maintainer Readiness Plan

Status: Core MVP implemented; public evidence and testnet demonstration pending  
Updated: 2026-08-08  
Maintainers: Emmanuel + Codex  
Product name: Ledgerwake  
Tagline: Every event leaves a wake.  
Technical description: Reliable event delivery for Stellar applications.

## 1. Executive decision

We will build Ledgerwake, an open-source, self-hostable event delivery runtime for Stellar applications.

Its job is narrow and important:

> Reliably ingest a deliberately selected set of Stellar events, retain them beyond an RPC server's short history window, and deliver them to application webhooks with deduplication, retries, gap detection, and replay.

This is not a blockchain explorer, general analytics platform, hosted SaaS, automation platform, or replacement for Mercury, Hubble, Galexie, Horizon, or Stellar RPC. Those boundaries are part of the product strategy, not temporary omissions.

The product thesis is supported by the Stellar RPC contract:

- RPC is explicitly not a historical indexer or primary application backend.
- Applications are expected to ingest the subset of data they need.
- `getEvents` history is bounded; a server can retain as little as 24 hours and supports at most roughly seven days.
- Repeated requests can return duplicate events, and clients are expected to deduplicate by event ID.
- `getEvents` has cursor pagination, a hard maximum page size of 10,000, at most five filters, five contract IDs per filter, and five topic filters.

The core value is therefore operational correctness, not access to an otherwise unavailable API.

### Product identity conventions

- Product and project: **Ledgerwake**
- Tagline: **Every event leaves a wake.**
- CLI executable: `wake`
- Repository target: `ledgerwake/ledgerwake`
- Container target: `ghcr.io/ledgerwake/ledgerwake`
- Package namespace target: `@ledgerwake/*`
- Configuration file: `ledgerwake.json`
- Environment variable prefix: `LEDGERWAKE_`
- URI scheme in webhook envelopes: `ledgerwake://`
- HTTP header prefix: `X-Ledgerwake-`
- Prometheus metric prefix: `ledgerwake_`

Repository, registry, package, domain, and trademark availability must be verified before the first public release. Until then, these identifiers are implementation targets rather than claims of ownership.

## 2. Why this remains the best two-person product

### Decision matrix

| Candidate | Pain is documented | Clear buyer/user | Can ship core in 6–8 weeks | Natural OSS contributions | Stellar-specific | Operational burden | Decision |
|---|---:|---:|---:|---:|---:|---:|---|
| Reliable event delivery runtime | 5 | 5 | 4 | 5 | 5 | 3 | Build |
| General historical indexer | 5 | 4 | 1 | 5 | 5 | 1 | Too broad |
| Soroban compatibility CI | 4 | 4 | 4 | 4 | 5 | 4 | Possible phase-two companion |
| Wallet or payments dApp | 3 | 4 | 3 | 3 | 4 | 2 | Crowded and security-heavy |
| Wave issue-management assistant | 3 | 3 | 4 | 3 | 1 | 4 | Wrong incentive and weak Stellar relevance |

Scores are relative, where 5 is favorable. Operational burden is scored with 5 meaning low burden.

### Outside-the-box product wedge

Most alternatives compete on the quantity of chain data indexed. Ledgerwake should compete on the confidence of delivery:

- Can an application prove it has not silently missed an event?
- Can it restart without double-processing business actions?
- Can a developer replay exactly the delivery that failed?
- Can a webhook receiver verify the sender and reject a replay attack?
- Can the operator see how far ingestion is behind the latest ledger?
- Can the system stop rather than pretend success when RPC history has already expired?

The initial user is a small Stellar application team that does not want to operate a complete indexer but cannot accept fragile cron scripts.

## 3. Product principles

1. **Correctness before throughput.** Silent loss is worse than visible downtime.
2. **At-least-once, never falsely exactly-once.** We provide stable event and delivery IDs so receivers can be idempotent.
3. **Fail closed on unverifiable gaps.** If the cursor predates the provider's oldest retained ledger, mark the subscription `GAP_DETECTED` and require explicit recovery.
4. **Store raw truth and normalized views.** Preserve canonical raw XDR/base64 values alongside decoded JSON so future decoder changes do not destroy evidence.
5. **One process first.** A modular monolith minimizes operational complexity while preserving clean module boundaries.
6. **No private keys.** Ledgerwake observes events and delivers notifications; it never signs or submits transactions in the MVP.
7. **Secure defaults.** Webhooks are signed; secrets are redacted; admin APIs bind to loopback unless explicitly configured.
8. **Boring infrastructure.** PostgreSQL, HTTP, JSON, Docker, and structured logs.
9. **Contributor-friendly internals.** Stable interfaces, tests, fixtures, small modules, and written architectural decisions.
10. **Wave is a growth channel, not the product purpose.** No artificial work will be manufactured for rewards.

### Approved stack baseline

Architecture is finalized on TypeScript and Node.js. Exact package integrity is frozen only when the repository lockfile is generated and independently checked; a version number by itself is not proof that an artifact is safe.

Implemented lockfile baseline, registry-audited and regression-tested on 2026-08-08:

| Layer | Selection | Candidate version | Reason |
|---|---|---:|---|
| Runtime | Node.js LTS | `24.18.0` | Supported LTS line and current LTS patch |
| Language | TypeScript | `7.0.2` | Compiler only; no production runtime dependency |
| Stellar protocol/XDR | `@stellar/stellar-sdk` | `16.2.0` | Official SDK; current protocol decoding is security- and correctness-relevant |
| HTTP administration API | `fastify` | `5.11.3` | Maintained, schema-based request handling |
| PostgreSQL client | `pg` | `8.23.0` | Mature, parameterized-query support, no ORM abstraction |
| Configuration/API validation | `ajv` | `8.20.0` | Strict JSON Schema validation |
| Metrics | `prom-client` | `15.1.3` | Small, established Prometheus/OpenMetrics implementation |
| Primary datastore | PostgreSQL | latest supported minor of major `18` | Five-year upstream major-version support; always run the latest security/bug-fix minor |

The exact versions above are locked, not a claim of invulnerability. The 2026-08-08 npm advisory snapshot reported zero known vulnerabilities, the resolved `fast-uri` versions are `3.1.5` and `4.1.2`, and the complete suite passed after the upgrades. Registry state and advisories can change, so CI must repeat the checks.

### Deliberately avoided dependencies

- No ORM: migrations and parameterized SQL are maintained directly.
- No Axios or other HTTP client: use Node's built-in `fetch`/Undici implementation.
- No Commander or CLI framework: use `node:util.parseArgs`.
- No third-party cryptography package: use `node:crypto` and standard constructions only.
- No UUID package: use `crypto.randomUUID()`.
- No retry, queue, or scheduler package: the bounded state machines are small enough to own.
- No dotenv package: use Node's supported environment-file mechanism for local development.
- No YAML parser: configuration is JSON plus environment variables.
- No application test framework initially: use `node:test`, with property/fuzz tooling added only after review.
- No SQLite dependency in the security-first core MVP.

### Dependency-admission procedure

No dependency is accepted merely because `npm audit` is clean.

1. Confirm the package is linked to the expected official repository and maintainers.
2. Review release notes, publish timing, provenance where available, and unexpected ownership changes.
3. Inspect the package tarball contents, install scripts, and the diff from the previously trusted release.
4. Query GitHub Advisory Database, OSV, and npm audit for the package and complete transitive graph.
5. Verify known vulnerable transitives are patched; for example, `fast-uri` must resolve to at least `3.1.1` because earlier versions have a 2026 path-normalization vulnerability.
6. Generate and review the exact lockfile; CI uses `npm ci`, never unconstrained installation.
7. Use an initial quarantine window for newly published versions unless a protocol or security fix makes immediate adoption necessary.
8. Build an SBOM and scan both the dependency graph and final container.
9. Pin the runtime container by immutable digest and verify release provenance/checksums.
10. Re-run the full checks on every upgrade; automatic dependency PRs are never automatically merged.

No credible team can guarantee that a package is “attack-free” or uncompromised. Our defensible claim is narrower: dependencies are minimized, provenance and known advisories are checked, artifacts are locked and reproducible, and new evidence triggers rapid replacement or patching.

## 4. MVP scope

### In scope

- Testnet and Public Network configuration.
- One configured RPC endpoint per runtime, with health checking.
- Contract and topic filters that map safely to `getEvents` constraints.
- Cursor-based event polling.
- Deduplication using the Stellar event ID plus network identity.
- Atomic persistence of events and cursor progress.
- Raw base64/XDR preservation and best-effort normalized JSON.
- PostgreSQL persistence for development and production, supplied through Docker Compose locally.
- HTTP webhook destinations.
- HMAC-SHA256 webhook signatures.
- Retry with bounded exponential backoff and jitter.
- Dead-letter queue.
- Manual replay by event, ledger range, delivery, or subscription.
- Gap detection and an explicit degraded state.
- Health, readiness, lag, and Prometheus metrics endpoints.
- CLI for configuration, migration, running, inspection, and replay.
- Docker image for amd64 and arm64.
- OpenAPI specification for the local administration API.
- End-to-end demonstration using a small event-emitting Soroban contract.

### Explicitly out of scope before v1.0

- Hosted multi-tenant control plane.
- User accounts, billing, KYC, or custody.
- Transaction signing or automated on-chain actions.
- Arbitrary JavaScript execution or user plugins inside the process.
- GraphQL and general-purpose chain queries.
- Full ledger, transaction, or historical backfill indexing.
- Kafka, NATS, SQS, Discord, Telegram, or email destinations.
- High-availability active-active ingestion.
- Multi-RPC quorum verification.
- Dashboard UI.
- Automatic backfill from Galexie/Hubble/history archives.
- Guaranteed semantic decoding of every custom contract event.

Out-of-scope items may become contributor work only after the core is stable and there is demonstrated demand.

## 5. Target user and jobs to be done

### Primary persona

A developer running a Stellar application backend with one to twenty contracts or event filters. They have Docker and a database but no dedicated data-infrastructure engineer.

### Primary jobs

- “Tell my backend when a matching Stellar event becomes final.”
- “Keep the event long enough for me to investigate or replay it.”
- “Do not silently skip history when my server is offline.”
- “Give me a verifiable, stable identifier so processing is idempotent.”
- “Let me run locally with one command and move to PostgreSQL without redesign.”

### Anti-personas

- Analysts who need all network history.
- Enterprises requiring a managed SLA on day one.
- Applications wanting Ledgerwake to hold signing keys.
- Users seeking trading signals or a block explorer.

## 6. Product contract and service-level objectives

The MVP makes no commercial SLA, but it has measurable engineering objectives.

### Correctness objectives

- Zero silently discarded successfully fetched events in fault-injection tests.
- Cursor and event persistence occur in one database transaction.
- Duplicate upstream events create one event record.
- Duplicate delivery attempts retain one stable delivery identity and increment attempt records.
- A history gap always creates a visible error state and critical log/metric.

### Performance objectives for v0.1

- Sustain 100 matching events/second for 30 minutes on a two-core development machine with PostgreSQL.
- Sustain 25 webhook attempts/second with configurable worker concurrency.
- Admin list endpoints respond within 500 ms at the 95th percentile with one million stored events under the documented reference environment.
- Recover after a normal restart in under 30 seconds, excluding destination backlog delivery time.
- Default ingestion lag below three ledgers when the RPC endpoint and database are healthy.

These targets are deliberately modest. We will benchmark before advertising numbers.

### Resource protection

- Page size and concurrency are bounded.
- HTTP response bodies have strict size limits.
- Webhook timeouts are finite.
- Retention and dead-letter growth are observable.
- Database pools have documented limits.
- Configuration validation rejects unbounded or contradictory settings.

## 7. Architecture

### Modular monolith

```text
Stellar RPC
    |
    v
RPC client -> filter planner -> poller -> event decoder
                                      |
                                      v
                              transactional store
                                |             |
                                v             v
                         delivery queue    admin/query API
                                |
                                v
                         webhook dispatcher
                                |
                                v
                         customer backend
```

### Module boundaries

1. `config`: Parse environment/file configuration and enforce invariants.
2. `rpc`: Typed JSON-RPC client, health probe, timeouts, pagination, error classification.
3. `filters`: Validate user filters and split them into legal RPC request plans.
4. `ingest`: Poll loop, cursor management, lag calculation, and gap state machine.
5. `codec`: Decode standard event fields while preserving raw values.
6. `store`: Database interface and PostgreSQL implementation.
7. `delivery`: Select pending deliveries, sign requests, retry, and dead-letter.
8. `api`: Local administration and query endpoints.
9. `cli`: Operator commands.
10. `telemetry`: Logs, metrics, request IDs, and redaction.

No module except `store` executes SQL. No module except `rpc` calls Stellar RPC. No module except `delivery` makes destination HTTP requests.

### Deployment topology

#### Evaluation

One Ledgerwake container plus one PostgreSQL container through Docker Compose. This keeps development and production persistence semantics aligned.

#### Recommended production MVP

One Ledgerwake instance plus PostgreSQL. The container is restartable and holds no essential state outside the database.

#### Future scale-out

Separate ingestor and delivery workers using PostgreSQL advisory locks or `FOR UPDATE SKIP LOCKED`. This is not implemented until single-process measurements justify it.

## 8. Data model

### Core tables

#### `subscriptions`

- `id` UUID
- `name`
- `network_passphrase_hash`
- `rpc_url_redacted`
- `filters_json`
- `start_mode`: `LATEST`, `LEDGER`, `CURSOR`
- `status`: `STARTING`, `ACTIVE`, `PAUSED`, `GAP_DETECTED`, `ERROR`
- `last_cursor`
- `last_ingested_ledger`
- `last_seen_latest_ledger`
- `created_at`, `updated_at`

#### `events`

- `id`: internal UUID
- `network_hash`
- `stellar_event_id`
- `ledger_sequence`
- `ledger_closed_at`
- `contract_id`, nullable
- `event_type`
- `topic_raw_json`
- `value_raw`
- `normalized_json`, nullable
- `tx_hash`, nullable
- `paging_token`
- `ingested_at`

Unique constraint: `(network_hash, stellar_event_id)`.

#### `subscription_events`

Many-to-many mapping so overlapping subscriptions do not duplicate canonical events.

- `subscription_id`
- `event_id`
- `matched_at`

Unique constraint: `(subscription_id, event_id)`.

#### `destinations`

- `id`
- `subscription_id`
- `url_encrypted` or securely configured reference
- `secret_encrypted` or securely configured reference
- `enabled`
- timeout and retry policy fields
- `created_at`, `updated_at`

For the earliest MVP, secrets may be loaded only from environment variables and referenced by name in the database. Plaintext secrets must never be persisted.

#### `deliveries`

- `id`
- `destination_id`
- `event_id`
- `state`: `PENDING`, `IN_FLIGHT`, `DELIVERED`, `RETRY_WAIT`, `DEAD`
- `next_attempt_at`
- `attempt_count`
- `last_status_code`, nullable
- `last_error_class`, nullable
- `created_at`, `delivered_at`, nullable

Unique constraint: `(destination_id, event_id)`.

#### `delivery_attempts`

- `id`
- `delivery_id`
- `attempt_number`
- `started_at`, `finished_at`
- `status_code`, nullable
- `response_excerpt_redacted`, nullable
- `error_class`, nullable
- `latency_ms`

Response bodies are not retained by default.

### Transactional ingestion invariant

For every RPC page, one database transaction must:

1. Upsert canonical events.
2. Create subscription-event matches.
3. Create destination deliveries using unique constraints.
4. Advance the subscription cursor.

If any step fails, the cursor does not advance.

## 9. Ingestion state machine

```text
STARTING
  -> ACTIVE when network identity, latest ledger, and starting position validate
  -> GAP_DETECTED when requested history predates oldest retained ledger
  -> ERROR for invalid network or unrecoverable configuration

ACTIVE
  -> ACTIVE after each committed page
  -> PAUSED by operator
  -> GAP_DETECTED on retention-window loss
  -> ERROR after bounded consecutive non-transient failures

ERROR
  -> STARTING after operator retry/config correction

GAP_DETECTED
  -> STARTING only after an explicit operator recovery decision
```

We never automatically skip to the latest ledger after detecting a gap. The operator must choose one of:

- accept loss and resume from the oldest available ledger;
- restore missing data externally and set a verified cursor;
- abandon and recreate the subscription.

Every recovery action is logged.

## 10. Delivery semantics

### Guarantee

Ledgerwake provides at-least-once delivery after an event has been durably committed.

It cannot guarantee exactly-once processing across an HTTP boundary. Receivers must deduplicate using `X-Ledgerwake-Delivery` or the payload event ID.

### Webhook envelope

```json
{
  "specversion": "1.0",
  "id": "delivery-uuid",
  "type": "stellar.contract.event",
  "source": "ledgerwake://subscription/subscription-uuid",
  "time": "2026-08-04T12:00:00Z",
  "subject": "stellar-event-id",
  "data": {
    "network": "public",
    "ledger": 123456,
    "contractId": "C...",
    "eventType": "contract",
    "topics": [],
    "value": {},
    "raw": {}
  }
}
```

The envelope follows CloudEvents concepts without claiming formal conformance until tested.

### Signing

Headers:

- `X-Ledgerwake-Delivery`: stable delivery UUID
- `X-Ledgerwake-Timestamp`: Unix seconds
- `X-Ledgerwake-Signature`: `v1=<hex HMAC-SHA256>`
- `User-Agent`: versioned Ledgerwake identifier

Signed input:

```text
<timestamp>.<exact raw request body bytes>
```

Receiver guidance requires:

- constant-time signature comparison;
- a default five-minute timestamp tolerance;
- deduplication by delivery ID;
- verifying the raw body before JSON parsing.

### Transport and payload encryption decision

- HTTPS with correctly validated TLS certificates is mandatory for production RPC and webhook traffic. Plain HTTP is allowed only through an explicit local-development override.
- HMAC signing provides authenticity and integrity; it does not provide confidentiality.
- We will not invent custom request-body encryption in the MVP. Stellar events are public data, and application-layer encryption would add key distribution, rotation, recovery, debugging, and interoperability risks without replacing TLS.
- Destination URLs and webhook secrets are sensitive even when event bodies are public. They must be excluded from logs and stored through secret references or envelope encryption backed by an operator-managed key.
- PostgreSQL connections use TLS when crossing a host or trust boundary. Database volumes and backups should use platform/disk encryption at rest.
- Optional end-to-end payload encryption may be added later for users whose TLS terminator or intermediary is outside their trust boundary. It must use a reviewed standard such as JWE or HPKE with recipient public keys and authenticated encryption; never a custom cipher or shared “encrypt the JSON” construction.
- Mutual TLS may be supported later for receiver authentication in environments that require it. It complements rather than replaces signed payloads and replay controls.

### Retry policy

- Retry network errors, timeouts, `408`, `425`, `429`, and `5xx`.
- Do not retry most other `4xx` responses.
- Respect bounded `Retry-After` values.
- Default attempts: 10.
- Exponential backoff with full jitter and an upper bound.
- Transition to dead letter after exhaustion.
- Manual replay creates a new attempt lineage while retaining reference to the original delivery.

## 11. CLI contract

Executable: `wake`.

```text
wake init
wake config validate [--file ledgerwake.json]
wake db migrate
wake serve
wake doctor
wake subscription add
wake subscription list
wake subscription inspect <id>
wake subscription pause <id>
wake subscription resume <id>
wake gap inspect <subscription-id>
wake gap accept <subscription-id> --from-ledger <n>
wake event get <event-id>
wake event list [filters]
wake delivery list [filters]
wake delivery replay <delivery-id>
wake replay --subscription <id> --from-ledger <n> --to-ledger <n>
wake version
```

### CLI rules

- Noninteractive behavior by default; confirmation required for loss-accepting commands unless `--yes` is supplied.
- Machine-readable `--output json` for all inspect/list/doctor commands.
- Stable exit codes documented by category.
- Secrets never accepted as ordinary CLI arguments because process lists and shell history can expose them.
- Configuration precedence: flags for safe non-secrets, environment, file, documented defaults.
- `doctor` tests configuration, database, migration state, RPC identity, RPC history range, destination DNS/TLS, and clock skew without sending a real event unless asked.

## 12. Administration API

Bind to `127.0.0.1` by default. Remote binding requires explicit configuration and authentication.

Initial endpoints:

```text
GET  /healthz
GET  /readyz
GET  /metrics
GET  /v1/status
GET  /v1/subscriptions
GET  /v1/subscriptions/{id}
POST /v1/subscriptions/{id}/pause
POST /v1/subscriptions/{id}/resume
GET  /v1/events
GET  /v1/events/{id}
GET  /v1/deliveries
POST /v1/deliveries/{id}/replay
```

Mutation endpoints use authentication when the API is remotely exposed. The MVP may support a static bearer token loaded from a secret file or environment variable. Mutual TLS and OAuth are later concerns.

The OpenAPI document is treated as a tested artifact. Breaking changes require a major version.

## 13. Threat model

### Assets

- Webhook signing secrets.
- Destination URLs, which can contain sensitive routing information.
- Event records and business metadata.
- Operator credentials for the admin API.
- Release artifacts and package-publishing authority.
- Repository and CI integrity.

Ledgerwake has no Stellar signing keys by design.

### Trust boundaries

1. Stellar RPC endpoint to Ledgerwake.
2. Ledgerwake to PostgreSQL.
3. Ledgerwake to webhook destination.
4. Operator/CLI to Ledgerwake admin API.
5. Contributor pull request to CI.
6. Release workflow to package/container registries.

### Principal threats and controls

| Threat | Consequence | MVP controls |
|---|---|---|
| Malicious or compromised RPC | Forged/missing data | TLS, configured network identity check, lag/gap monitoring, raw evidence retention; multi-provider verification deferred |
| SSRF through webhook URLs | Internal network access | Deny loopback, link-local, private and metadata IP ranges by default; resolve and re-check DNS; HTTPS default; explicit unsafe-development override |
| DNS rebinding | SSRF after validation | Validate resolved addresses at connection time and restrict redirects |
| Redirect abuse | Secret or request leakage | Disable redirects by default |
| Oversized RPC/HTTP responses | Memory exhaustion | Response byte limits, streaming/bounded parsing, timeouts |
| Webhook endpoint stalls | Worker exhaustion | Connect/read/total timeouts and bounded concurrency |
| Duplicate upstream events | Duplicate business action | Canonical unique constraint and receiver idempotency contract |
| Cursor advances before storage | Permanent event loss | One atomic transaction for events, deliveries, and cursor |
| Database outage | Lag and possible retention loss | Stop cursor progress, retry with backoff, critical lag alarms |
| Secret leakage in logs | Destination compromise | Central redaction, structured allowlisted fields, no request authorization logging |
| Untrusted PR exfiltrates CI secrets | Registry/repo compromise | No secrets in fork-PR jobs, minimal token permissions, SHA-pinned actions, protected release environment |
| Dependency compromise | Runtime compromise | Lockfile, Dependabot/Renovate, vulnerability scan, SBOM, review high-risk updates |
| Malicious release | User compromise | Protected tags, two-step release, provenance attestations, signed checksums, reproducible process |
| Replay attack on receiver | Duplicate business action | Signed timestamp, tolerance window, stable delivery ID |
| Operator accepts a gap accidentally | Silent incomplete history | Destructive confirmation, explicit command, audit log, no automatic skip |
| Unbounded retention | Disk exhaustion | Retention policy, storage metrics, safe pruning rules |

### Security exclusions

- The MVP does not claim protection against a fully malicious operating host.
- HMAC secrets stored in environment variables are exposed to sufficiently privileged local users.
- One RPC provider cannot independently prove data completeness. We expose this limitation clearly.
- Webhook receivers remain responsible for their business-level idempotency and authorization.

## 14. Security engineering program

### Repository security files at initial public release

- `SECURITY.md`: supported versions, private reporting route, expected response times.
- `THREAT_MODEL.md`: assets, boundaries, threats, mitigations, accepted risks.
- `CODE_OF_CONDUCT.md`.
- `CONTRIBUTING.md`.
- `GOVERNANCE.md`: maintainer powers, decision process, inactivity and succession.
- `MAINTAINERS.md`.
- `RELEASES.md`: release and verification procedure.
- `LICENSE`: Apache-2.0 is recommended for infrastructure; confirm before publication.
- `NOTICE` if dependencies or assets require it.

### GitHub controls

- Require pull requests for the default branch.
- Require CI, review, resolved conversations, and linear history.
- Disable force pushes and branch deletion.
- Require signed commits for maintainers if operationally practical.
- Use `CODEOWNERS` for security-sensitive modules and workflows.
- Default `GITHUB_TOKEN` permission is read-only.
- Give write permissions only to the exact release job that requires them.
- Never run privileged `pull_request_target` code from an untrusted checkout.
- Pin every third-party Action to a full commit SHA.
- Enable secret scanning, push protection, dependency graph, Dependabot alerts and updates, code scanning, and private vulnerability reporting where available.
- Run OpenSSF Scorecard and track regressions; do not optimize only for the score.

### Build and release security

- Semantic versions beginning at `v0.1.0`.
- Build containers in GitHub Actions from a protected tag.
- Publish by immutable digest plus human-readable version tag.
- Generate SPDX or CycloneDX SBOM.
- Generate artifact attestations for binaries and container images.
- Publish SHA-256 checksums.
- Document `gh attestation verify` and digest-based Docker usage.
- Release workflow uses a protected GitHub environment with manual approval.
- Avoid long-lived registry secrets when OIDC or `GITHUB_TOKEN` publishing is available.

### Secure development checks

- Type checking, lint, formatting, unit and integration tests.
- Dependency vulnerability scan.
- Static analysis and CodeQL.
- Secret scanning.
- Container scan.
- License policy check.
- Fuzz/property testing for cursor, filter, signature, and decoder inputs.
- Migration upgrade/downgrade safety tests where supported.
- Periodic restore drill from PostgreSQL backup.

Security is a release gate, not a badge collection exercise.

## 15. Scalability plan

### Scaling dimensions

- Number of configured subscriptions.
- Breadth and overlap of filters.
- Matching events per ledger.
- Number and latency of destinations.
- Retention duration and database size.
- Replay volume competing with live delivery.

### MVP techniques

- Collapse compatible filters to reduce RPC calls where safe.
- Split filters according to RPC maximums deterministically.
- Use bounded page sizes and adaptive polling.
- Insert events and deliveries in batches.
- Use unique constraints instead of check-then-insert logic.
- Index delivery state plus `next_attempt_at`.
- Index ledger sequence and subscription mapping.
- Separate ingestion concurrency from delivery concurrency.
- Rate-limit replay so live ingestion has priority.
- Use PostgreSQL row locking for worker-safe delivery selection.
- Partitioning is not an MVP requirement; define migration options before it becomes necessary.

### Backpressure

- Event ingestion continues while destination delivery is slow until a configured storage/backlog threshold.
- Delivery queue depth, oldest pending age, and retry rate are metrics.
- Operators can pause a destination without pausing ingestion.
- A global disk/storage protection threshold can pause ingestion visibly before corruption or uncontrolled failure.

### Retention

- Default: retain canonical events indefinitely in development, but require production operators to choose/document a policy.
- Delivery attempt details can expire earlier than canonical events.
- Delivered queue rows may be compacted without deleting canonical event identity.
- Pruning is transactional, observable, and never deletes pending/dead deliveries accidentally.

## 16. Observability and operations

### Structured logs

Every log includes:

- timestamp, level, component, version;
- request/run correlation ID;
- subscription/destination IDs when relevant;
- ledger and cursor identifiers when safe;
- error class and retryability.

Never log secrets, authorization headers, full destination URLs with credentials/query secrets, or entire response bodies.

### Metrics

- `ledgerwake_latest_ledger`
- `ledgerwake_last_ingested_ledger{subscription}`
- `ledgerwake_ingestion_lag_ledgers{subscription}`
- `ledgerwake_events_ingested_total`
- `ledgerwake_rpc_requests_total{result}`
- `ledgerwake_rpc_request_duration_seconds`
- `ledgerwake_delivery_attempts_total{result}`
- `ledgerwake_delivery_latency_seconds`
- `ledgerwake_delivery_queue_depth{state}`
- `ledgerwake_oldest_pending_delivery_seconds`
- `ledgerwake_gap_detected{subscription}`
- `ledgerwake_database_errors_total`
- process CPU, memory and runtime information where the metrics library supports it.

High-cardinality contract, event, delivery, or user IDs must not become metric labels.

### Health semantics

- `/healthz`: process is alive.
- `/readyz`: database migrated and reachable, configuration valid, critical workers initialized.
- Readiness may remain true during a single subscription gap; detailed status and metrics expose degradation. This prevents one bad subscription from restarting the entire process indefinitely.

### Operator runbooks

- RPC unavailable or rate-limited.
- Ingestion lag approaching retention window.
- Gap detected.
- Database unavailable.
- Webhook queue growing.
- Secret rotation.
- Upgrade and rollback.
- Backup and restore.
- Vulnerability disclosure.
- Compromised release credential or artifact.

## 17. Testing strategy

### Unit tests

- Filter planning and validation.
- Cursor and state transitions.
- Event identity and deduplication.
- Signature generation and verification fixtures.
- Retry classification and backoff bounds.
- Secret redaction.
- Configuration precedence and validation.

### Property and fuzz tests

- Arbitrary XDR/JSON decoder input never crashes the process.
- Pagination cannot advance backward.
- Duplicate pages remain idempotent.
- Any failed database transaction leaves the cursor unchanged.
- Signature verification rejects modified timestamp or body.

### Integration tests

- PostgreSQL migrations and transactional invariants.
- Mock RPC with duplicates, empty pages, cursor errors, timeouts, `429`, malformed data, and history expiry.
- Mock webhook endpoints for every retry class.
- SSRF address and redirect controls.
- Restart during each point of the ingestion transaction.

### End-to-end tests

- Deploy/invoke a minimal event contract on a supported test environment.
- Ingest, store, deliver, verify signature, force failure, recover, and replay.
- Run the acceptance suite against every supported PostgreSQL major version in the documented compatibility matrix.

Live-network tests are scheduled and non-blocking for untrusted fork PRs. Deterministic fixtures remain the main CI path.

### Performance and resilience tests

- One million stored events query benchmark.
- Burst ingestion.
- Slow destination and retry storm.
- Database restart.
- RPC outage near the retention boundary.
- Process kill after event insert but before transaction commit.
- Replay under active ingestion.

## 18. Repository design

Recommended monorepo:

```text
/
  apps/
    ledgerwake/            # service executable
    wake-cli/              # CLI executable/package
    demo-receiver/         # signature-verifying example
  packages/
    config/
    rpc/
    filters/
    ingest/
    codec/
    store/
    delivery/
    api/
    telemetry/
    test-fixtures/
  contracts/
    event-demo/            # minimal Soroban test contract
  docs/
    architecture/
    operations/
    security/
    decisions/             # ADRs
  deploy/
    docker-compose.yml
  openapi/
    ledgerwake.openapi.yaml
  .github/
    ISSUE_TEMPLATE/
    PULL_REQUEST_TEMPLATE.md
    CODEOWNERS
    dependabot.yml
    workflows/
  SECURITY.md
  THREAT_MODEL.md
  CONTRIBUTING.md
  GOVERNANCE.md
  MAINTAINERS.md
  CODE_OF_CONDUCT.md
  LICENSE
```

If TypeScript package overhead slows delivery, begin with one application package and enforce module boundaries in source folders. Contributor clarity matters more than a decorative monorepo.

## 19. Documentation plan

Minimum documentation for `v0.1.0`:

- What Ledgerwake is and is not.
- Five-minute Docker Compose quickstart.
- Configuration reference with safe defaults.
- CLI reference and exit codes.
- Webhook payload and signature verification examples.
- Delivery guarantee and receiver idempotency guidance.
- Database backup/restore and retention.
- Gap detection and recovery.
- Production deployment checklist.
- Threat model and security reporting.
- Architecture and contribution guide.
- Comparison page explaining when to use RPC directly, Ledgerwake, or a full indexer without attacking alternatives.

Examples should be executable in CI to prevent documentation drift.

## 20. Open-source governance and contributor experience

### Governance for two maintainers

- Emmanuel is project lead and final product decision owner.
- Codex prepares implementation, review, tests, documentation, and decision analysis with Emmanuel.
- Material architecture changes require an ADR.
- Security-sensitive changes require explicit threat-model review.
- No contributor is promised assignment or reward outside the Wave platform's rules.
- Conflicts of interest and self-dealing are prohibited.

### Issue quality template

Every implementation issue must contain:

- user or operator problem;
- why it matters;
- exact scope and explicit non-goals;
- implementation context and relevant modules;
- acceptance tests;
- security and compatibility considerations;
- documentation expectation;
- estimated complexity based on evidence, not reward optimization.

### Contributor ladder

- Contributor: accepted contribution.
- Trusted contributor: repeated quality work and review participation.
- Triage member: demonstrated issue/reproduction quality.
- Maintainer: sustained technical and community responsibility, security awareness, and project trust.

Wave participation must not lower the bar for repository access.

## 21. Delivery phases and gates

The schedule assumes one human maintainer with Codex support. Dates are not promises; gates determine progress.

### Phase 0 — Validation and specification (3–5 days)

Deliverables:

- Confirm product name/domain/package availability.
- Interview at least five Stellar developers; obtain two design partners.
- Record current event-ingestion approaches and failures.
- Validate the approved Node.js/TypeScript runtime and candidate dependency graph through a short integrity and performance spike.
- ADRs for delivery semantics, database, and secret storage.
- Public problem statement without exaggerated claims.

Gate:

- At least two developers say they would test the solution within the next month.
- At least one supplies a real event/filter example.

Kill/adjust criterion:

- If interviews consistently prefer existing hosted indexers and do not value self-hosting/replay, pivot to the compatibility/test harness rather than force this product.

### Phase 1 — Correct ingestion kernel (week 1–2)

Deliverables:

- Configuration and network identity validation.
- RPC client and legal filter planner.
- PostgreSQL store and migrations.
- Transactional cursor/event persistence.
- Deduplication.
- Gap state machine.
- CLI `serve`, `doctor`, and subscription inspection.
- Deterministic mock-RPC suite.

Gate:

- Crash/fault tests demonstrate no cursor advance without committed events.
- Duplicate pages are idempotent.
- Gap detection never silently skips.

### Phase 2 — Secure delivery kernel (week 3)

Deliverables:

- Destinations and delivery queue.
- HMAC signatures.
- Retry classification/backoff.
- Dead-letter and replay.
- SSRF defenses.
- Demo receiver with signature verification.

Gate:

- Security tests cover redirect, internal address, DNS, timeout, replay, modified body, and duplicate delivery cases.
- Receiver example successfully deduplicates replays.

### Phase 3 — Production-shaped storage and operations (week 4)

Deliverables:

- PostgreSQL implementation.
- Metrics, structured logs, health/readiness.
- Retention controls.
- Backup/restore and failure runbooks.
- Docker Compose.
- Initial load and resilience harness.

Gate:

- Target benchmark is measured and published with environment details.
- PostgreSQL restart and process-kill tests recover correctly.

### Phase 4 — Public alpha hardening (week 5)

Deliverables:

- OpenAPI.
- Security/governance/community files.
- CI security pipeline.
- Multi-architecture image.
- SBOM, checksums, and artifact attestations.
- Full quickstart and operator docs.
- `v0.1.0-alpha.1`.

Gate:

- Fresh-machine quickstart succeeds from published artifacts.
- No unresolved critical/high vulnerability without a documented, time-bound exception.
- Design partners can integrate without private maintainer help.

### Phase 5 — Design-partner proof (week 6–7)

Deliverables:

- Two real integrations.
- Bug and usability fixes.
- Published limitations and lessons.
- At least seven days of continuous testnet operation.
- `v0.1.0` release.

Gate:

- No unexplained event gaps.
- At least one forced delivery failure has been replayed successfully.
- At least one user provides public or privately verifiable feedback.

### Phase 6 — Drips Wave preparation (after proof, not before)

Deliverables:

- Curated contributor backlog based on user evidence.
- Issues sized to finish in one Wave.
- Response and review schedule for the Wave week.
- Repository application narrative with proof links.
- Maintainer capacity cap; do not add more issues than can be reviewed promptly.

Gate:

- Repository is substantive, active, documented, secure, Stellar-relevant, and used.
- We can review applications daily and PRs before the Wave deadline.

## 22. Initial implementation backlog

### P0: validation

1. Five user interviews and notes.
2. Name/package collision check.
3. Dependency and runtime spike: one `getEvents` page, decode, PostgreSQL insert, container size, runtime behavior, and dependency audit.
4. ADR-001: modular monolith.
5. ADR-002: at-least-once delivery.
6. ADR-003: raw XDR preservation.

### P1: ingestion

1. Configuration schema and redaction.
2. JSON-RPC transport with timeouts and error taxonomy.
3. Network identity validation.
4. Filter validation and request-plan splitting.
5. Database migrations.
6. Subscription state model.
7. Event/cursor atomic persistence.
8. Deduplication constraints.
9. Gap detection.
10. Mock RPC and fixture generator.

### P2: delivery

1. Destination configuration without plaintext secret persistence.
2. Delivery creation in ingestion transaction.
3. Worker-safe pending-delivery claim.
4. HMAC request signing.
5. Retry/backoff.
6. Dead-letter transition.
7. Replay commands.
8. SSRF and redirect protections.
9. Demo receiver.

### P3: operations and release

1. PostgreSQL adapter.
2. Metrics and structured logging.
3. Health/readiness.
4. Retention and pruning.
5. Docker/Compose.
6. OpenAPI and CLI docs.
7. Security workflows and repository controls.
8. SBOM, provenance, checksums.
9. Load/fault harness.
10. Alpha release and integration guide.

## 23. Definition of done

An engineering issue is done only when:

- acceptance tests pass;
- failure behavior is tested;
- security implications are considered;
- logs and metrics are appropriate;
- documentation is updated;
- migrations are backward-compatible within the stated support policy;
- no secret or sensitive data is exposed;
- the PR includes a release note when user-visible;
- CI passes from a clean checkout.

The core MVP is done only when:

- it survives the end-to-end failure suite;
- a new user can operate it from published documentation;
- two design partners have tested it;
- artifacts are verifiable;
- limitations are honest and prominent;
- we can support it without pretending to provide 24/7 service.

## 24. Drips Wave readiness scorecard

Do not apply until every required item is green.

| Area | Required evidence |
|---|---|
| Stellar relevance | Uses supported Stellar RPC event APIs and solves bounded history/delivery operations |
| Product reality | Working published release and demo |
| Adoption | Two design partners or credible real integrations |
| Activity | Sustained meaningful commits/issues over several weeks |
| Code quality | Tests, CI, architecture boundaries, migrations |
| Security | Security policy, threat model, scans, signed/attested release process |
| Documentation | Quickstart, API/CLI, operations, contribution guide |
| Governance | License, conduct, maintainers and decision process |
| Issue quality | User-backed, independently scoped, testable issues |
| Maintainer capacity | Daily application triage and prompt review during Wave |

Repository admission remains discretionary. We should assume that a repository created mainly to access rewards will be rejected, while a useful, active project with external proof has a defensible application.

## 25. Risks and strategic responses

### “Mercury or another service already does this”

Response: Do not compete as a broad hosted indexer. Focus on local-first deployment, delivery correctness, replay, transparent operations, and composability. If users still prefer managed services, provide an adapter or pivot rather than duplicate them.

### The two-maintainer bus factor

Response: automate releases, document operations, keep architecture small, use mainstream dependencies, and cultivate trusted contributors before granting privileges.

### Security ambition delays all user value

Response: prioritize controls aligned to actual assets: no signing keys, loopback admin API, signed webhooks, SSRF defense, transactional cursor, redaction, secure CI. Defer enterprise identity and distributed consensus.

### Scalability overengineering

Response: publish a reference benchmark, design interfaces for workers, and implement distribution only after measurements. PostgreSQL plus bounded worker concurrency is enough for the first users.

### Custom event decoding becomes endless

Response: preserve raw XDR and normalize common fields. Treat contract-specific codecs as optional adapters; never make ingestion depend on successful semantic decoding.

### Upstream API changes

Response: pin supported SDK/RPC versions, run scheduled compatibility tests, preserve raw data, and publish a compatibility matrix.

### Wave deadlines compromise review quality

Response: cap active Wave issues to maintainer review capacity, use explicit acceptance tests, and never merge solely to beat the reward deadline.

## 26. Immediate next actions

1. Choose a temporary repository name; do not spend more than one hour branding.
2. Run the dependency and runtime integrity spike.
3. Create five short user-interview prompts and identify ten Stellar builders.
4. Initialize the repository with governance and security skeletons.
5. Write ADR-001 through ADR-003.
6. Implement the mock RPC fixture server before the real polling loop.
7. Build the transactional ingestion vertical slice.

The first implementation milestone is not a dashboard or polished website. It is this demonstrable invariant:

> After duplicates, RPC failures, database failures, and process restarts, Ledgerwake either retains every fetched event exactly once in its canonical store or loudly reports that event continuity cannot be proven.

That invariant is the product.

## 27. Source basis

- Stellar RPC overview: https://developers.stellar.org/docs/data/apis/rpc
- Stellar `getEvents` reference: https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents
- Stellar event ingestion guide: https://developers.stellar.org/docs/build/guides/events/ingest
- Stellar events model: https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/events
- Drips Wave maintainer guide: https://docs.drips.network/wave/maintainers/participating-in-a-wave/
- Drips issue-quality guide: https://www.drips.network/blog/posts/creating-meaningful-issues
- GitHub Actions security: https://docs.github.com/en/actions/how-tos/secure-your-work
- GitHub artifact attestations: https://docs.github.com/en/actions/concepts/security/artifact-attestations

These sources are current as of the plan date. Upstream limits and Wave rules must be rechecked before implementation milestones and before a repository application.
