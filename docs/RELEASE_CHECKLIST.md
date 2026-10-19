# Core MVP release checklist

## Required before the Drips application

- [x] Replace repository, contact, and GitHub-profile placeholders. (repo URL done; tagged
      alpha, testnet demo, CI run, threat model, continuous-run, and design-partner links
      still genuinely pending — see docs/DRIPS_APPLICATION.md)
- [x] Create the public repository and enable branch protection.
- [x] Require CI and CodeQL checks for pull requests. (Actions billing resolved
      2026-10-19; both checks pass and are now required status checks on `main`)
- [x] Enable Dependabot security updates and private vulnerability reporting.
- [x] Add the repository to OpenSSF Scorecard and pin the workflow by commit SHA.
      (first real run completed successfully 2026-10-19)
- [x] Run `npm ci && npm run verify` from a fresh clone. (also ran `npm audit`,
      found and fixed 4 high-severity fast-uri advisories, re-verified clean)
- [x] Run the PostgreSQL integration test with `TEST_DATABASE_URL` configured.
- [x] Build and smoke-test the container image as the non-root user. (confirmed
      UID 10001, `config validate` redacts secrets correctly)
- [ ] Record a short terminal demo: migrate, doctor, serve, receive signed event,
      inspect delivery, and replay it.
- [x] Open one roadmap issue and one `good first issue` to demonstrate stewardship.
- [ ] Publish the `v0.1.0-alpha.1` prerelease with checksums and limitations.
- [ ] Paste only verifiable links and metrics into `docs/DRIPS_APPLICATION.md`.

## Release gate

Do not call the MVP production-ready. A release is eligible to apply when all
tests pass, no known high/critical dependency advisory is open, the threat model
matches the implementation, recovery is demonstrated, and every claim in the
application links to public evidence.
