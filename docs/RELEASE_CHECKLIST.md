# Core MVP release checklist

## Required before the Drips application

- [x] Replace repository, contact, and GitHub-profile placeholders. (repo URL done; tagged
      alpha, testnet demo, CI run, threat model, continuous-run, and design-partner links
      still genuinely pending — see docs/DRIPS_APPLICATION.md)
- [x] Create the public repository and enable branch protection.
- [ ] Require CI and CodeQL checks for pull requests. (checks exist and run; not yet set as
      a required merge gate — pending a real CI pass once Actions billing is resolved)
- [x] Enable Dependabot security updates and private vulnerability reporting.
- [x] Add the repository to OpenSSF Scorecard and pin the workflow by commit SHA.
      (workflow added and pinned; first run pending Actions being re-enabled)
- [ ] Run `npm ci && npm run verify` from a fresh clone.
- [ ] Run the PostgreSQL integration test with `TEST_DATABASE_URL` configured.
- [ ] Build and smoke-test the container image as the non-root user.
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
