# Contributing

Thank you for improving Ledgerwake.

## Before coding

Open or claim an issue before substantial work. A good issue includes the user/operator problem, explicit scope and non-goals, acceptance tests, security implications, and documentation changes.

## Local checks

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

Database changes require the PostgreSQL integration test. Security-sensitive changes require an update to `THREAT_MODEL.md` or an explanation of why the model is unchanged.

## Pull requests

- Keep changes focused.
- Include tests for success and failure behavior.
- Never include secrets, private RPC URLs, wallet keys, or production event data.
- Preserve backward compatibility unless the issue explicitly approves a breaking alpha change.
- Explain operational and security impact.

Maintainers may decline contributions that expand the product beyond reliable, application-scoped Stellar event delivery.
