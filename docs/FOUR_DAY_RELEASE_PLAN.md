# Four-Day Release Plan

## Day 1 — Core correctness

- Repository, dependency lock, schema, configuration
- RPC network verification and event pagination
- Atomic event/cursor/delivery transaction
- Deduplication and gap detection
- Unit and PostgreSQL integration tests

Exit gate: transaction rollback test proves cursor cannot advance after an event-write failure.

## Day 2 — Delivery security

- HMAC envelope and receiver documentation
- DNS-at-connect-time SSRF controls
- Retry/dead-letter/replay worker
- Admin API and metrics
- Fault tests for delivery classifications

Exit gate: signed delivery succeeds, failure retries, permanent error dead-letters, replay is idempotent at the receiver.

## Day 3 — Open-source readiness

- Docker and clean-machine quickstart
- Security policy and threat model
- Governance/contribution templates
- CI, dependency review, CodeQL, Dependabot
- Operator limitations/runbooks

Exit gate: a clean checkout passes all documented commands.

## Day 4 — Evidence and application

- Testnet demonstration with a real contract/filter
- Seven+ hours continuous run if four days cannot provide seven days
- Record logs/metrics and forced delivery recovery
- Tag `v0.1.0-alpha.1`
- Prepare Drips application with honest alpha evidence and contributor backlog

Exit gate: published repository, reproducible release, working testnet evidence, no unresolved known high/critical dependency advisory.
