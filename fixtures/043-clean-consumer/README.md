# 043 clean consumer fixture

This fixture is intentionally outside the pnpm workspace. Run `npm run setup` with a GitHub
Packages-authenticated npm configuration; it installs the registry versions of
`@appspine/integration-contracts@0.3.0` and `@appspine/domain-events@7.1.2` with no workspace or
file dependency, then run `npm test`.

For a private GitHub Packages registry, configure the token in a user-level npm configuration or
CI secret before running setup. Never commit a token or put one in this fixture.
