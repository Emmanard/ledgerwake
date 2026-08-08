# Core MVP release checklist

## Required before the Drips application

- [ ] Replace repository, contact, and GitHub-profile placeholders.
- [ ] Create the public repository and enable branch protection.
- [ ] Require CI and CodeQL checks for pull requests.
- [ ] Enable Dependabot security updates and private vulnerability reporting.
- [ ] Add the repository to OpenSSF Scorecard and pin the workflow by commit SHA.
- [ ] Run `npm ci && npm run verify` from a fresh clone.
- [ ] Run the PostgreSQL integration test with `TEST_DATABASE_URL` configured.
- [ ] Build and smoke-test the container image as the non-root user.
- [ ] Record a short terminal demo: migrate, doctor, serve, receive signed event,
      inspect delivery, and replay it.
- [ ] Open one roadmap issue and one `good first issue` to demonstrate stewardship.
- [ ] Publish the `v0.1.0-alpha.1` prerelease with checksums and limitations.
- [ ] Paste only verifiable links and metrics into `docs/DRIPS_APPLICATION.md`.

## Release gate

Do not call the MVP production-ready. A release is eligible to apply when all
tests pass, no known high/critical dependency advisory is open, the threat model
matches the implementation, recovery is demonstrated, and every claim in the
application links to public evidence.
