# Alpha Limitations

`v0.1.0-alpha.1` proves Ledgerwake's core delivery invariant. It is not an audited production release.

- One configured subscription and webhook destination per process.
- One RPC provider; no quorum or omission detection.
- No historical backfill beyond the configured RPC provider's retention window.
- No automatic gap acceptance. Recovery requires a future explicit operator workflow or direct documented repair.
- No graceful waiting for active webhook workers during shutdown yet.
- Static bearer token for remotely exposed admin API; loopback binding is the default.
- No UI, hosted control plane, billing, accounts, custody, or transaction signing.
- No formal CloudEvents conformance claim.
- Best-effort semantic decoding; raw XDR remains authoritative.
- Docker image tags are version-pinned but not yet digest-pinned in this source snapshot.
- SBOM and signed release provenance belong to the first GitHub release workflow and cannot be demonstrated before the repository exists publicly.

These limits are intended to prevent exaggerated security or reliability claims in the Drips application.
