# Threat Model

## Assets

- Webhook and admin secrets
- Destination URLs and operational metadata
- Event continuity and canonical event records
- Database integrity and availability
- Release and CI publishing authority

Ledgerwake intentionally holds no Stellar signing keys.

## Trust boundaries

1. Stellar RPC to Ledgerwake
2. Ledgerwake to PostgreSQL
3. Ledgerwake to webhook receiver
4. Operator to admin API
5. Contributor pull request to CI/release automation

## Principal threats and controls

| Threat | Control |
|---|---|
| Cursor advances without stored events | One transaction covers canonical events, mappings, deliveries, and cursor |
| Duplicate RPC pages | Unique `(network_passphrase_hash, stellar_event_id)` constraint |
| Expired RPC history | Fail closed as `GAP_DETECTED`; no automatic skip |
| Webhook forgery/modification | HMAC-SHA256 over timestamp and exact body |
| Replay | Timestamp tolerance guidance plus stable delivery ID deduplication |
| SSRF/DNS rebinding | Resolve at connection time; block private, loopback, link-local, multicast/reserved IPs; no redirects |
| Slow/hostile endpoints | Bounded timeout, concurrency, response disposal, and attempts |
| Secret leakage | Environment references, structured-log key redaction, sanitized config output |
| SQL injection | Parameterized values; no user-selected SQL identifiers |
| Worker crash | Stale `IN_FLIGHT` deliveries recover to retry state |
| Untrusted RPC | TLS, network-passphrase check, raw evidence preservation; multi-provider verification is deferred |
| Supply-chain compromise | Exact lockfile, `npm ci`, audits, dependency review, SBOM/release provenance roadmap |

## Accepted alpha risks

- A single RPC provider can omit valid events without detection.
- PostgreSQL credentials reside in process environment/config and rely on host security.
- Admin API uses a static bearer token rather than mTLS/OIDC.
- There is no independent audit.
- Availability is single-process; PostgreSQL is the durable state boundary.
- SSRF classification is conservative but not a formal network sandbox. Deploy with egress controls for defense in depth.
