# Draft Drips Wave Repository Application

## Project summary

Ledgerwake is an open-source, self-hosted reliable event delivery runtime for Stellar applications. Stellar RPC exposes a bounded recent event window and expects application backends to ingest the subset they need. Ledgerwake makes that operational task reusable and explicit: events, cursor progress, and webhook deliveries commit atomically to PostgreSQL; duplicate RPC pages deduplicate; history gaps stop visibly; webhooks are signed, retried, dead-lettered, and replayable.

## Stellar ecosystem relevance

- Uses Stellar RPC `getNetwork`, `getLatestLedger`, and `getEvents`.
- Validates Testnet/Public Network passphrases.
- Preserves Stellar event XDR and uses the official JavaScript SDK for best-effort normalization.
- Addresses the documented bounded-history requirement without attempting to replace RPC or full indexers.

## Current proof

Replace these placeholders before applying:

- Public repository: `[URL]`
- Tagged alpha: `[URL]`
- Testnet demonstration: `[URL / contract ID]`
- CI run: `[URL]`
- Threat model: `[URL]`
- Continuous-run evidence: `[URL]`
- External tester or design partner: `[evidence]`

## Maintainer commitment

The maintainer will review Wave applications daily, cap nominated issues to realistic review capacity, provide explicit acceptance criteria, and avoid cosmetic or manufactured work. Security-sensitive changes will update the threat model and include failure-path tests.

## Honest limitations

The current alpha supports one configured subscription and destination per process, trusts one RPC provider, has not received an independent audit, and is intended for testnet evaluation. Wave contributions will extend a tested core rather than create the appearance of an already production-ready service.

## Candidate Wave issues after acceptance

Only nominate issues backed by alpha feedback. Likely candidates:

1. Explicit gap-recovery CLI with audit record and safety confirmations.
2. Multi-subscription configuration with deterministic filter planning.
3. Webhook receiver examples for Python and Go.
4. PostgreSQL retention/pruning with pending-delivery safety properties.
5. Prometheus queue depth and oldest-pending metrics.
6. Multi-RPC consistency observation mode.

Do not nominate all six if the maintainer cannot review them during one Wave.
