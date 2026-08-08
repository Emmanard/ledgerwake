# Security Policy

## Supported versions

Only the newest tagged alpha is supported until Ledgerwake reaches `1.0.0`.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, destination URLs, or user data. Use GitHub private vulnerability reporting once the repository is public. Until then, contact the maintainer privately through the contact method on the maintainer's verified GitHub profile.

We aim to acknowledge a report within 72 hours, provide an initial assessment within seven days, and coordinate disclosure after a fix is available. These are best-effort targets for a volunteer project, not a commercial SLA.

## Security boundaries

- Ledgerwake does not accept Stellar private keys and cannot sign transactions.
- Production RPC and webhook traffic must use TLS.
- Webhook secrets must be at least 32 characters and are read from environment variables, not the config/database.
- Remote admin binding requires a bearer token of at least 32 characters.
- This alpha has not received an independent audit.

See [THREAT_MODEL.md](THREAT_MODEL.md) for accepted risks and controls.
